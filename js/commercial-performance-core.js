// MIZANE — Tendances et classement des performances commerciales.
import { buildCommercialMarginReport } from "./commercial-margin-core.js";

const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function buildCommercialPerformanceReport({
  invoices = [], creditNotes = [], movements = [], products = [],
  startDate, endDate, baseCurrency = "MAD",
} = {}) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { ok: false, errors: ["La période d'analyse est invalide."], monthly: [], rankings: {}, totalsByCurrency: {} };
  }
  const monthly = [];
  const totalsByCurrency = {};
  const productStats = new Map();
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthStart = cursor.toISOString().slice(0, 10);
    const monthEndDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const from = monthStart < startDate ? startDate : monthStart;
    const to = monthEnd > endDate ? endDate : monthEnd;
    const report = buildCommercialMarginReport({
      invoices, creditNotes, movements, products,
      startDate: from, endDate: to, baseCurrency,
    });
    if (!report.ok) return report;
    for (const currency of report.baseCurrencies) {
      const rows = report.rows.filter(row => row.currency === currency);
      const bucket = {
        month: monthStart.slice(0, 7), currency,
        revenue: round(rows.reduce((sum, row) => sum + row.revenue, 0)),
        cost: round(rows.reduce((sum, row) => sum + row.cost, 0)),
        margin: round(rows.reduce((sum, row) => sum + row.margin, 0)),
        units: round(rows.reduce((sum, row) => sum + row.units, 0)),
        invoices: new Set(rows.flatMap(row => row.invoiceIds || [])).size,
        incompleteLines: rows.reduce((sum, row) => sum + row.missingCostLines, 0),
      };
      bucket.marginRate = bucket.incompleteLines === 0 && bucket.revenue > 0 ? round(bucket.margin / bucket.revenue * 100) : null;
      monthly.push(bucket);
      const total = totalsByCurrency[currency] || { revenue: 0, cost: 0, margin: 0, units: 0, incompleteLines: 0 };
      total.revenue = round(total.revenue + bucket.revenue);
      total.cost = round(total.cost + bucket.cost);
      total.margin = round(total.revenue - total.cost);
      total.units = round(total.units + bucket.units);
      total.incompleteLines += bucket.incompleteLines;
      totalsByCurrency[currency] = total;
    }
    for (const row of report.rows) {
      const key = row.currency + "|" + row.productId;
      const current = productStats.get(key) || {
        productId: row.productId, productName: row.productName, sku: row.sku,
        currency: row.currency, revenue: 0, cost: 0, margin: 0,
        units: 0, invoices: 0, incompleteLines: 0,
      };
      current.revenue = round(current.revenue + row.revenue);
      current.cost = round(current.cost + row.cost);
      current.margin = round(current.revenue - current.cost);
      current.units = round(current.units + row.units);
      current.invoices += row.invoices;
      current.incompleteLines += row.missingCostLines;
      productStats.set(key, current);
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  for (const total of Object.values(totalsByCurrency)) {
    total.marginRate = total.incompleteLines === 0 && total.revenue > 0 ? round(total.margin / total.revenue * 100) : null;
  }
  const productsRanked = [...productStats.values()].map(row => ({
    ...row,
    marginRate: row.incompleteLines === 0 && row.revenue > 0 ? round(row.margin / row.revenue * 100) : null,
  }));
  const byCurrency = currency => productsRanked.filter(row => row.currency === currency);
  const currencies = Object.keys(totalsByCurrency);
  const rankings = Object.fromEntries(currencies.map(currency => {
    const rows = byCurrency(currency);
    return [currency, {
      byMargin: [...rows].sort((a, b) => b.margin - a.margin),
      byRevenue: [...rows].sort((a, b) => b.revenue - a.revenue),
      byMarginRate: rows.filter(row => row.marginRate !== null).sort((a, b) => b.marginRate - a.marginRate),
      incomplete: rows.filter(row => row.incompleteLines > 0),
    }];
  }));
  return { ok: true, startDate, endDate, monthly, totalsByCurrency, rankings, products: productsRanked.length };
}
