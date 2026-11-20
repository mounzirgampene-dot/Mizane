// MIZANE — Outils financiers purs : amortissements, rapprochement bancaire, clôture d'exercice.
import { trialBalance, round2 } from "./accounting.js";

export const AMORT_METHODS = { lineaire: "Linéaire", degressif: "Dégressif" };

export function degressifCoefficient(years) {
  if (years <= 3) return 1.25;
  if (years <= 4) return 1.5;
  if (years <= 5) return 1.75;
  if (years <= 6) return 2;
  return 2.25;
}

export function amortRate(years, method = "lineaire") {
  const r = 1 / Math.max(1, Number(years) || 1);
  return method === "degressif" ? Math.min(1, r * degressifCoefficient(Number(years) || 1)) : r;
}

export function amortizationSchedule(amount, years, method = "lineaire") {
  const n = Math.max(1, Math.round(Number(years) || 1));
  const rate = amortRate(n, method);
  const rows = [];
  let cumul = 0;
  for (let y = 1; y <= n; y++) {
    let annuite = method === "lineaire" ? round2(Number(amount) / n) : round2((amount - cumul) * rate);
    if (y === n || cumul + annuite > amount) annuite = round2(amount - cumul);
    cumul = round2(cumul + annuite);
    rows.push({ year: y, rate: Math.round(rate * 10000) / 100, annuite, cumul, vnc: round2(amount - cumul) });
  }
  return rows;
}

export function nextAnnuity(asset) {
  const done = Number(asset.amortized) || 0;
  if (done >= Number(asset.amount)) return 0;
  const sched = amortizationSchedule(Number(asset.amount), asset.years, asset.method);
  for (const row of sched) if (row.cumul > done) return row.annuite;
  return 0;
}

export function amortAccount(code) {
  return "28" + String(code).slice(1);
}

export function dotationLines(assets) {
  const lines = [];
  for (const a of assets) {
    const ann = nextAnnuity(a);
    if (!ann) continue;
    lines.push({ account: "681", label: "Dotation " + (a.name || a.account), debit: ann, credit: 0 });
    lines.push({ account: amortAccount(a.account), label: "Amort. " + (a.name || a.account), debit: 0, credit: ann });
  }
  return lines;
}

function normalizeDate(s) {
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return s;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function parseBankCSV(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^date/i.test(line)) continue;
    const cells = line.split(/[;\t]/).map((c) => c.trim());
    if (cells.length < 3) continue;
    const [date, label, amtRaw] = cells;
    if (!/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/.test(date)) continue;
    const amount = Number(String(amtRaw).replace(/\s/g, "").replace(",", "."));
    if (!isFinite(amount) || amount === 0) continue;
    out.push({ date: normalizeDate(date), label: label || "", amount: round2(amount) });
  }
  return out;
}

export function matchBankLines(store, bankLines, days = 4) {
  const cash = [];
  for (const e of store.entries || []) {
    // Exclure les écritures contrepassées et leurs contrepassations du rapprochement.
    if (e.reversed || e.reverseOf) continue;
    for (const l of e.lines || []) {
      if (!String(l.account).startsWith("5")) continue;
      const amount = round2((Number(l.debit) || 0) - (Number(l.credit) || 0));
      if (amount) cash.push({
        entryId: e.id, date: e.date, label: l.label || e.reference || "",
        account: String(l.account), amount, remaining: Math.abs(amount),
      });
    }
  }

  // Les montants déjà affectés sont déduits : une écriture peut ainsi recevoir
  // plusieurs règlements partiels, sans que le total affecté dépasse son montant.
  return bankLines.map((bankLine) => {
    const bankTime = Date.parse(bankLine.date);
    const bankAmount = round2(Number(bankLine.amount));
    const magnitude = Math.abs(bankAmount);
    const sameSign = cash
      .map((line, index) => ({ ...line, index, delta: Math.abs(Date.parse(line.date) - bankTime) }))
      .filter((line) => Math.sign(line.amount) === Math.sign(bankAmount) &&
        Number.isFinite(line.delta) && line.delta <= 30 * 86400000)
      .sort((a, b) => a.delta - b.delta || a.index - b.index);
    const exact = sameSign.filter(line => line.amount === bankAmount);
    const inWindow = sameSign.filter(line => line.delta <= days * 86400000 && line.remaining > 0);
    const allocations = [];
    const exactAvailable = inWindow.filter(line => Math.abs(line.remaining - magnitude) <= 0.001);
    const partialAvailable = inWindow.filter(line => line.remaining > magnitude + 0.001 && magnitude < line.remaining * 0.95);
    const totalAvailable = round2(inWindow.reduce((sum, line) => sum + line.remaining, 0));
    let selected = [];
    if (exactAvailable.length) {
      selected = [exactAvailable[0]];
    } else if (partialAvailable.length) {
      // Un seul règlement partiel est affecté à une seule écriture : pas de cumul arbitraire.
      selected = [partialAvailable[0]];
    } else if (Math.abs(totalAvailable - magnitude) <= 0.001 && inWindow.length > 1) {
      // Plusieurs écritures ne sont regroupées que si leur total correspond exactement au relevé.
      selected = inWindow;
    }

    let left = magnitude;
    for (const candidate of selected) {
      if (left <= 0.001) break;
      const current = cash[candidate.index];
      const allocated = round2(Math.min(current.remaining, left));
      if (allocated <= 0) continue;
      current.remaining = round2(current.remaining - allocated);
      left = round2(left - allocated);
      allocations.push({
        entryId: current.entryId, account: current.account, date: current.date,
        amount: allocated, remaining: current.remaining, originalAmount: Math.abs(current.amount),
      });
    }

    const matched = allocations.length > 0 && allocations.reduce((sum, item) => sum + item.amount, 0) + 0.001 >= magnitude;
    const first = allocations[0];
    const amountCandidates = matched ? [] : sameSign
      .filter(line => line.delta <= days * 86400000 && line.remaining > 0)
      .map(line => ({
        entryId: line.entryId, account: line.account, date: line.date,
        entryAmount: line.amount, difference: round2(Math.abs(Math.abs(line.amount) - magnitude)),
      }))
      .filter(candidate => candidate.difference > 0.001)
      .sort((a, b) => a.difference - b.difference)
      .slice(0, 3);

    return {
      ...bankLine,
      match: matched ? first.entryId : null,
      matchAccount: matched ? [...new Set(allocations.map(item => item.account))].join(", ") : null,
      matchDate: matched ? first.date : null,
      matches: matched ? allocations.map(({ remaining: _remaining, originalAmount: _originalAmount, ...item }) => item) : [],
      matchedAmount: matched ? magnitude : 0,
      partial: matched && allocations.some(item => item.remaining > 0.001),
      partialRemaining: matched ? round2(allocations.reduce((sum, item) => sum + item.remaining, 0)) : 0,
      candidates: [...new Set(exact.map((candidate) => candidate.entryId))],
      dateCandidates: [...new Set(exact.filter(candidate => candidate.delta > days * 86400000).map(candidate => candidate.entryId))],
      amountCandidates,
      status: matched ? "matched" : "unmatched",
    };
  });
}


// Diagnostic indicatif d'une opération non rapprochée. Ne remplace pas la vérification comptable.
export function diagnoseBankLine(line) {
  const label = String(line.label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/frais|commission|agios|tenue de compte/.test(label)) return { type: "bank_fee", label: "Frais ou commission bancaire", hint: "Charge bancaire à vérifier" };
  if (/interet crediteur|interets recus|produit financier/.test(label)) return { type: "financial_income", label: "Produit financier possible", hint: "Produit financier à vérifier" };
  if (/virement recu|versement|remise|encaissement|reglement client/.test(label) || Number(line.amount) > 0) return { type: "receipt", label: "Encaissement possible", hint: "Identifier le client ou le produit" };
  if (/achat|paiement|prelevement|retrait|fournisseur|loyer/.test(label) || Number(line.amount) < 0) return { type: "payment", label: "Décaissement possible", hint: "Identifier la charge ou le fournisseur" };
  return { type: "unknown", label: "Opération à qualifier", hint: "Choisir le compte de contrepartie" };
}
// Identifiant déterministe d'une ligne importée : empêche les doubles imports du même relevé.
export function bankLineKey(line) {
  const raw = [line.date, String(line.label || "").trim().toLocaleLowerCase(), round2(Number(line.amount) || 0)].join("|");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function reconcileBankLine(line, entryId, store) {
  const entry = (store.entries || []).find(e => Number(e.id) === Number(entryId));
  if (!entry || entry.reversed || entry.reverseOf) throw new Error("Écriture comptable introuvable ou contrepassée.");
  const candidates = [];
  for (const e of store.entries || []) {
    if (e.reversed || e.reverseOf) continue;
    for (const l of e.lines || []) {
      if (!String(l.account).startsWith("5")) continue;
      const amount = round2((Number(l.debit) || 0) - (Number(l.credit) || 0));
      if (amount === round2(Number(line.amount))) candidates.push({entryId:e.id, account:String(l.account)});
    }
  }
  const candidate = candidates.find(x => Number(x.entryId) === Number(entryId));
  if (!candidate) throw new Error("Cette écriture ne correspond pas au montant du relevé ou ne concerne pas un compte de trésorerie.");
  return { ...line, match:Number(entryId), matchAccount:candidate.account, status:"matched", manuallyMatched:true };
}

// Clôture : transfert des soldes des classes 6 et 7 au compte 12 (résultat),
// puis à-nouveaux : report des soldes des classes 1 à 5 au 1er jour du nouvel exercice.
export function closingProposal(store, start, end, newStart) {
  const tb = trialBalance(store, start, end);
  const closeLines = [];
  let solde67 = 0;
  for (const r of tb.rows) {
    if (!/^[67]/.test(r.code)) continue;
    const s = round2(r.debit - r.credit);
    if (!s) continue;
    closeLines.push({ account: r.code, label: r.label, debit: s < 0 ? -s : 0, credit: s > 0 ? s : 0 });
    solde67 = round2(solde67 + s);
  }
  if (closeLines.length) {
    closeLines.push({ account: "12", label: "Résultat de l'exercice", debit: solde67 < 0 ? -solde67 : 0, credit: solde67 > 0 ? solde67 : 0 });
  }
  const anewLines = [];
  const tb2 = trialBalance(store, "", end);
  for (const r of tb2.rows) {
    if (!/^[1-5]/.test(r.code)) continue;
    const s = round2(r.debit - r.credit);
    if (!s) continue;
    anewLines.push({ account: r.code, label: "À-nouveau " + r.label, debit: s > 0 ? s : 0, credit: s < 0 ? -s : 0 });
  }
  return {
    closing: closeLines.length ? { date: end, journal: "OD", reference: "Clôture " + end, lines: closeLines } : null,
    anew: anewLines.length ? { date: newStart, journal: "OD", reference: "À-nouveaux " + newStart, lines: anewLines } : null,
    resultat: round2(-solde67),
  };
}
