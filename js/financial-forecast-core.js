// MIZANE — Prévisions de trésorerie prudentes, exprimées dans la devise comptable.
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(text + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};
const monthKey = value => String(value).slice(0, 7);
const addDays = (date, days) => {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const currencyOf = (item, fallback) => String(item?.currency || fallback || "N/A").trim().toUpperCase() || "N/A";

export function groupFinancialAmounts(items = [], amountKey = "amount") {
  const totals = {};
  for (const item of Array.isArray(items) ? items : []) {
    const currency = currencyOf(item);
    const value = Number(item?.[amountKey]);
    if (!Number.isFinite(value)) continue;
    totals[currency] = round((totals[currency] || 0) + value);
  }
  return Object.fromEntries(Object.entries(totals).sort(([a], [b]) => a.localeCompare(b)));
}
function emptyExceptionSummary() { return { count: 0, amountByCurrency: {}, baseAmount: 0 }; }
function addException(summary, item, baseAmount = null) {
  summary.count += 1;
  const currency = currencyOf(item);
  const original = Number(item?.originalAmount);
  if (Number.isFinite(original) && original > 0) summary.amountByCurrency[currency] = round((summary.amountByCurrency[currency] || 0) + original);
  if (Number.isFinite(Number(baseAmount)) && Number(baseAmount) > 0) summary.baseAmount = round(summary.baseAmount + Number(baseAmount));
}

export function buildFinancialForecast({
  baseCurrency = "MAD", openingCash = 0, receivables = [], payables = [], manual = [],
  asOf = new Date().toISOString().slice(0, 10), horizons = [7, 30, 60, 90],
} = {}) {
  const currency = String(baseCurrency || "MAD").trim().toUpperCase();
  const opening = Number(openingCash);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(opening) || !validDate(asOf)) {
    return { ok: false, error: "Devise, trésorerie initiale ou date de référence invalide.", events: [], projections: [], monthly: [], receivablesByCurrency: {}, payablesByCurrency: {} };
  }
  const receivableRows = Array.isArray(receivables) ? receivables : [];
  const payableRows = Array.isArray(payables) ? payables : [];
  const events = [];
  const overdueReceivables = emptyExceptionSummary(), overduePayables = emptyExceptionSummary();
  const undatedReceivables = emptyExceptionSummary(), undatedPayables = emptyExceptionSummary();
  let unconvertedReceivables = 0, unconvertedPayables = 0, duplicateEvents = 0;
  const seen = new Set();

  const addDocumentEvent = (item, direction, source, overdueSummary, undatedSummary) => {
    const original = Number(item?.originalAmount), base = Number(item?.baseAmount);
    if (!validDate(item?.dueDate)) { addException(undatedSummary, item, Number.isFinite(base) ? base : null); return; }
    if (item.dueDate < asOf) { addException(overdueSummary, item, Number.isFinite(base) ? base : null); return; }
    if (!(Number.isFinite(original) && original > 0) || !(Number.isFinite(base) && base > 0)) {
      if (Number.isFinite(original) && original > 0) {
        if (source === "receivable") unconvertedReceivables += 1;
        else unconvertedPayables += 1;
      }
      return;
    }
    const id = String(item.id || item.number || source), key = source + ":" + id;
    if (seen.has(key)) { duplicateEvents += 1; return; }
    seen.add(key);
    events.push({
      id, date: item.dueDate,
      label: String(item.label || (direction === "in" ? "Encaissement client — " : "Décaissement fournisseur — ") + (item.customer || item.supplier || item.number || "Facture")),
      direction, amount: round(base), currency, source, originalAmount: round(original),
      sourceCurrency: currencyOf(item, currency), automatic: true,
    });
  };
  for (const item of receivableRows) addDocumentEvent(item, "in", "receivable", overdueReceivables, undatedReceivables);
  for (const item of payableRows) addDocumentEvent(item, "out", "payable", overduePayables, undatedPayables);

  for (const item of Array.isArray(manual) ? manual : []) {
    if (!validDate(item?.date) || item.date < asOf || !String(item?.label || "").trim() ||
      !(Number(item?.amount) > 0) || !Number.isFinite(Number(item?.amount)) || !["in", "out"].includes(item?.direction)) continue;
    if (currencyOf(item, currency) !== currency) continue;
    const id = String(item.id || "manual"), key = "manual:" + id;
    if (seen.has(key)) { duplicateEvents += 1; continue; }
    seen.add(key);
    events.push({ id, date: item.date, label: String(item.label), direction: item.direction,
      amount: round(item.amount), currency, source: "manual", originalAmount: round(item.amount), automatic: false });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const projections = [...new Set((Array.isArray(horizons) ? horizons : []).filter(day => Number.isInteger(day) && day >= 0 && day <= 365))]
    .sort((a, b) => a - b).map(days => {
      const date = addDays(asOf, days), eligible = events.filter(item => item.date <= date);
      const inflows = round(eligible.filter(item => item.direction === "in").reduce((sum, item) => sum + item.amount, 0));
      const outflows = round(eligible.filter(item => item.direction === "out").reduce((sum, item) => sum + item.amount, 0));
      const balance = round(opening + inflows - outflows);
      return { days, date, amount: balance, inflows, outflows, negative: balance < 0 };
    });

  const monthly = [];
  let closing = round(opening);
  const start = new Date(asOf + "T00:00:00Z");
  for (let index = 0; index < 6; index += 1) {
    const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const key = monthDate.toISOString().slice(0, 7), monthEvents = events.filter(item => monthKey(item.date) === key);
    const inflows = round(monthEvents.filter(item => item.direction === "in").reduce((sum, item) => sum + item.amount, 0));
    const outflows = round(monthEvents.filter(item => item.direction === "out").reduce((sum, item) => sum + item.amount, 0));
    closing = round(closing + inflows - outflows);
    monthly.push({ month: key, inflows, outflows, net: round(inflows - outflows), closing, negative: closing < 0 });
  }
  return {
    ok: true, asOf, baseCurrency: currency, openingCash: round(opening), events, projections, monthly,
    receivablesByCurrency: groupFinancialAmounts(receivableRows, "originalAmount"),
    payablesByCurrency: groupFinancialAmounts(payableRows, "originalAmount"),
    overdueReceivables, overduePayables, undatedReceivables, undatedPayables,
    unconvertedReceivables, unconvertedPayables, duplicateEvents,
    excludedReceivables: undatedReceivables.count + unconvertedReceivables,
    excludedPayables: undatedPayables.count + unconvertedPayables,
    hasNegativeProjection: projections.some(item => item.negative) || monthly.some(item => item.negative),
  };
}
