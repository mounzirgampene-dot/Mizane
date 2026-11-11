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
    let annuite = round2((amount - cumul) * rate);
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
  for (const e of store.entries) {
    for (const l of e.lines) {
      if (!String(l.account).startsWith("5")) continue;
      const amt = round2((Number(l.debit) || 0) - (Number(l.credit) || 0));
      if (amt) cash.push({ entryId: e.id, date: e.date, label: l.label, amount: amt });
    }
  }
  return bankLines.map((bl) => {
    const bt = Date.parse(bl.date);
    const ids = cash
      .filter((c) => Math.abs(c.amount - bl.amount) < 0.001 && Math.abs(Date.parse(c.date) - bt) <= days * 86400000)
      .map((c) => c.entryId);
    return { ...bl, match: ids.length ? ids[0] : null, candidates: [...new Set(ids)] };
  });
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
