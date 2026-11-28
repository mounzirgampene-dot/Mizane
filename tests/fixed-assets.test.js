import assert from "node:assert/strict";
import { buildFixedAssetSchedule, fixedAssetsSummary, validateFixedAsset } from "../js/fixed-assets-core.js";

const base = { name: "Véhicule", account: "2455", amount: 12000, residualValue: 2000, years: 5, method: "lineaire", date: "2024-01-01", amortized: 0 };
assert.equal(validateFixedAsset(base).ok, true);
const linear = buildFixedAssetSchedule(base);
assert.equal(linear.ok, true);
assert.equal(linear.rows.length, 5);
assert.equal(linear.totals.depreciable, 10000);
assert.equal(linear.totals.accumulated, 10000);
assert.equal(linear.totals.netBookValue, 2000);
assert.equal(linear.rows[0].depreciation, 2000);
assert.equal(linear.rows[4].netBookValue, 2000);

const declining = buildFixedAssetSchedule({ ...base, method: "degressif", residualValue: 0 });
assert.equal(declining.ok, true);
assert.equal(declining.totals.netBookValue, 0);
assert.equal(declining.totals.accumulated, 12000);
assert.ok(declining.rows[0].depreciation > declining.rows[4].depreciation);

assert.equal(validateFixedAsset({ ...base, residualValue: 12000 }).ok, false);
assert.equal(validateFixedAsset({ ...base, date: "2025-02-29" }).ok, false);
assert.equal(buildFixedAssetSchedule({ ...base, years: 0 }).ok, false);

const summary = fixedAssetsSummary([
  { ...base, amortized: 4000 },
  { ...base, name: "Ordinateur", amount: 3000, residualValue: 0, amortized: 1000 },
]);
assert.equal(summary.count, 2);
assert.equal(summary.grossValue, 15000);
assert.equal(summary.accumulated, 5000);
assert.equal(summary.netBookValue, 10000);
console.log("✓ Lot 18 — registre et amortissements des immobilisations");
