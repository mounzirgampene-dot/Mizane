// MIZANE — Calcul fiscal des factures fournisseurs à taux multiples.
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export function supplierInvoiceTaxBreakdown(invoice) {
  const errors = [];
  const fallbackRate = Number(invoice?.accounting?.taxRate ?? 0);
  if (!Number.isFinite(fallbackRate) || fallbackRate < 0 || fallbackRate > 100) errors.push("Taux de taxe fournisseur invalide (0 à 100 %).");
  const sourceLines = Array.isArray(invoice?.lines) && invoice.lines.length ? invoice.lines : [{ amount: Number(invoice?.total) || 0 }];
  const lines = sourceLines.map((line, index) => {
    const amount = Number.isFinite(Number(line.amount)) ? round2(Number(line.amount)) : round2(Number(line.quantity || 0) * Number(line.unitCost || 0));
    const specific = line.taxRate !== null && line.taxRate !== undefined && String(line.taxRate).trim() !== "";
    const taxRate = specific ? Number(line.taxRate) : fallbackRate;
    if (!Number.isFinite(amount) || amount < 0) errors.push("Montant HT invalide à la ligne " + (index + 1) + ".");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) errors.push("Taux de taxe invalide à la ligne " + (index + 1) + ".");
    return { ...line, amount, taxRate, taxAmount: round2(amount * (Number.isFinite(taxRate) ? taxRate : 0) / 100) };
  });
  const totalHT = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const totalTax = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const rates = [...new Set(lines.map(line => line.taxRate))];
  return { ok: errors.length === 0, errors: [...new Set(errors)], lines, totalHT, totalTax, payable: round2(totalHT + totalTax), uniformTaxRate: rates.length === 1 ? rates[0] : null, taxRates: rates };
}
