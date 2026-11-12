// MIZANE — Moteur comptable en partie double.
// Le store est un simple objet persisté (localStorage / export JSON).

export const JOURNALS = [
  { id: "ACH", name: "Journal des achats" },
  { id: "VTE", name: "Journal des ventes" },
  { id: "BAN", name: "Journal de banque" },
  { id: "CAI", name: "Journal de caisse" },
  { id: "OD", name: "Opérations diverses" },
];

export function newStore() {
  return {
    version: 1,
    settings: {
      companyName: "Ma société",
      country: "SN",
      plan: "syscohada",
      currency: "XOF",
      locale: "fr-SN",
      language: "fr",
      exerciceStart: new Date().getFullYear() + "-01-01",
      exerciceEnd: new Date().getFullYear() + "-12-31",
      aiKey: "",
      aiModel: "gemini-3.8-flash",
      aiEndpoint: "https://generativelanguage.googleapis.com/v1beta",
      customAccounts: [],
    },
    thirds: [],
    entries: [],
    assets: [],
    nextId: 1,
  };
}

export function accountMap(store) {
  const map = {};
  for (const a of store.settings.customAccounts) map[a.code] = a;
  return map;
}

export function resolveAccount(store, code) {
  const c = String(code || "").trim();
  if (!c) return null;
  const custom = store.settings.customAccounts.find((a) => a.code === c);
  if (custom) return custom;
  // imported lazily by caller? keep local fallback: caller passes plan accounts via cache
  return store.__accountCache ? store.__accountCache[c] || null : null;
}

export function buildAccountCache(store, planAccounts) {
  const cache = {};
  for (const a of planAccounts) cache[a.code] = a;
  store.__accountCache = cache;
}

export function accountLabel(store, code) {
  const custom = store.settings.customAccounts.find((a) => a.code === String(code));
  if (custom) return custom.label;
  const a = resolveAccount(store, code);
  return a ? a.label : "Compte inconnu";
}

export function accountType(store, code) {
  const custom = store.settings.customAccounts.find((a) => a.code === String(code));
  if (custom) return custom.type;
  const a = resolveAccount(store, code);
  return a ? a.type : null;
}

export function entryTotals(entry) {
  let debit = 0, credit = 0;
  for (const l of entry.lines || []) {
    debit += Number(l.debit) || 0;
    credit += Number(l.credit) || 0;
  }
  return { debit: round2(debit), credit: round2(credit) };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export const MAX_AMOUNT = 999999999999;

// Date réellement calendaire (rejette 2026-99-99, 2025-02-29…).
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateEntry(store, entry) {
  const errors = [];
  if (!entry.date) errors.push("La date est obligatoire.");
  else if (!validDate(entry.date)) errors.push("Date invalide (AAAA-MM-JJ, jour ou mois inexistant).");
  if (!entry.journal) errors.push("Le journal est obligatoire.");
  const lines = (entry.lines || []).filter((l) => l.account && (Number(l.debit) || Number(l.credit)));
  if (lines.length < 2) errors.push("Une écriture doit comporter au moins deux lignes comptabilisées.");
  for (const [i, l] of (entry.lines || []).entries()) {
    const num = (v) => (v === "" || v == null ? 0 : Number(v));
    const d = num(l.debit), c = num(l.credit);
    if (!l.account) errors.push(`Ligne ${i + 1} : compte manquant.`);
    else if (!accountType(store, l.account)) errors.push(`Ligne ${i + 1} : compte « ${l.account} » inconnu dans le plan.`);
    if (!Number.isFinite(d) || !Number.isFinite(c)) { errors.push(`Ligne ${i + 1} : montant invalide.`); continue; }
    if (d < 0 || c < 0) errors.push(`Ligne ${i + 1} : montants négatifs interdits.`);
    if (d > MAX_AMOUNT || c > MAX_AMOUNT) errors.push(`Ligne ${i + 1} : montant trop élevé (max 999 999 999 999).`);
    if (d > 0 && c > 0) errors.push(`Ligne ${i + 1} : débit et crédit simultanés interdits.`);
    if (d === 0 && c === 0) errors.push(`Ligne ${i + 1} : montant nul.`);
  }
  const t = entryTotals({ lines });
  if (lines.length >= 2 && Math.abs(t.debit - t.credit) > 0.001) {
    errors.push(`Écriture non équilibrée : débit ${t.debit} ≠ crédit ${t.credit}.`);
  }
  return { ok: errors.length === 0, errors, lines };
}

export function postEntry(store, entry) {
  const v = validateEntry(store, entry);
  if (!v.ok) return v;
  const e = {
    id: store.nextId++,
    date: entry.date,
    journal: entry.journal,
    reference: entry.reference || "",
    lines: v.lines.map((l) => ({
      account: String(l.account).trim(),
      label: l.label || "",
      third: l.third || "",
      debit: round2(Number(l.debit) || 0),
      credit: round2(Number(l.credit) || 0),
    })),
    reversed: false,
    reverseOf: entry.reverseOf || null,
    createdAt: new Date().toISOString(),
  };
  store.entries.push(e);
  return { ok: true, errors: [], entry: e };
}

export function reverseEntry(store, id) {
  const src = store.entries.find((e) => e.id === id);
  if (!src) return { ok: false, errors: ["Écriture introuvable."] };
  if (src.reversed) return { ok: false, errors: [`Écriture #${id} déjà contrepassée : opération refusée.`] };
  const rev = {
    date: new Date().toISOString().slice(0, 10),
    journal: src.journal,
    reference: "Contrepassation #" + src.id,
    reverseOf: src.id,
    lines: src.lines.map((l) => ({ account: l.account, label: l.label, third: l.third, debit: l.credit, credit: l.debit })),
  };
  const res = postEntry(store, rev);
  if (res.ok) src.reversed = true;
  return res;
}

export function entriesInRange(store, start, end) {
  return store.entries.filter((e) => (!start || e.date >= start) && (!end || e.date <= end));
}

export function trialBalance(store, start, end) {
  const rows = {};
  for (const e of entriesInRange(store, start, end)) {
    for (const l of e.lines) {
      if (!rows[l.account]) rows[l.account] = { code: l.account, label: accountLabel(store, l.account), debit: 0, credit: 0 };
      rows[l.account].debit += Number(l.debit) || 0;
      rows[l.account].credit += Number(l.credit) || 0;
    }
  }
  const list = Object.values(rows).sort((a, b) => a.code.localeCompare(b.code));
  let totD = 0, totC = 0, totSD = 0, totSC = 0;
  for (const r of list) {
    r.debit = round2(r.debit); r.credit = round2(r.credit);
    const solde = round2(r.debit - r.credit);
    r.soldeDebit = solde > 0 ? solde : 0;
    r.soldeCredit = solde < 0 ? -solde : 0;
    totD += r.debit; totC += r.credit; totSD += r.soldeDebit; totSC += r.soldeCredit;
  }
  return { rows: list, totals: { debit: round2(totD), credit: round2(totC), soldeDebit: round2(totSD), soldeCredit: round2(totSC) } };
}

export function ledger(store, accountCode, start, end) {
  const rows = [];
  let totD = 0, totC = 0;
  for (const e of entriesInRange(store, start, end)) {
    for (const l of e.lines) {
      if (String(l.account) !== String(accountCode)) continue;
      rows.push({ entryId: e.id, date: e.date, journal: e.journal, reference: e.reference, label: l.label || e.reference || "", third: l.third || "", debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
      totD += Number(l.debit) || 0;
      totC += Number(l.credit) || 0;
    }
  }
  return { rows, totals: { debit: round2(totD), credit: round2(totC), solde: round2(totD - totC) } };
}

export function incomeStatement(store, start, end) {
  const tb = trialBalance(store, start, end);
  const charges = [], produits = [];
  let totCharges = 0, totProduits = 0;
  for (const r of tb.rows) {
    const t = accountType(store, r.code);
    const solde = round2(r.debit - r.credit);
    if (t === "expense" && solde !== 0) { charges.push({ ...r, solde }); totCharges += solde; }
    if (t === "income" && solde !== 0) { produits.push({ ...r, solde: -solde }); totProduits += -solde; }
  }
  return { charges, produits, totCharges: round2(totCharges), totProduits: round2(totProduits), resultat: round2(totProduits - totCharges) };
}

export function balanceSheet(store, start, end) {
  const tb = trialBalance(store, start, end);
  const groups = {
    actif: { immobilisations: [], stocks: [], creances: [], tresorerie: [] },
    passif: { capitaux: [], dettes: [], tresorerie: [] },
  };
  let totActif = 0, totPassif = 0;
  for (const r of tb.rows) {
    const t = accountType(store, r.code);
    const solde = round2(r.debit - r.credit);
    if (solde === 0) continue;
    const c = String(r.code);
    if (t === "asset") {
      let g;
      if (c.startsWith("2")) g = "immobilisations";
      else if (c.startsWith("3")) g = "stocks";
      else if (c.startsWith("5")) g = "tresorerie";
      else g = "creances";
      groups.actif[g].push({ ...r, solde });
      totActif += solde;
    } else if (t === "liability") {
      const g = c.startsWith("5") ? "tresorerie" : "dettes";
      groups.passif[g].push({ ...r, solde: -solde });
      totPassif += -solde;
    } else if (t === "equity") {
      groups.passif.capitaux.push({ ...r, solde: -solde });
      totPassif += -solde;
    }
  }
  const is = incomeStatement(store, start, end);
  groups.passif.capitaux.push({ code: "—", label: "Résultat de l'exercice", solde: is.resultat });
  totPassif += is.resultat;
  return { ...groups, totActif: round2(totActif), totPassif: round2(totPassif), ecart: round2(totActif - totPassif), resultat: is.resultat };
}

export function checkAnomalies(store) {
  const warnings = [];
  const seen = new Map();
  for (const e of store.entries) {
    const t = entryTotals(e);
    if (Math.abs(t.debit - t.credit) > 0.001) warnings.push({ entryId: e.id, type: "desequilibre", message: `Écriture #${e.id} non équilibrée (${t.debit} / ${t.credit}).` });
    for (const l of e.lines) {
      if (!accountType(store, l.account)) warnings.push({ entryId: e.id, type: "compte_inconnu", message: `Écriture #${e.id} : compte « ${l.account} » absent du plan.` });
    }
    const key = e.date + "|" + e.journal + "|" + t.debit + "|" + t.credit + "|" + e.lines.map((l) => l.account + (l.debit || l.credit)).join(",");
    if (seen.has(key)) warnings.push({ entryId: e.id, type: "doublon", message: `Écriture #${e.id} identique à l'écriture #${seen.get(key)} (possible doublon).` });
    else seen.set(key, e.id);
  }
  return warnings;
}

export function cashBalance(store, start, end) {
  let total = 0;
  for (const e of entriesInRange(store, start, end)) {
    for (const l of e.lines) {
      const t = accountType(store, l.account);
      if (t === "asset" && String(l.account).startsWith("5")) total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    }
  }
  return round2(total);
}

export function toCSV(rows) {
  if (!rows.length) return "";
  const esc = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const head = Object.keys(rows[0]);
  return [head.join(";"), ...rows.map((r) => head.map((k) => esc(r[k])).join(";"))].join("\n");
}
