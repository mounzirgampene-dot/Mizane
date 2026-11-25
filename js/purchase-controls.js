// MIZANE — Contrôle préalable des commandes, réceptions et factures fournisseurs.
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((number(value) + Number.EPSILON) * 10000) / 10000;
const keyOf = line => String(line?.productId ?? "") + "::" + String(line?.warehouseId ?? "");
const baseQuantity = line => number(line?.baseQuantity ?? number(line?.quantity) * number(line?.factor || 1));
const baseUnitCost = line => number(line?.baseUnitCost ?? (number(line?.factor || 1) > 0 ? number(line?.unitCost) / number(line?.factor || 1) : line?.unitCost));

/**
 * Produit un rapport déterministe avant validation d'une facture fournisseur.
 * La fonction est pure : elle ne modifie ni documents, ni commandes, ni stock.
 */
export function buildSupplierInvoiceControlReport({
  documents = [],
  invoice = null,
  order = null,
  requireReceived = false,
  priceTolerance = 0.0001,
  quantityTolerance = 0.0001,
  totalTolerance = 0.01,
} = {}) {
  const errors = [];
  const warnings = [];
  const checks = [];
  const addError = (code, message) => errors.push({ code, message });
  const addWarning = (code, message) => warnings.push({ code, message });
  if (!invoice || invoice.type !== "invoice" || invoice.status === "cancelled") {
    addError("invoice_invalid", "Facture fournisseur absente ou annulée.");
    return { ok: false, errors, warnings, checks, summary: { lineCount: 0, totalHT: 0 } };
  }

  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  if (!lines.length) addError("empty_invoice", "La facture fournisseur ne comporte aucune ligne.");
  const totalHT = round(lines.reduce((sum, line) => sum + number(line?.quantity) * number(line?.unitCost), 0));
  if (!(number(invoice.total) > 0) || Math.abs(totalHT - number(invoice.total)) > totalTolerance) {
    addError("invoice_total_mismatch", "Le total HT de la facture ne correspond pas à la somme de ses lignes.");
  } else checks.push({ code: "invoice_total", status: "passed", message: "Le total HT correspond aux lignes de la facture." });

  const reference = String(invoice.reference || "").trim().toLocaleLowerCase();
  if (reference) {
    const duplicate = (Array.isArray(documents) ? documents : []).find(doc =>
      doc?.type === "invoice" &&
      doc.status !== "cancelled" &&
      String(doc.supplierId) === String(invoice.supplierId) &&
      String(doc.reference || "").trim().toLocaleLowerCase() === reference &&
      (invoice.id == null || String(doc.id) !== String(invoice.id))
    );
    if (duplicate) addError("duplicate_invoice", "Cette référence de facture fournisseur existe déjà pour ce fournisseur (" + String(duplicate.number || duplicate.id) + ").");
    else checks.push({ code: "duplicate_invoice", status: "passed", message: "Aucune facture active ne possède cette référence chez ce fournisseur." });
  }

  if (!invoice.orderId) {
    addWarning("unlinked_order", "Facture sans commande fournisseur liée : le contrôle commande-facture ne peut pas être effectué.");
  } else if (!order || order.type !== "order" || String(order.supplierId) !== String(invoice.supplierId)) {
    addError("order_invalid", "Commande fournisseur introuvable ou fournisseur incohérent.");
  } else {
    const goods = lines.filter(line => line?.lineType !== "service" && line?.lineType !== "fixed_asset");
    const invoiceTotals = new Map();
    const invoiceLines = new Map();
    for (const line of goods) {
      const key = keyOf(line);
      if (!line?.productId || !line?.warehouseId || !key || key === "::") {
        addError("line_reference_missing", "Une ligne de marchandise ne possède pas d'article ou d'entrepôt valide.");
        continue;
      }
      const matches = (order.lines || []).filter(item => keyOf(item) === key);
      if (!matches.length) {
        addError("line_not_ordered", "Rapprochement impossible : article ou entrepôt absent de la commande.");
        continue;
      }
      const invoiceCost = baseUnitCost(line);
      if (matches.some(item => Math.abs(baseUnitCost(item) - invoiceCost) > Math.max(0, number(priceTolerance)))) {
        addError("price_mismatch", "Rapprochement impossible : le coût unitaire diffère de la commande.");
      }
      invoiceTotals.set(key, round((invoiceTotals.get(key) || 0) + baseQuantity(line)));
      invoiceLines.set(key, line);
    }
    for (const [key, quantity] of invoiceTotals) {
      const orderLines = (order.lines || []).filter(item => keyOf(item) === key);
      const ordered = round(orderLines.reduce((sum, item) => sum + baseQuantity(item), 0));
      const received = round(orderLines.reduce((sum, item) => sum + number(item.receivedBase), 0));
      const alreadyInvoiced = round((documents || [])
        .filter(doc => doc?.type === "invoice" && String(doc.orderId) === String(order.id) && doc.status !== "cancelled" && (invoice.id == null || String(doc.id) !== String(invoice.id)))
        .flatMap(doc => doc.lines || [])
        .filter(line => line?.lineType !== "service" && line?.lineType !== "fixed_asset" && keyOf(line) === key)
        .reduce((sum, line) => sum + baseQuantity(line), 0));
      if (alreadyInvoiced + quantity > ordered + Math.max(0, number(quantityTolerance))) {
        addError("ordered_quantity_exceeded", "Rapprochement impossible : le cumul des factures dépasse la quantité commandée.");
      }
      if (requireReceived && quantity > received + Math.max(0, number(quantityTolerance))) {
        addError("received_quantity_exceeded", "Rapprochement bloqué : la quantité facturée dépasse la quantité physiquement reçue.");
      }
    }
    if (!errors.some(item => ["order_invalid", "line_not_ordered", "price_mismatch", "ordered_quantity_exceeded", "received_quantity_exceeded", "line_reference_missing"].includes(item.code))) {
      checks.push({ code: "order_match", status: "passed", message: "Articles, entrepôts, prix et quantités rapprochés avec la commande." });
    }
    if (lines.some(line => line?.lineType === "service" || line?.lineType === "fixed_asset")) {
      addWarning("non_stock_lines", "Les prestations et immobilisations sont contrôlées comptablement, mais ne sont pas rapprochées des quantités physiques de la commande.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
    summary: {
      lineCount: lines.length,
      goodsLineCount: lines.filter(line => line?.lineType !== "service" && line?.lineType !== "fixed_asset").length,
      totalHT,
      linkedOrder: Boolean(invoice.orderId),
      requireReceived: Boolean(requireReceived),
    },
  };
}
