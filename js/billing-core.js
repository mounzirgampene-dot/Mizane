// MIZANE — Fonctions métier pures de facturation internationale.
export const billingRound = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function calculateBillingTotals(lines = []) {
  const ht = billingRound(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0));
  const tax = billingRound(lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.taxRate || 0) / 100, 0));
  return { ht, tax, ttc: billingRound(ht + tax) };
}

export function convertBillingAmount(amount, exchangeRate) {
  const value = Number(amount), rate = Number(exchangeRate);
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) throw new Error("Montant ou taux de change invalide.");
  return billingRound(value * rate);
}

export function makeBillingNumber(kind, year, sequence, settings = {}) {
  const prefix = kind === "quote" ? (settings.prefixQuote || "DEV") : (settings.prefixInvoice || "FAC");
  const value = Number(sequence);
  if (!Number.isInteger(value) || value < 1) throw new Error("Numéro séquentiel invalide.");
  return prefix + "-" + String(year) + "-" + String(value).padStart(4, "0");
}

export function validateBillingDocument(document) {
  const errors = [];
  if (!document || typeof document !== "object") return { ok: false, errors: ["Document invalide."] };
  if (!["quote", "invoice"].includes(document.type)) errors.push("Type de document invalide.");
  const dateMatch = String(document.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) errors.push("Date invalide.");
  else { const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))); if (date.getUTCFullYear() !== Number(dateMatch[1]) || date.getUTCMonth() !== Number(dateMatch[2]) - 1 || date.getUTCDate() !== Number(dateMatch[3])) errors.push("Date invalide."); }
  if (!String(document.customerName || "").trim()) errors.push("Le client est obligatoire.");
  if (!/^[A-Z]{3}$/.test(String(document.currency || ""))) errors.push("Code devise ISO 4217 invalide.");
  if (!(Number(document.exchangeRate) > 0) || !Number.isFinite(Number(document.exchangeRate))) errors.push("Taux de change invalide.");
  if (!Array.isArray(document.lines) || document.lines.length === 0) errors.push("Au moins une ligne est obligatoire.");
  for (const [index, line] of (document.lines || []).entries()) {
    if (!String(line.description || "").trim()) errors.push("Ligne " + (index + 1) + " : description obligatoire.");
    if (!(Number(line.quantity) > 0) || !Number.isFinite(Number(line.quantity))) errors.push("Ligne " + (index + 1) + " : quantité invalide.");
    if (!(Number(line.unitPrice) >= 0) || !Number.isFinite(Number(line.unitPrice))) errors.push("Ligne " + (index + 1) + " : prix invalide.");
    if (!(Number(line.taxRate) >= 0) || !Number.isFinite(Number(line.taxRate))) errors.push("Ligne " + (index + 1) + " : taux de taxe invalide.");
  }
  return { ok: errors.length === 0, errors };
}

export function calculateOutstandingBase(documents = []) {
  return billingRound(documents.reduce((sum, document) => {
    if (document.type !== "invoice" || document.status === "cancelled") return sum;
    const outstanding = Math.max(0, Number(document.totals?.ttc || 0) - Number(document.paidAmount || 0));
    const rate = Number(document.exchangeRate);
    return sum + (Number.isFinite(rate) && rate > 0 ? outstanding * rate : 0);
  }, 0));
}


export function calculatePaymentBalance(total, payments = []) {
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return billingRound(Math.max(0, Number(total || 0) - paid));
}

export function validateBillingPayment(payment, invoice, existingPayments = []) {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status === "cancelled") errors.push("Facture introuvable ou annulée.");
  const match = String(payment?.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) errors.push("Date de paiement invalide.");
  else {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) errors.push("Date de paiement invalide.");
  }
  const amount = Number(payment?.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Le montant du paiement doit être supérieur à zéro.");
  if (!["bank", "cash", "mobile", "cheque", "card", "other"].includes(payment?.method)) errors.push("Mode de paiement invalide.");
  const balance = calculatePaymentBalance(invoice?.totals?.ttc, existingPayments);
  if (Number.isFinite(amount) && amount > balance + 0.001) errors.push("Le paiement dépasse le solde restant.");
  if (invoice?.currency && payment?.currency && payment.currency !== invoice.currency) errors.push("La devise du paiement doit correspondre à celle de la facture.");
  return { ok: errors.length === 0, errors, balance };
}
