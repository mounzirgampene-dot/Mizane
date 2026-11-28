// MIZANE — Validation et construction des plans comptables personnalisés.
const TYPES = new Set(["asset", "liability", "equity", "expense", "income"]);
const PLAN_ID = /^custom-[a-z0-9][a-z0-9-]{1,58}$/;
const ACCOUNT_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;

export function validateCustomPlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Plan personnalisé invalide.");
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim();
  if (!PLAN_ID.test(id)) throw new Error("Identifiant de plan personnalisé invalide.");
  if (!name || name.length > 100) throw new Error("Le nom du plan doit contenir de 1 à 100 caractères.");
  if (!Array.isArray(input.accounts) || input.accounts.length < 1 || input.accounts.length > 5000) throw new Error("Le plan doit contenir entre 1 et 5 000 comptes.");
  const seen = new Set();
  const accounts = input.accounts.map((row, index) => {
    if (!Array.isArray(row) || row.length < 3) throw new Error("Compte " + (index + 1) + " : format invalide.");
    const code = String(row[0] ?? "").trim();
    const label = String(row[1] ?? "").trim();
    const type = String(row[2] ?? "").trim();
    if (!ACCOUNT_CODE.test(code)) throw new Error("Compte " + (index + 1) + " : numéro invalide.");
    if (seen.has(code)) throw new Error("Le numéro de compte " + code + " est dupliqué.");
    if (!label || label.length > 180) throw new Error("Compte " + code + " : libellé obligatoire (180 caractères maximum).");
    if (!TYPES.has(type)) throw new Error("Compte " + code + " : type comptable inconnu.");
    seen.add(code);
    return [code, label, type];
  });
  return { id, name, description: String(input.description || "").trim().slice(0, 500), category: "custom-plan", status: "custom", official: false, basePlanId: String(input.basePlanId || "syscohada").trim(), version: String(input.version || "1.0.0").slice(0, 30), createdAt: String(input.createdAt || new Date().toISOString()), updatedAt: String(input.updatedAt || new Date().toISOString()), accounts };
}

export function validateCustomPlans(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 100) throw new Error("La collection des plans personnalisés est invalide (maximum 100 plans).");
  const ids = new Set();
  return input.map((plan) => {
    const valid = validateCustomPlan(plan);
    if (ids.has(valid.id)) throw new Error("Le plan " + valid.id + " est présent plusieurs fois.");
    ids.add(valid.id);
    return valid;
  });
}

export function createCustomPlan({ id, name, basePlanId, accounts, description = "" }) {
  return validateCustomPlan({ id, name, basePlanId, accounts, description, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}