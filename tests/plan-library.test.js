import assert from "node:assert/strict";
import { PLANS, OFFICIAL_PLANS, listPlans, allAccounts } from "../js/plans.js";

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
