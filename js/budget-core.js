// MIZANE — Calculs budgétaires : comparaison prudente des budgets et écritures comptabilisées.
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function validDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthKey(date) { return String(date).slice(0, 7); }

export function validateBudgetLines(lines) {
  const errors = [];
  const normalized = [];
  const seen = new Set();
  for (const [index, item] of (Array.isArray(lines) ? lines : []).entries()) {
    const account = String(item?.account || "").trim();
    const type = String(item?.type || "");
    const monthlyAmount = Number(item?.monthlyAmount);
    if (!/^\d{1,12}$/.test(account)) errors.push("Ligne " + (index + 1) + " : compte budgétaire invalide.");
    if (!["expense", "income"].includes(type)) errors.push("Ligne " + (index + 1) + " : nature budgétaire invalide.");
    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || monthlyAmount > 999999999999) errors.push("Ligne " + (index + 1) + " : le budget mensuel doit être positif et valide.");
    if (seen.has(account)) errors.push("Le compte " + account + " est budgété plusieurs fois.");
    for (const prior of normalized) {
      if (account.startsWith(prior.account) || prior.account.startsWith(account)) {
        errors.push("Les comptes " + account + " et " + prior.account + " se chevauchent : choisissez un seul niveau de détail.");
      }
    }
    if (account && ["expense", "income"].includes(type) && Number.isFinite(monthlyAmount) && monthlyAmount > 0) {
      seen.add(account);
      normalized.push({ account, type, monthlyAmount: round2(monthlyAmount), label: String(item?.label || account) });
    }
  }
  return { ok: errors.length === 0, errors, lines: normalized };
}

export function buildBudgetReport({ lines = [], entries = [], startDate, endDate, currency = "MAD" } = {}) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { ok: false, errors: ["La période budgétaire est invalide."], months: [], lines: [], totals: {} };
  }
  const validation = validateBudgetLines(lines);
  if (!validation.ok) return { ok: false, errors: validation.errors, months: [], lines: [], totals: {} };
  const months = [];
  const cursor = new Date(startDate + "T00:00:00Z");
  cursor.setUTCDate(1);
  while (cursor.toISOString().slice(0, 10) <= endDate) {
    const key = cursor.toISOString().slice(0, 7);
    const monthStart = key + "-01";
    const monthEndDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    if (monthEnd >= startDate && monthStart <= endDate) months.push({ key, label: key, budgetExpenses: 0, actualExpenses: 0, budgetIncome: 0, actualIncome: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const monthMap = new Map(months.map(item => [item.key, item]));
  const lineReports = validation.lines.map(item => {
    const monthly = months.map(month => ({ month: month.key, budget: item.monthlyAmount, actual: 0, variance: 0 }));
    return { ...item, budgetTotal: round2(item.monthlyAmount * months.length), actualTotal: 0, variance: 0, monthly };
  });
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!validDate(entry?.date) || entry.date < startDate || entry.date > endDate) continue;
    const month = monthMap.get(monthKey(entry.date));
    if (!month) continue;
    for (const line of Array.isArray(entry.lines) ? entry.lines : []) {
      const account = String(line?.account || "");
      const debit = Number(line?.debit || 0), credit = Number(line?.credit || 0);
      if (!/^\d{1,12}$/.test(account) || !Number.isFinite(debit) || !Number.isFinite(credit)) continue;
      for (const report of lineReports) {
        if (!account.startsWith(report.account)) continue;
        const actual = round2(report.type === "expense" ? debit - credit : credit - debit);
        const slot = report.monthly.find(item => item.month === month.key);
        slot.actual = round2(slot.actual + actual);
        report.actualTotal = round2(report.actualTotal + actual);
        if (report.type === "expense") month.actualExpenses = round2(month.actualExpenses + actual);
        else month.actualIncome = round2(month.actualIncome + actual);
      }
    }
  }
  for (const report of lineReports) {
    for (const slot of report.monthly) {
      slot.variance = round2(report.type === "expense" ? slot.budget - slot.actual : slot.actual - slot.budget);
      const month = monthMap.get(slot.month);
      if (report.type === "expense") month.budgetExpenses = round2(month.budgetExpenses + slot.budget);
      else month.budgetIncome = round2(month.budgetIncome + slot.budget);
    }
    report.variance = round2(report.type === "expense" ? report.budgetTotal - report.actualTotal : report.actualTotal - report.budgetTotal);
  }
  for (const month of months) {
    month.expenseVariance = round2(month.budgetExpenses - month.actualExpenses);
    month.incomeVariance = round2(month.actualIncome - month.budgetIncome);
    month.netBudget = round2(month.budgetIncome - month.budgetExpenses);
    month.netActual = round2(month.actualIncome - month.actualExpenses);
    month.netVariance = round2(month.netActual - month.netBudget);
  }
  const totals = months.reduce((sum, month) => ({
    budgetExpenses: round2(sum.budgetExpenses + month.budgetExpenses),
    actualExpenses: round2(sum.actualExpenses + month.actualExpenses),
    budgetIncome: round2(sum.budgetIncome + month.budgetIncome),
    actualIncome: round2(sum.actualIncome + month.actualIncome),
  }), { budgetExpenses: 0, actualExpenses: 0, budgetIncome: 0, actualIncome: 0 });
  totals.expenseVariance = round2(totals.budgetExpenses - totals.actualExpenses);
  totals.incomeVariance = round2(totals.actualIncome - totals.budgetIncome);
  totals.netBudget = round2(totals.budgetIncome - totals.budgetExpenses);
  totals.netActual = round2(totals.actualIncome - totals.actualExpenses);
  totals.netVariance = round2(totals.netActual - totals.netBudget);
  const alerts = [];
  for (const month of months) {
    if (month.actualExpenses > month.budgetExpenses + 0.01) alerts.push({ month: month.key, type: "expense_overrun", amount: round2(month.actualExpenses - month.budgetExpenses) });
    if (month.actualIncome + 0.01 < month.budgetIncome) alerts.push({ month: month.key, type: "income_shortfall", amount: round2(month.budgetIncome - month.actualIncome) });
  }
  return { ok: true, errors: [], currency: String(currency || "MAD").toUpperCase(), months, lines: lineReports, totals, alerts };
}
