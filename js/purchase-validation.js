// MIZANE — Contrôles métier des factures fournisseurs.
export function findDuplicateSupplierInvoice(documents, supplierId, supplierReference, exceptId = null) {
  const reference = String(supplierReference || "").trim().toLocaleLowerCase();
  if (!reference) return null;
  return (Array.isArray(documents) ? documents : []).find(document =>
    document?.type === "invoice" &&
    document.status !== "cancelled" &&
    String(document.supplierId) === String(supplierId) &&
    String(document.reference || "").trim().toLocaleLowerCase() === reference &&
    (exceptId == null || String(document.id) !== String(exceptId))
  ) || null;
}
