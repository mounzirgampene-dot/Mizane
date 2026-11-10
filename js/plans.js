// MIZANE — Plans comptables : index et fonctions utilitaires.
import { SYSCOHADA } from "./plans/syscohada.js";
import { PCG } from "./plans/pcg.js";
import { NCT } from "./plans/nct.js";
import { CGNC } from "./plans/cgnc.js";

export const PLANS = { syscohada: SYSCOHADA, pcg: PCG, nct: NCT, cgnc: CGNC };

export const ACCOUNT_TYPES = {
  asset: "Actif",
  liability: "Passif",
  equity: "Capitaux propres",
  expense: "Charge",
  income: "Produit",
};

export function getPlan(id) {
  return PLANS[id] || PLANS.syscohada;
}

export function allAccounts(planId) {
  const seen = new Set();
  const out = [];
  for (const [code, label, type] of getPlan(planId).accounts) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label, type });
  }
  return out;
}

export function findAccount(planId, code) {
  const c = String(code || "").trim();
  if (!c) return null;
  const accts = allAccounts(planId);
  let best = null;
  for (const a of accts) {
    if (a.code === c) return a;
    if (c.startsWith(a.code) && (!best || a.code.length > best.code.length)) best = a;
  }
  return best;
}

export function searchAccounts(planId, query, limit = 12) {
  const q = String(query || "").trim().toLowerCase();
  const accts = allAccounts(planId);
  if (!q) return accts.slice(0, limit);
  const res = accts.filter((a) => a.code.startsWith(q) || a.label.toLowerCase().includes(q));
  return res.slice(0, limit);
}
