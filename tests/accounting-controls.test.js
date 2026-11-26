import assert from "node:assert/strict";
import { newStore, buildAccountCache, postEntry } from "../js/accounting.js";
import { buildAccountingControlReport, accountingControlRows } from "../js/accounting-controls.js";

const store = newStore();
store.settings.exerciceStart = "2026-01-01";
store.settings.exerciceEnd = "2026-12-31";
buildAccountCache(store, [
  { code: "401", label: "Fournisseurs", type: "liability" },
  { code: "512", label: "Banque", type: "asset" },
  { code: "601", label: "Achats", type: "expense" },
]);
postEntry(store, { date: "2026-03-10", journal: "ACH", reference: "F-01", lines: [
  { account: "601", debit: 100, credit: 0, label: "Achat" },
  { account: "401", debit: 0, credit: 100, label: "Fournisseur" },
] });
postEntry(store, { date: "2026-03-11", journal: "BAN", reference: "R-01", lines: [
  { account: "401", debit: 100, credit: 0, label: "Règlement" },
  { account: "512", debit: 0, credit: 100, label: "Banque" },
] });
const report = buildAccountingControlReport(store);
assert.equal(report.totals.entries, 2);
assert.equal(report.totals.periodEntries, 2);
assert.equal(report.totals.balanced, true);
assert.equal(report.status, "conforme");
assert.equal(report.journals.length, 2);
assert.equal(report.warnings.length, 0);

const duplicate = structuredClone(store.entries[0]);
duplicate.id = 99;
store.entries.push(duplicate);
const duplicateReport = buildAccountingControlReport(store);
assert.ok(duplicateReport.warnings.some(item => item.type === "doublon" && item.entryId === 99));
assert.ok(accountingControlRows(duplicateReport).some(row => row.type === "doublon"));

const invalid = structuredClone(store.entries[1]);
invalid.id = 100;
invalid.journal = "XYZ";
invalid.lines[0].account = "9999";
invalid.lines[0].debit = 0;
invalid.lines[0].credit = 120;
invalid.lines[1].account = "512";
invalid.lines[1].debit = 0;
invalid.lines[1].credit = 0;
invalid.date = "2026-02-30";
store.entries.push(invalid);
const invalidReport = buildAccountingControlReport(store);
assert.ok(invalidReport.warnings.some(item => item.type === "date_invalide" && item.entryId === 100));
assert.ok(invalidReport.warnings.some(item => item.type === "journal_inconnu" && item.entryId === 100));
assert.ok(invalidReport.warnings.some(item => item.type === "compte_inconnu" && item.entryId === 100));
assert.ok(invalidReport.warnings.some(item => item.type === "desequilibre" && item.entryId === 100));

const rangeReport = buildAccountingControlReport(store, { start: "2026-03-10", end: "2026-03-10" });
assert.equal(rangeReport.totals.periodEntries, 1);
assert.ok(rangeReport.totals.outOfPeriodCount >= 1);
console.log("✓ Contrôles comptables : équilibre, journaux, doublons, dates, comptes et filtres de période.");
