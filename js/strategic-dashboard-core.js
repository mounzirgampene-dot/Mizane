// MIZANE — Synthèse stratégique : agrégats prudents, sans mélange de devises.
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const currencyOf = (doc, fallback) => String(doc?.currency || doc?.baseCurrency || fallback || "MAD").toUpperCase();

function documentAmount(doc) {
  return round(doc?.totals?.ttc ?? doc?.totals?.totalTTC ?? doc?.totalTTC ?? doc?.amountTTC ?? 0);
}

function documentBalance(doc) {
  const total = documentAmount(doc);
  const payments = Array.isArray(doc?.payments) ? doc.payments.reduce((sum, item) => sum + Number(item?.amount || 0), 0) : Number(doc?.paidAmount || 0);
  return round(Math.max(0, total - payments));
}

function groupDocuments(documents, fallbackCurrency) {
  const totals = {};
  for (const doc of Array.isArray(documents) ? documents : []) {
    const currency = currencyOf(doc, fallbackCurrency);
    totals[currency] = round((totals[currency] || 0) + documentAmount(doc));
  }
  return totals;
}

function stockQuantity(stock, product) {
  const warehouses = Array.isArray(stock?.warehouses) ? stock.warehouses : [];
  if (Array.isArray(stock?.cloudBalances)) {
    return round(stock.cloudBalances.filter(row => String(row.product_id) === String(product.id))
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0));
  }
  return round((Array.isArray(stock?.movements) ? stock.movements : []).reduce((sum, movement) => {
    if (String(movement.productId) !== String(product.id)) return sum;
    return sum + warehouses.reduce((warehouseSum, warehouse) => {
      if (movement.warehouseId === warehouse.id) return warehouseSum + Number(movement.quantityDelta || 0);
      if (movement.destinationWarehouseId === warehouse.id) return warehouseSum + Number(movement.quantity || 0);
      return warehouseSum;
    }, 0);
  }, 0));
}

export function buildStrategicDashboardSnapshot(store, asOf = new Date().toISOString().slice(0, 10)) {
  const currency = store?.settings?.currency || "MAD";
  const billingDocs = Array.isArray(store?.billing?.documents) ? store.billing.documents : [];
  const salesInvoices = billingDocs.filter(doc => doc?.type === "invoice" && !["draft", "cancelled"].includes(doc.status));
  const purchaseDocs = Array.isArray(store?.billing?.purchases?.documents) ? store.billing.purchases.documents : [];
  const purchaseInvoices = purchaseDocs.filter(doc => doc?.type === "invoice" && !["draft", "cancelled"].includes(doc.status));
  const overdueReceivables = salesInvoices.filter(doc => {
    const due = doc.dueDate || doc.date;
    return validDate(due) && due < asOf && documentBalance(doc) > 0;
  }).map(doc => ({
    number: String(doc.number || doc.id || ""),
    customer: String(doc.customerName || "Client non renseigné"),
    currency: currencyOf(doc, currency),
    balance: documentBalance(doc),
    dueDate: doc.dueDate || doc.date,
  }));
  const products = Array.isArray(store?.stock?.products) ? store.stock.products.filter(item => item && item.active !== false && item.type !== "service") : [];
  const lowStock = products.flatMap(product => {
    const threshold = Number(product.minimumStock ?? product.minStock ?? product.reorderPoint);
    if (!Number.isFinite(threshold) || threshold < 0) return [];
    const quantity = stockQuantity(store.stock, product);
    return quantity <= threshold ? [{ id: product.id, name: String(product.name || product.sku || product.id), quantity, threshold, unit: String(product.unit || "unité") }] : [];
  });
  return {
    asOf,
    sales: { invoices: salesInvoices.length, amountByCurrency: groupDocuments(salesInvoices, currency) },
    purchases: { invoices: purchaseInvoices.length, amountByCurrency: groupDocuments(purchaseInvoices, currency) },
    receivables: { overdue: overdueReceivables, overdueCount: overdueReceivables.length,
      overdueByCurrency: overdueReceivables.reduce((totals, item) => {
        totals[item.currency] = round((totals[item.currency] || 0) + item.balance);
        return totals;
      }, {}) },
    inventory: { products: products.length, lowStock },
  };
}
