import assert from "node:assert/strict";
import { buildMigrationAudit, migrationAuditRows } from "../js/plans/migration-audit.js";

const sourcePlan = { id: "source", accounts: [["401", "Fournisseurs", "liability"], ["402", "Autres fournisseurs", "liability"], ["600", "Achats", "expense"]] };
const targetPlan = { id: "target", accounts: [["4010", "Fournisseurs", "liability"], ["601", "Achats", "expense"], ["602", "Frais", "expense"]] };
const beforeEntries = [{ id: 1, lines: [
  { account: "401", debit: 0, credit: 100 },
  { account: "600", debit: 100, credit: 0 },
] }];
const mapping = { id: "m1", label: "Test", rules: [
  { relation: "exact", sourceCodes: ["401"], targetCodes: ["4010"] },
  { relation: "one-to-many", sourceCodes: ["600"], targetCodes: ["601", "602"], allocations: [
    { targetCode: "601", percent: 60 }, { targetCode: "602", percent: 40 },
  ] },
] };
const afterEntries = [{ id: 1, lines: [
  { account: "4010", debit: 0, credit: 100 },
  { account: "601", debit: 60, credit: 0 },
  { account: "602", debit: 40, credit: 0 },
] }];
const report = buildMigrationAudit({ beforeEntries, afterEntries, sourcePlan, targetPlan, mapping });
assert.equal(report.status, "conforme");
assert.equal(report.totalBalanced, true);
assert.equal(report.beforeTotals.debit, 100);
assert.equal(report.afterTotals.credit, 100);
assert.equal(report.differenceCount, 0);
assert.equal(report.accounts.find((row) => row.code === "601").expectedDebit, 60);
assert.equal(migrationAuditRows(report).length, 3);

const manyToOne = { ...mapping, rules: [
  { relation: "many-to-one", sourceCodes: ["401", "402"], targetCodes: ["4010"] },
] };
const manyToOneReport = buildMigrationAudit({
  beforeEntries: [{ id: 2, lines: [{ account: "401", debit: 30, credit: 100 }, { account: "402", debit: 70, credit: 0 }] }],
  afterEntries: [{ id: 2, lines: [{ account: "4010", debit: 100, credit: 100 }] }],
  sourcePlan, targetPlan, mapping: manyToOne,
});
assert.equal(manyToOneReport.status, "conforme");
assert.equal(manyToOneReport.accounts.find((row) => row.code === "4010").expectedDebit, 100);

const mismatch = buildMigrationAudit({
  beforeEntries,
  afterEntries: [{ id: 1, lines: [{ account: "4010", debit: 0, credit: 99 }, { account: "601", debit: 60, credit: 0 }, { account: "602", debit: 40, credit: 0 }] }],
  sourcePlan, targetPlan, mapping,
});
assert.equal(mismatch.status, "attention");
assert.ok(mismatch.differenceCount > 0);
const unmapped = buildMigrationAudit({
  beforeEntries, afterEntries: [], sourcePlan, targetPlan,
  mapping: { ...mapping, rules: [{ relation: "unmapped", sourceCodes: ["401"], targetCodes: [] }] },
});
assert.ok(unmapped.unmapped.length > 0);
assert.equal(unmapped.status, "attention");
console.log("✓ Audit comparatif : correspondances exactes, un-vers-plusieurs, plusieurs-vers-un, écarts et comptes non rapprochés.");
