// MIZANE — Préparation pure des affectations de réceptions fournisseur.
const quantity = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const lineKey = line => String(line.productId) + "::" + String(line.warehouseId);

/**
 * Prépare l'affectation d'une réception de facture à la commande liée.
 * Aucun document n'est muté : une erreur est retournée avant tout mouvement serveur.
 */
export function planSupplierInvoiceReceiptAllocation(order, invoice, receiptLines) {
  if (!invoice?.orderId) return { ok: true, allocations: [] };
  if (!order || order.type !== "order" || String(order.supplierId) !== String(invoice.supplierId)) {
    return { ok: false, error: "Commande fournisseur introuvable ou fournisseur incohérent.", allocations: [] };
  }
  const virtualReceived = new Map();
  const allocations = [];
  for (const receipt of receiptLines || []) {
    const invoiceLine = invoice.lines?.[Number(receipt.line_index)];
    const requested = quantity(receipt.quantity);
    if (!invoiceLine || !(requested > 0)) {
      return { ok: false, error: "Ligne de réception invalide ; aucun mouvement de stock n'a été envoyé.", allocations: [] };
    }
    const matches = (order.lines || []).filter(line => lineKey(line) === lineKey(invoiceLine));
    let remaining = requested;
    for (const orderLine of matches) {
      const alreadyPlanned = virtualReceived.get(orderLine) || 0;
      const capacity = Math.max(0, quantity(orderLine.baseQuantity) - quantity(orderLine.receivedBase) - alreadyPlanned);
      const allocated = Math.min(capacity, remaining);
      if (allocated > 0) {
        allocations.push({ orderLine, quantity: allocated });
        virtualReceived.set(orderLine, alreadyPlanned + allocated);
        remaining = Math.round((remaining - allocated + Number.EPSILON) * 10000) / 10000;
      }
      if (remaining <= 0.0001) break;
    }
    if (remaining > 0.0001) {
      return { ok: false, error: "La quantité reçue dépasse le reliquat de la commande liée. Aucun mouvement de stock n'a été envoyé.", allocations: [] };
    }
  }
  return { ok: true, allocations };
}
