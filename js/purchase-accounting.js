// MIZANE — Comptabilisation contrôlée des factures fournisseurs.
import { validateEntry } from "./accounting.js";
import { postBillingJournalEntriesAtomically } from "./billing-accounting.js";

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function accountsFor(store) {
  const values = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, account]) => ({ code, ...account })) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  return [...new Map(values.map(account => [String(account.code), account])).values()];
}

export function buildSupplierInvoiceJournalEntry(store, invoice, accountingMode = "perpetual") {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status === "cancelled") {
    return { ok: false, errors: ["Facture fournisseur absente ou annulée."], entries: [] };
  }
  const config = invoice.accounting || {};
  const mapping = config.accounts || {};
  const accounts = accountsFor(store);
  const accountMatchesPurpose = (account, key) => {
    const code = String(account.code || "");
    const label = String(account.label || "").toLocaleLowerCase();
    if (key === "supplier") return code.startsWith("4") && /fournisseur/.test(label);
    if (key === "stock") return code.startsWith("3") && /(stock|marchandise|matière|approvisionnement|produit)/.test(label);
    if (key === "purchases") return code.startsWith("6") && /(achat|charge)/.test(label);
    if (key === "inputVat") return /(tva.*(récupérable|déductible|acquisition|achats)|taxe.*récupérable|impôt.*récupérable)/.test(label);
    return true;
  };
  const requireAccount = (key, type, label) => {
    const code = String(mapping[key] || "").trim();
    if (!code || !accounts.some(account => String(account.code) === code && account.type === type && accountMatchesPurpose(account, key))) {
      errors.push("Compte " + label + " absent ou incompatible avec le plan comptable.");
      return "";
    }
    return code;
  };
  const supplier = requireAccount("supplier", "liability", "fournisseur (passif)");
  const stock = accountingMode === "periodic" ? "" : requireAccount("stock", "asset", "de stock (actif)");
  const purchases = accountingMode === "periodic" ? requireAccount("purchases", "expense", "d'achat (charge)") : "";
  const rate = Number(config.exchangeRate);
  const taxRate = Number(config.taxRate);
  if (!(rate > 0) || !Number.isFinite(rate)) errors.push("Taux de conversion fournisseur invalide.");
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) errors.push("Taux de taxe fournisseur invalide (0 à 100 %).");
  const sourceTotal = Number(invoice.total);
  if (!(sourceTotal > 0) || !Number.isFinite(sourceTotal)) errors.push("Le total HT de la facture doit être positif.");
  const baseHT = round2(sourceTotal * rate);
  const baseTax = round2(baseHT * taxRate / 100);
  const recoverable = config.taxRecoverable === true && baseTax > 0;
  const inputVat = recoverable ? requireAccount("inputVat", "asset", "de TVA récupérable (actif)") : "";
  const debitAmount = round2(baseHT + (recoverable ? 0 : baseTax));
  const payable = round2(baseHT + baseTax);
  if (errors.length) return { ok: false, errors: [...new Set(errors)], entries: [] };

  const reference = "ACHAT FOURNISSEUR " + String(invoice.number || invoice.id);
  if ((store.entries || []).some(entry => entry.reference === reference)) {
    return { ok: false, errors: ["Cette facture fournisseur possède déjà une écriture comptable."], entries: [] };
  }
  const costAccount = accountingMode === "periodic" ? purchases : stock;
  const lines = [
    { account: costAccount, label: (accountingMode === "periodic" ? "Achats" : "Entrée en stock") + " — " + invoice.number, third: "", debit: debitAmount, credit: 0 },
  ];
  if (recoverable) lines.push({ account: inputVat, label: "TVA récupérable — " + invoice.number, third: "", debit: baseTax, credit: 0 });
  lines.push({ account: supplier, label: "Dette fournisseur — " + invoice.number, third: String(invoice.supplierName || ""), debit: 0, credit: payable });
  const entry = { date: invoice.date, journal: "ACH", reference, lines };
  const validation = validateEntry(store, entry);
  if (!validation.ok) return { ok: false, errors: validation.errors, entries: [] };
  return { ok: true, errors: [], entries: [entry], summary: { baseHT, baseTax, payable, accountingMode, recoverable } };
}

export function postSupplierInvoiceJournalEntry(store, invoice, accountingMode = "perpetual") {
  const proposal = buildSupplierInvoiceJournalEntry(store, invoice, accountingMode);
  if (!proposal.ok) return { ...proposal, created: 0 };
  const posted = postBillingJournalEntriesAtomically(store, proposal.entries);
  return { ...posted, summary: proposal.summary };
}
