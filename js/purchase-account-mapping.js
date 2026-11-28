// MIZANE — Suggestions d’imputation fournisseur selon le plan comptable actif.
import { allAccounts, getPlan } from "./plans.js";

const KEYS = ["supplier", "stock", "purchases", "inputVat", "services", "fixedAssets"];
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

function scoreAccount(account, key) {
  const code = String(account.code || "");
  const label = normalize(account.label);
  const type = account.type;
  const first = code[0];
  if (!code || !label) return -1;
  if (key === "supplier") {
    if (first !== "4" || type !== "liability" || !label.includes("fournisseur")) return -1;
    return 100 + (label.trim() === "fournisseurs" ? 35 : 0) + (label.includes("comptes rattaches") ? 5 : 0);
  }
  if (key === "stock") {
    if (first !== "3" || type !== "asset" || /depreciation|provision/.test(label)) return -1;
    if (label.includes("marchandise")) return 120;
    if (label.includes("stock")) return 90;
    if (label.includes("matiere") || label.includes("approvisionnement")) return 65;
    return -1;
  }
  if (key === "purchases") {
    if (first !== "6" || type !== "expense") return -1;
    if (label.includes("achat") && label.includes("marchandise")) return 120;
    if (label.includes("achat") && /stocke|stockes/.test(label)) return 105;
    if (label.includes("achat")) return 75;
    if (label.includes("charge")) return 35;
    return -1;
  }
  if (key === "inputVat") {
    if (type !== "asset" || !label.includes("tva") || /facturee|collectee|a payer|a decaisser/.test(label)) return -1;
    if (/recuperable|deductible/.test(label)) return 125;
    if (/acquisition|achat/.test(label)) return 100;
    return -1;
  }
  if (key === "services") {
    if (first !== "6" || type !== "expense") return -1;
    if (label.includes("prestation")) return 125;
    if (label.includes("honoraire")) return 115;
    if (label.includes("services exterieurs")) return 105;
    if (label.includes("service")) return 80;
    return -1;
  }
  if (key === "fixedAssets") {
    if (first !== "2" || type !== "asset" || /amortissement|depreciation|provision/.test(label)) return -1;
    if (label.includes("immobilisations corporelles")) return 125;
    if (label.includes("materiel") || label.includes("equipement")) return 110;
    if (label.includes("immobilisation")) return 95;
    if (label.includes("construction") || label.includes("terrain")) return 70;
    return -1;
  }
  return -1;
}

export function suggestSupplierInvoiceAccounts(store, accountingMode = "perpetual") {
  const planId = String(store?.settings?.plan || "syscohada").toLowerCase();
  const plan = getPlan(planId);
  const candidates = new Map(allAccounts(planId).map(account => [String(account.code), account]));
  for (const [code, account] of Object.entries(store?.__accountCache || {})) candidates.set(String(code), { code: String(code), ...account });
  for (const account of store?.settings?.customAccounts || []) candidates.set(String(account.code), account);
  const accounts = {};
  const labels = {};
  const scores = {};
  for (const key of KEYS) {
    const ranked = [...candidates.values()]
      .map(account => ({ account, score: scoreAccount(account, key) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score || String(b.account.code).length - String(a.account.code).length || String(a.account.code).localeCompare(String(b.account.code)));
    if (ranked.length) {
      accounts[key] = String(ranked[0].account.code);
      labels[key] = String(ranked[0].account.label);
      scores[key] = ranked[0].score;
    } else {
      accounts[key] = "";
      labels[key] = "";
      scores[key] = 0;
    }
  }
  const missing = KEYS.filter(key => !accounts[key]);
  return { planId: plan.id, planName: plan.name, accountingMode, accounts, labels, scores, missing, complete: missing.length === 0 };
}
