// MIZANE — Échéances et ancienneté des dettes fournisseurs.
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((amount(value) + Number.EPSILON) * 100) / 100;
const validISODate = value => { const text=String(value||""); if(!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false; const date=new Date(text+"T00:00:00Z"); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===text; };

export function addSupplierPaymentTerms(invoiceDate, termsDays = 30) {
  if (!validISODate(invoiceDate)) return "";
  const days = Number(termsDays);
  if (!Number.isInteger(days) || days < 0 || days > 3650) return "";
  const date = new Date(invoiceDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function supplierPayableAge(invoice, asOf = new Date().toISOString().slice(0, 10)) {
  if (!invoice || !validISODate(asOf) || !validISODate(invoice.dueDate)) return null;
  const due = Date.parse(invoice.dueDate + "T00:00:00Z");
  const current = Date.parse(asOf + "T00:00:00Z");
  return Math.round((current - due) / 86400000);
}

export function classifySupplierPayable(invoice, asOf) {
  const balance = round(Math.max(0, amount(invoice?.balance)));
  const ageDays = supplierPayableAge(invoice, asOf);
  if (balance <= 0.001) return { bucket: "settled", ageDays, balance: 0 };
  if (ageDays === null) return { bucket: "undated", ageDays: null, balance };
  if (ageDays < 0) return { bucket: "upcoming", ageDays, balance };
  if (ageDays === 0) return { bucket: "due_today", ageDays, balance };
  if (ageDays <= 30) return { bucket: "overdue_1_30", ageDays, balance };
  if (ageDays <= 60) return { bucket: "overdue_31_60", ageDays, balance };
  if (ageDays <= 90) return { bucket: "overdue_61_90", ageDays, balance };
  return { bucket: "overdue_90_plus", ageDays, balance };
}

export function buildSupplierPayablesSchedule(invoices = [], asOf = new Date().toISOString().slice(0, 10)) {
  const buckets = {
    upcoming: { count: 0, amountByCurrency: {} },
    due_today: { count: 0, amountByCurrency: {} },
    overdue_1_30: { count: 0, amountByCurrency: {} },
    overdue_31_60: { count: 0, amountByCurrency: {} },
    overdue_61_90: { count: 0, amountByCurrency: {} },
    overdue_90_plus: { count: 0, amountByCurrency: {} },
    undated: { count: 0, amountByCurrency: {} },
  };
  const items = [];
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (invoice?.type !== "invoice" || invoice.status !== "validated" || !invoice.accountingPostedAt) continue;
    const state = classifySupplierPayable(invoice, asOf);
    if (state.bucket === "settled") continue;
    const currency = String(invoice.currency || "MAD").toUpperCase();
    const bucket = buckets[state.bucket];
    bucket.count += 1;
    bucket.amountByCurrency[currency] = round((bucket.amountByCurrency[currency] || 0) + state.balance);
    items.push({
      invoiceId: invoice.id,
      number: String(invoice.number || invoice.id || ""),
      supplierId: invoice.supplierId,
      supplierName: String(invoice.supplierName || ""),
      dueDate: validISODate(invoice.dueDate) ? invoice.dueDate : "",
      currency,
      balance: state.balance,
      bucket: state.bucket,
      ageDays: state.ageDays,
    });
  }
  items.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number);
  });
  return {
    asOf,
    buckets,
    items,
    totals: {
      invoices: items.length,
      overdue: items.filter(item => item.bucket.startsWith("overdue_")).length,
      dueToday: buckets.due_today.count,
      upcoming: buckets.upcoming.count,
    },
  };
}

export function supplierCashOutflowForecast(invoices = [], asOf = new Date().toISOString().slice(0, 10), horizonDays = 30) {
  const schedule = buildSupplierPayablesSchedule(invoices, asOf);
  const horizon = Number(horizonDays);
  if (!Number.isInteger(horizon) || horizon < 0 || horizon > 365) return { ok: false, error: "L’horizon doit être compris entre 0 et 365 jours." };
  const end = new Date(asOf + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + horizon);
  const endDate = end.toISOString().slice(0, 10);
  const totals = {};
  for (const item of schedule.items) {
    if (item.dueDate && item.dueDate >= asOf && item.dueDate <= endDate) {
      totals[item.currency] = round((totals[item.currency] || 0) + item.balance);
    }
  }
  return { ok: true, from: asOf, to: endDate, horizonDays: horizon, amountByCurrency: totals };
}
