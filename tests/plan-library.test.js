import assert from "node:assert/strict";
import { PLANS, OFFICIAL_PLANS, listPlans, allAccounts } from "../js/plans.js";
import { ACCOUNTING_FRAMEWORKS, getCountryAccountingFramework } from "../js/plans/frameworks.js";

assert.equal(Object.keys(OFFICIAL_PLANS).length, 4, "Les quatre référentiels existants doivent rester disponibles.");
assert.equal(listPlans().length, 8, "La bibliothèque doit contenir les quatre référentiels et quatre modèles sectoriels.");
for (const id of ["template-commerce", "template-services", "template-agriculture", "template-association"]) {
  const plan = PLANS[id];
  assert.ok(plan, `Plan manquant : ${id}`);
  assert.equal(plan.official, false, "Un modèle sectoriel ne doit pas être présenté comme officiel.");
  assert.equal(plan.status, "indicative");
  assert.ok(plan.accounts.length >= 20, "Chaque modèle doit fournir une base de comptes exploitable.");
  assert.ok(allAccounts(id).length > 0);
}
assert.equal(PLANS.syscohada.official, undefined, "Ne pas modifier les métadonnées historiques des référentiels existants.");
console.log("✓ Bibliothèque des plans comptables : 4 référentiels + 4 modèles sectoriels.");

assert.equal(Object.keys(ACCOUNTING_FRAMEWORKS).length, 5, "Cinq cadres nationaux doivent être documentés.");
for (const code of ["GB", "IN", "BR", "CA", "AU"]) {
  const framework = getCountryAccountingFramework(code);
  assert.ok(framework, `Cadre comptable manquant pour ${code}`);
  assert.equal(framework.status, "framework-verified");
  assert.ok(framework.authority && framework.sourceUrl, "Autorité et source officielle requises.");
  assert.ok(framework.note.includes("plan") || framework.standard.includes("plan") || framework.note.includes("Plan"), "La distinction cadre/plan doit être documentée.");
}
assert.equal(PLANS["uk-gaap"], undefined, "Un cadre de reporting ne doit pas être présenté comme un plan de comptes sans nomenclature vérifiée.");
console.log("✓ 5 cadres comptables nationaux documentés sans inventer de plans de comptes.");
