// MIZANE — Analyse des coûts d'achat et des marges commerciales.
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(text + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

export function buildCommercialMarginReport({
  invoices = [], creditNotes = [], movements = [], products = [],
  startDate, endDate, baseCurrency = "MAD",
} = {}) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return { ok: false, errors: ["La période d'analyse est invalide."], rows: [], totals: {} };
  }
  const productMap = new Map((Array.isArray(products) ? products : []).map(item => [String(item.id), item]));
  const movementsByDocument = new Map();
  for (const movement of Array.isArray(movements) ? movements : []) {
    const documentId = String(movement.document_id ?? movement.documentId ?? "");
    if (!documentId || Number(movement.quantity_delta ?? movement.quantityDelta ?? 0) >= 0) continue;
    const list = movementsByDocument.get(documentId) || [];
    list.push(movement);
    movementsByDocument.set(documentId, list);
  }
  const rows = new Map();
  const totals = { revenue: 0, cost: 0, margin: 0, units: 0, invoices: 0, missingCostLines: 0 };
  const includedInvoices = new Set();
  const notesByInvoice = new Map();
  for (const note of Array.isArray(creditNotes) ? creditNotes : []) {
    if (note?.type !== "credit_note" || note.sourceInvoiceId == null || !validDate(note.date) || note.date < startDate || note.date > endDate) continue;
    const key = String(note.sourceInvoiceId);
    const list = notesByInvoice.get(key) || [];
    list.push(note);
    notesByInvoice.set(key, list);
  }
  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (invoice?.type !== "invoice" || ["draft", "cancelled"].includes(invoice.status) || !validDate(invoice.date) || invoice.date < startDate || invoice.date > endDate) continue;
    const currency = String(invoice.baseCurrency || baseCurrency).toUpperCase();
    const rate = Number(invoice.exchangeRate || 1);
    if (!(rate > 0) || !Number.isFinite(rate)) continue;
    const docs = (invoice.stockDocuments || []).filter(doc => doc?.documentId != null);
    const invoiceMovements = docs.flatMap(doc => movementsByDocument.get(String(doc.documentId)) || []);
    const costsByProduct = new Map();
    for (const movement of invoiceMovements) {
      const productId = String(movement.product_id ?? movement.productId ?? "");
      const cost = Math.abs(Number(movement.value_delta ?? movement.valueDelta ?? 0));
      if (!productId || !Number.isFinite(cost)) continue;
      costsByProduct.set(productId, round((costsByProduct.get(productId) || 0) + cost));
    }
    const creditedLines = (notesByInvoice.get(String(invoice.id)) || []).flatMap(note => note.lines || []);
    const groupedLines = new Map();
    for (const line of Array.isArray(invoice.lines) ? invoice.lines : []) {
      const productId = String(line.stockProductId || "");
      if (!productId) continue;
      const quantity = Number(line.quantity || 0), unitPrice = Number(line.unitPrice || 0);
      if (!(quantity > 0) || !Number.isFinite(quantity) || !(unitPrice >= 0) || !Number.isFinite(unitPrice)) continue;
      const group = groupedLines.get(productId) || { quantity: 0, revenue: 0, description: line.description || "" };
      group.quantity += quantity;
      group.revenue += quantity * unitPrice * rate;
      groupedLines.set(productId, group);
    }
    for (const [productId, group] of groupedLines) {
      invoiceProductIds.add(productId);
      const creditHT = creditedLines.filter(item => String(item.stockProductId || "") === productId)
        .reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0)), 0);
      const revenue = Math.max(0, round(group.revenue - creditHT * rate));
      const cost = costsByProduct.get(productId) || 0;
      const key = currency + "|" + productId;
      const row = rows.get(key) || {
        productId, productName: String(productMap.get(productId)?.name || group.description || productId),
        sku: String(productMap.get(productId)?.sku || ""), currency,
        units: 0, revenue: 0, cost: 0, margin: 0, invoices: new Set(), missingCostLines: 0,
      };
      row.units = round(row.units + group.quantity);
      row.revenue = round(row.revenue + revenue);
      row.cost = round(row.cost + cost);
      row.margin = round(row.revenue - row.cost);
      row.invoices.add(String(invoice.id));
      if (!costsByProduct.has(productId)) row.missingCostLines += 1;
      rows.set(key, row);
    }
    if (invoiceProductIds.size) includedInvoices.add(String(invoice.id));
  }
  const resultRows = [...rows.values()].map(row => {
    const marginRate = row.revenue > 0 ? round(row.margin / row.revenue * 100) : null;
    totals.revenue = round(totals.revenue + row.revenue);
    totals.cost = round(totals.cost + row.cost);
    totals.units = round(totals.units + row.units);
    totals.invoices += row.invoices.size;
    totals.missingCostLines += row.missingCostLines;
    return { ...row, invoices: row.invoices.size, marginRate };
  }).sort((a, b) => b.margin - a.margin || a.productName.localeCompare(b.productName, "fr"));
  totals.margin = round(totals.revenue - totals.cost);
  totals.marginRate = totals.revenue > 0 ? round(totals.margin / totals.revenue * 100) : null;
  return { ok: true, startDate, endDate, rows: resultRows, totals, baseCurrencies: [...new Set(resultRows.map(row => row.currency))], includedInvoices: includedInvoices.size };
}
