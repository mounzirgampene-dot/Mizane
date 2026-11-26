// MIZANE — Balance âgée et suivi des créances clients.
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};
const daysBetween = (start, end) => Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000);
const bucketFor = days => days <= 0 ? "not_due" : days <= 30 ? "1_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "over_90";
export const RECEIVABLE_BUCKET_LABELS = { not_due: "À échéance / non échue", "1_30": "1 à 30 jours", "31_60": "31 à 60 jours", "61_90": "61 à 90 jours", over_90: "Plus de 90 jours" };

export function buildReceivablesReport({ documents = [], startDate = "", endDate = "", asOf = new Date().toISOString().slice(0, 10), baseCurrency = "MAD" } = {}) {
  if (!validDate(asOf) || (startDate && !validDate(startDate)) || (endDate && !validDate(endDate)) || (startDate && endDate && startDate > endDate)) {
    return { ok: false, errors: ["Période ou date de référence invalide."], rows: [], byCurrency: {}, byCustomer: [], totals: { invoices: 0, overdueInvoices: 0, outstandingBase: 0, overdueBase: 0 } };
  }
  const credits = new Map();
  for (const note of Array.isArray(documents) ? documents : []) {
    if (note?.type !== "credit_note" || ["cancelled", "draft"].includes(note.status) || note.sourceInvoiceId == null) continue;
    const id = String(note.sourceInvoiceId);
    credits.set(id, round2((credits.get(id) || 0) + Number(note.totals?.ttc || 0)));
  }
  const rows = [];
  for (const invoice of Array.isArray(documents) ? documents : []) {
    if (!invoice || invoice.type !== "invoice" || ["draft", "cancelled", "credited"].includes(invoice.status)) continue;
    const invoiceDate = String(invoice.date || "");
    if (!validDate(invoiceDate) || invoiceDate > asOf || (startDate && invoiceDate < startDate) || (endDate && invoiceDate > endDate)) continue;
    const gross = Number(invoice.totals?.ttc || 0);
    const payments = Array.isArray(invoice.payments) && invoice.payments.length
      ? invoice.payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0)
      : Number(invoice.paidAmount || 0);
    const credited = credits.get(String(invoice.id)) || 0;
    if (![gross, payments, credited].every(Number.isFinite) || gross < 0 || payments < 0 || credited < 0) continue;
    const outstanding = round2(Math.max(0, gross - Math.min(gross, credited) - Math.min(gross, payments)));
    if (outstanding <= 0.001) continue;
    const forecastDueDate = validDate(invoice.dueDate) ? invoice.dueDate : "";\n    const dueDateMissing = !forecastDueDate;\n    const dueDate = forecastDueDate || invoiceDate;
    const currency = String(invoice.currency || baseCurrency).toUpperCase();
    const rate = currency === String(baseCurrency).toUpperCase() ? 1 : Number(invoice.exchangeRate);
    const baseAmount = Number.isFinite(rate) && rate > 0 ? round2(outstanding * rate) : null;
    const overdueDays = Math.max(0, daysBetween(dueDate, asOf));
    rows.push({
      invoiceId: invoice.id, number: String(invoice.number || invoice.id || "Facture"),
      customer: String(invoice.customerName || "Client non renseigné"),
      invoiceDate, dueDate, forecastDueDate, dueDateMissing, currency, grossAmount: round2(gross),
      paidAmount: round2(Math.min(gross, payments)), creditedAmount: round2(Math.min(gross, credited)),
      outstandingAmount: outstanding, exchangeRate: Number.isFinite(rate) && rate > 0 ? rate : null,
      baseAmount, overdueDays, overdue: dueDate < asOf, bucket: bucketFor(overdueDays),
    });
  }
  rows.sort((a, b) => b.overdueDays - a.overdueDays || (b.baseAmount ?? b.outstandingAmount) - (a.baseAmount ?? a.outstandingAmount));
  const byCurrency = {};
  const customerMap = new Map();
  for (const row of rows) {
    const summary = byCurrency[row.currency] ||= { currency: row.currency, invoices: 0, outstanding: 0, overdue: 0, notDue: 0, buckets: { not_due: 0, "1_30": 0, "31_60": 0, "61_90": 0, over_90: 0 }, baseOutstanding: 0, baseOverdue: 0, unconverted: 0 };
    summary.invoices += 1;
    summary.outstanding = round2(summary.outstanding + row.outstandingAmount);
    summary.buckets[row.bucket] = round2(summary.buckets[row.bucket] + row.outstandingAmount);
    if (row.overdue) summary.overdue = round2(summary.overdue + row.outstandingAmount);
    else summary.notDue = round2(summary.notDue + row.outstandingAmount);
    if (row.baseAmount == null) summary.unconverted = round2(summary.unconverted + row.outstandingAmount);
    else {
      summary.baseOutstanding = round2(summary.baseOutstanding + row.baseAmount);
      if (row.overdue) summary.baseOverdue = round2(summary.baseOverdue + row.baseAmount);
    }
    const customerKey = row.customer + "|" + row.currency;
    const customer = customerMap.get(customerKey) || { customer: row.customer, currency: row.currency, invoices: 0, outstanding: 0, overdue: 0, oldestDueDate: row.dueDate, baseOutstanding: 0 };
    customer.invoices += 1;
    customer.outstanding = round2(customer.outstanding + row.outstandingAmount);
    if (row.overdue) customer.overdue = round2(customer.overdue + row.outstandingAmount);
    if (row.dueDate < customer.oldestDueDate) customer.oldestDueDate = row.dueDate;
    if (row.baseAmount != null) customer.baseOutstanding = round2(customer.baseOutstanding + row.baseAmount);
    customerMap.set(customerKey, customer);
  }
  return {
    ok: true, errors: [], rows,
    byCurrency: Object.fromEntries(Object.entries(byCurrency).sort(([a], [b]) => a.localeCompare(b))),
    byCustomer: [...customerMap.values()].sort((a, b) => b.baseOutstanding - a.baseOutstanding || b.outstanding - a.outstanding),
    bucketLabels: RECEIVABLE_BUCKET_LABELS,
    totals: {
      invoices: rows.length, overdueInvoices: rows.filter(row => row.overdue).length,
      outstandingBase: round2(rows.reduce((sum, row) => sum + (row.baseAmount ?? 0), 0)),
      overdueBase: round2(rows.reduce((sum, row) => sum + (row.overdue ? row.baseAmount ?? 0 : 0), 0)),
      unconvertedInvoices: rows.filter(row => row.baseAmount == null).length,
    },
  };
}