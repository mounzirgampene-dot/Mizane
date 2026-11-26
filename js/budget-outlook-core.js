// MIZANE — Analyse de rythme budgétaire et projection prudente de fin d'exercice.
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};

export function buildBudgetOutlook({ report, asOf } = {}) {
  if (!report?.ok || !Array.isArray(report.months) || !validDate(asOf)) {
    return { ok: false, errors: ["Rapport budgétaire ou date de référence invalide."], elapsedMonths: 0, remainingMonths: 0, totals: {}, lines: [], alerts: [] };
  }
  const months = report.months;
  const elapsed = months.filter(month => month.key <= asOf.slice(0, 7));
  const remaining = months.filter(month => month.key > asOf.slice(0, 7));
  if (!elapsed.length) return { ok: false, errors: ["La date de référence précède la période budgétaire."], elapsedMonths: 0, remainingMonths: months.length, totals: {}, lines: [], alerts: [] };
  const elapsedCount = elapsed.length;
  const remainingCount = remaining.length;
  const sum = key => round2(elapsed.reduce((total, month) => total + Number(month[key] || 0), 0));
  const totals = {};
  for (const [type, budgetKey, actualKey] of [
    ["expenses", "budgetExpenses", "actualExpenses"],
    ["income", "budgetIncome", "actualIncome"],
  ]) {
    const budgetToDate = sum(budgetKey);
    const actualToDate = sum(actualKey);
    const monthlyRunRate = round2(actualToDate / elapsedCount);
    const projectedYearEnd = round2(actualToDate + monthlyRunRate * remainingCount);
    const fullYearBudget = round2(months.reduce((total, month) => total + Number(month[budgetKey] || 0), 0));
    totals[type] = { budgetToDate, actualToDate, varianceToDate: round2(type === "expenses" ? budgetToDate - actualToDate : actualToDate - budgetToDate), monthlyRunRate, projectedYearEnd, fullYearBudget, projectedVariance: round2(type === "expenses" ? fullYearBudget - projectedYearEnd : projectedYearEnd - fullYearBudget) };
  }
  totals.net = { projectedYearEnd: round2(totals.income.projectedYearEnd - totals.expenses.projectedYearEnd), fullYearBudget: round2(totals.income.fullYearBudget - totals.expenses.fullYearBudget) };
  totals.net.projectedVariance = round2(totals.net.projectedYearEnd - totals.net.fullYearBudget);
  const lines = report.lines.map(line => {
    const actualToDate = round2((line.monthly || []).filter(slot => slot.month <= asOf.slice(0, 7)).reduce((total, slot) => total + Number(slot.actual || 0), 0));
    const runRate = round2(actualToDate / elapsedCount);
    const projectedYearEnd = round2(actualToDate + runRate * remainingCount);
    const projectedVariance = round2(line.type === "expense" ? line.budgetTotal - projectedYearEnd : projectedYearEnd - line.budgetTotal);
    const ratio = line.budgetTotal > 0 ? projectedYearEnd / line.budgetTotal : null;
    const severity = ratio == null ? "info" : line.type === "expense" ? (ratio > 1.1 ? "critical" : ratio > 1.02 ? "warning" : "ok") : (ratio < 0.9 ? "critical" : ratio < 0.98 ? "warning" : "ok");
    return { account: line.account, label: line.label, type: line.type, budgetTotal: line.budgetTotal, actualToDate, runRate, projectedYearEnd, projectedVariance, executionRatio: ratio, severity };
  });
  const alerts = lines.filter(line => ["critical", "warning"].includes(line.severity)).map(line => ({ account: line.account, label: line.label, type: line.type, severity: line.severity, projectedVariance: line.projectedVariance, executionRatio: line.executionRatio }));
  return { ok: true, errors: [], elapsedMonths: elapsedCount, remainingMonths: remainingCount, asOf, totals, lines, alerts, method: "Projection linéaire du rythme moyen constaté sur les mois écoulés ; elle ne constitue pas une prévision probabiliste." };
}
