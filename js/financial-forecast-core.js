// MIZANE — Prévisions financières : projections en devise de référence, sans conversion implicite.
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const text = String(value || "");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return false;
  const date = new Date(text + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};
const monthKey = value => String(value).slice(0, 7);
const addDays = (date, days) => {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function groupFinancialAmounts(items = [], amountKey = "amount") {
  const totals = {};
  for (const item of Array.isArray(items) ? items : []) {
    const currency = String(item?.currency || "N/A").trim().toUpperCase() || "N/A";
    const value = Number(item?.[amountKey]);
    if (!Number.isFinite(value)) continue;
    totals[currency] = round((totals[currency] || 0) + value);
  }
  return totals;
}

export function buildFinancialForecast({
  baseCurrency = "MAD",
  openingCash = 0,
  receivables = [],
  manual = [],
  asOf = new Date().toISOString().slice(0, 10),
  horizons = [30, 60, 90],
} = {}) {
  const currency = String(baseCurrency || "MAD").trim().toUpperCase();
  const opening = Number(openingCash);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(opening) || !validDate(asOf)) {
    return { ok: false, error: "Devise, trésorerie initiale ou date de référence invalide.", events: [], projections: [], monthly: [], receivablesByCurrency: {} };
  }
  const events = [];
  let excludedReceivables = 0;
  for (const item of Array.isArray(receivables) ? receivables : []) {
    if (!validDate(item?.dueDate) || item.dueDate < asOf || !(Number(item?.baseAmount) >= 0) || !Number.isFinite(Number(item?.baseAmount))) {
      if (item && Number(item?.amount) > 0 && (!validDate(item?.dueDate) || item.dueDate >= asOf)) excludedReceivables += 1;
      continue;
    }
    events.push({
      id: String(item.id || item.number || "receivable"),
      date: item.dueDate,
      label: String(item.label || ("Encaissement client — " + (item.customer || item.number || "Facture"))),
      direction: "in",
      amount: round(item.baseAmount),
      currency: String(item.currency || currency).toUpperCase(),
      originalAmount: round(item.originalAmount ?? item.baseAmount),
      automatic: true,
    });
  }
  for (const item of Array.isArray(manual) ? manual : []) {
    if (!validDate(item?.date) || item.date < asOf || !String(item?.label || "").trim() ||
      !(Number(item?.amount) > 0) || !Number.isFinite(Number(item?.amount)) ||
      !["in", "out"].includes(item?.direction)) continue;
    const manualCurrency = String(item.currency || currency).toUpperCase();
    if (manualCurrency !== currency) continue;
    events.push({
      id: String(item.id || "manual"),
      date: item.date,
      label: String(item.label),
      direction: item.direction,
      amount: round(item.amount),
      currency,
      originalAmount: round(item.amount),
      automatic: false,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const projections = (Array.isArray(horizons) ? horizons : []).filter(day => Number.isInteger(day) && day >= 0 && day <= 365)
    .map(days => {
      const date = addDays(asOf, days);
      const netFlows = events.filter(item => item.date <= date)
        .reduce((sum, item) => sum + (item.direction === "in" ? item.amount : -item.amount), 0);
      return { days, date, amount: round(opening + netFlows), inflows: round(events.filter(item => item.date <= date && item.direction === "in").reduce((sum, item) => sum + item.amount, 0)), outflows: round(events.filter(item => item.date <= date && item.direction === "out").reduce((sum, item) => sum + item.amount, 0)) };
    });
  const monthly = [];
  let closing = round(opening);
  const start = new Date(asOf + "T00:00:00Z");
  for (let index = 0; index < 6; index += 1) {
    const monthDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    const key = monthDate.toISOString().slice(0, 7);
    const monthEvents = events.filter(item => monthKey(item.date) === key);
    const inflows = round(monthEvents.filter(item => item.direction === "in").reduce((sum, item) => sum + item.amount, 0));
    const outflows = round(monthEvents.filter(item => item.direction === "out").reduce((sum, item) => sum + item.amount, 0));
    closing = round(closing + inflows - outflows);
    monthly.push({ month: key, inflows, outflows, net: round(inflows - outflows), closing });
  }
  return {
    ok: true,
    asOf,
    baseCurrency: currency,
    openingCash: round(opening),
    events,
    projections,
    monthly,
    receivablesByCurrency: groupFinancialAmounts(receivables, "originalAmount"),
    excludedReceivables,
  };
}
