import assert from "node:assert/strict";
import { createCustomPlan, validateCustomPlan, validateCustomPlans } from "../js/plans/custom.js";
import { validateBackup } from "../js/db.js";
import { newStore } from "../js/accounting.js";
import { validateSyncStore } from "../js/accounting-sync.js";

const base = {
  id: "custom-test-company",
  name: "Plan de test",
  basePlanId: "syscohada",
  description: "Plan propre à une entreprise",
  accounts: [
    ["101", "Capital social", "equity"],
    ["512", "Banque", "asset"],
    ["701", "Ventes", "income"],
  ],
};
const plan = createCustomPlan(base);
assert.equal(plan.official, false);
assert.equal(plan.category, "custom-plan");
assert.equal(plan.accounts.length, 3);
assert.throws(() => validateCustomPlan({ ...base, accounts: [...base.accounts, ["101", "Doublon", "equity"]] }), /dupliqué/);
assert.throws(() => validateCustomPlan({ ...base, accounts: [["X1", "Compte invalide", "other"]] }), /type comptable inconnu/);
assert.throws(() => validateCustomPlans([plan, plan]), /présent plusieurs fois/);

const backup = validateBackup({
  version: 1,
  settings: { customPlans: [plan], customAccounts: [] },
  entries: [],
  nextId: 1,
});
assert.equal(backup.settings.customPlans[0].id, plan.id);

const store = newStore();
store.settings.plan = plan.id;
store.settings.customPlans = [plan];
assert.deepEqual(validateSyncStore(store), [], "Un plan personnalisé actif doit être valide pour la synchronisation.");
console.log("✓ Plans personnalisés : validation, sauvegarde, import et synchronisation.");
