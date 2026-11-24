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


export function validateSupplierInvoiceMetadata(input = {}) {
  const errors = [];
  if (!String(input.reference || "").trim()) errors.push("La référence de la facture fournisseur est obligatoire.");
  const match = String(input.date || "").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!match) errors.push("La date de la facture fournisseur est invalide.");
  else {
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() !== Number(match[2]) - 1 || parsed.getUTCDate() !== Number(match[3])) errors.push("La date de la facture fournisseur est invalide.");
  }
  if (!/^[A-Z]{3}$/.test(String(input.currency || "").trim().toUpperCase())) errors.push("La devise doit être renseignée au format ISO 4217 à trois lettres.");
  return { ok: errors.length === 0, errors };
}
