import assert from "node:assert/strict";
import { documentFactsFromProposal, isSupportedDocumentFile, matchDocumentToRecords } from "../js/ai-documents.js";

assert.equal(isSupportedDocumentFile({ type: "application/pdf", name: "invoice.pdf" }), true);
assert.equal(isSupportedDocumentFile({ type: "image/jpeg", name: "invoice.jpg" }), true);
assert.equal(isSupportedDocumentFile({ type: "application/x-msdownload", name: "invoice.exe" }), false);

const facts = documentFactsFromProposal({
  date: "2026-11-25",
  reference: "FAC-2026-18",
  lines: [{ debit: 1180, credit: 0 }, { debit: 0, credit: 1180 }],
  aiReview: { documentFacts: { date: "2026-11-25", total: 1180, currency: "MAD", reference: "FAC-2026-18", counterparty: "Fournisseur Atlas" } },
}, "MAD");
assert.deepEqual(facts, {
  date: "2026-11-25", total: 1180, currency: "MAD",
  reference: "FAC-2026-18", counterparty: "Fournisseur Atlas",
});

const store = {
  settings: {
    currency: "MAD",
    bankReconciliations: [{
      id: "bank-1", sourceFile: "releve-novembre.csv",
      lines: [
        { date: "2026-11-26", label: "Virement FOURNISSEUR ATLAS FAC-2026-18", amount: -1180, currency: "MAD", status: "unmatched" },
        { date: "2026-11-26", label: "Paiement autre fournisseur", amount: -1180, currency: "EUR", status: "unmatched" },
        { date: "2026-11-26", label: "Virement Atlas", amount: -900, currency: "MAD", status: "matched", match: 4 },
      ],
    }],
  },
  entries: [
    { id: 10, date: "2026-11-25", reference: "FAC-2026-18", lines: [
      { account: "601", label: "Achats Fournisseur Atlas", debit: 1000, credit: 0, currency: "MAD" },
      { account: "3455", label: "TVA", debit: 180, credit: 0, currency: "MAD" },
      { account: "441", label: "Fournisseur Atlas", debit: 0, credit: 1180, currency: "MAD" },
    ] },
    { id: 11, date: "2026-11-25", reference: "Autre devise", lines: [{ account: "601", debit: 0, credit: 1180, currency: "EUR" }] },
    { id: 12, date: "2026-11-25", reference: "Annulée", reversed: true, lines: [{ account: "601", debit: 1180, credit: 0, currency: "MAD" }] },
    { id: 13, date: "2026-09-01", reference: "Trop ancienne", lines: [{ account: "601", debit: 1180, credit: 0, currency: "MAD" }] },
  ],
};
const matches = matchDocumentToRecords(facts, store);
assert.equal(matches.entryMatches.length, 1);
assert.equal(matches.entryMatches[0].entryId, 10);
assert.ok(matches.entryMatches[0].confidence >= 90);
assert.equal(matches.bankMatches.length, 1);
assert.equal(matches.bankMatches[0].sourceFile, "releve-novembre.csv");
assert.equal(matches.bankMatches[0].status, "unmatched");

const noAmount = matchDocumentToRecords({ date: "2026-11-25", currency: "MAD" }, store);
assert.equal(noAmount.entryMatches.length, 0);
assert.equal(noAmount.bankMatches.length, 0);
const wrongCurrency = matchDocumentToRecords({ ...facts, currency: "USD" }, store);
assert.equal(wrongCurrency.entryMatches.length, 0);
assert.equal(wrongCurrency.bankMatches.length, 0);

console.log("✓ Documents IA : formats, faits extraits, correspondances comptables et bancaires, dates et devises.");
