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
const outlook = buildBudgetOutlook({ report, asOf: "2026-03-15" });
assert.equal(outlook.ok, true);
assert.equal(outlook.elapsedMonths, 3);
assert.equal(outlook.remainingMonths, 1);
assert.equal(outlook.totals.expenses.projectedYearEnd, 400);
assert.equal(outlook.totals.income.projectedYearEnd, 800);
assert.equal(outlook.totals.net.projectedYearEnd, 400);
assert.equal(outlook.lines[0].severity, "ok");
assert.equal(outlook.method.includes("linéaire"), true);
assert.equal(buildBudgetOutlook({ report, asOf: "bad" }).ok, false);
assert.equal(buildBudgetOutlook({ report: { ok: false }, asOf: "2026-03-15" }).ok, false);
console.log("✓ Projection budgétaire : rythme, reste à courir, alertes et validation des dates.");
