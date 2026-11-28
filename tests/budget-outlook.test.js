import { strict as assert } from "node:assert";
import { buildBudgetOutlook } from "../js/budget-outlook-core.js";

const report = {
  ok: true,
  months: [
    { key: "2026-01", budgetExpenses: 100, actualExpenses: 120, budgetIncome: 200, actualIncome: 180 },
    { key: "2026-02", budgetExpenses: 100, actualExpenses: 80, budgetIncome: 200, actualIncome: 220 },
    { key: "2026-03", budgetExpenses: 100, actualExpenses: 100, budgetIncome: 200, actualIncome: 200 },
    { key: "2026-04", budgetExpenses: 100, actualExpenses: 0, budgetIncome: 200, actualIncome: 0 },
  ],
  lines: [
    { account: "601", label: "Achats", type: "expense", budgetTotal: 400, monthly: [
      { month: "2026-01", actual: 120 }, { month: "2026-02", actual: 80 }, { month: "2026-03", actual: 100 }, { month: "2026-04", actual: 0 },
    ] },
    { account: "701", label: "Ventes", type: "income", budgetTotal: 800, monthly: [
      { month: "2026-01", actual: 180 }, { month: "2026-02", actual: 220 }, { month: "2026-03", actual: 200 }, { month: "2026-04", actual: 0 },
    ] },
  ],
};
const entries = [
  { date: "2026-01-15", lines: [{ account: "601", debit: 120 }, { account: "701", credit: 180 }] },
  { date: "2026-02-15", lines: [{ account: "601", debit: 80 }, { account: "701", credit: 220 }] },
  { date: "2026-03-15", lines: [{ account: "601", debit: 100 }, { account: "701", credit: 200 }] },
  { date: "2026-04-10", lines: [{ account: "601", debit: 10000 }, { account: "701", credit: 10000 }] },
];
const outlook = buildBudgetOutlook({ report, entries, startDate: "2026-01-01", asOf: "2026-03-15" });
assert.equal(outlook.ok, true);
assert.equal(outlook.elapsedMonths, 3);
assert.equal(outlook.remainingMonths, 1);
assert.equal(outlook.totals.expenses.projectedYearEnd, 400);
assert.equal(outlook.totals.income.projectedYearEnd, 800);
assert.equal(outlook.totals.net.projectedYearEnd, 400);
assert.equal(outlook.lines[0].severity, "ok");
assert.equal(outlook.lines[0].actualToDate, 300);
assert.equal(outlook.lines[1].actualToDate, 600);
assert.equal(outlook.method.includes("linéaire"), true);
assert.equal(buildBudgetOutlook({ report, entries, startDate: "2026-01-01", asOf: "bad" }).ok, false);
assert.equal(buildBudgetOutlook({ report: { ok: false }, entries, startDate: "2026-01-01", asOf: "2026-03-15" }).ok, false);
console.log("✓ Projection budgétaire : rythme, reste à courir, alertes et validation des dates.");
