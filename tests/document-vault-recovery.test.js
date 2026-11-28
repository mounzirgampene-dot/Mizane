import assert from "node:assert/strict";
import {
  LEGACY_DOCUMENT_VAULTS,
  summarizeLegacyDocumentRecord,
  validateLegacyRecoverySelection,
  assertLegacyRecoveryConfirmation,
} from "../js/document-vault-recovery.js";

assert.equal(LEGACY_DOCUMENT_VAULTS.accounting, "mizane_accounting_documents_v1");
assert.equal(LEGACY_DOCUMENT_VAULTS.tax, "mizane_tax_evidence_v1");
const summary = summarizeLegacyDocumentRecord({
  id: "legacy-1",
  fileName: "facture.pdf",
  mimeType: "application/pdf",
  size: 2048,
  entryIds: [3, 4, 3],
  blob: new Blob(["pdf"]),
});
assert.equal(summary.id, "legacy-1");
assert.deepEqual(summary.entryIds, [3, 4]);
assert.equal(summary.hasBlob, true);
assert.equal(summary.size, 2048);
assert.equal("blob" in summary, false);
assert.deepEqual(validateLegacyRecoverySelection(["a", "a", "b"], ["a", "b"]), ["a", "b"]);
assert.throws(() => validateLegacyRecoverySelection(["missing"], ["a"]), /absent de l’inventaire/);
assert.throws(() => assertLegacyRecoveryConfirmation({ confirmed: false, databaseSuffix: "company_u_c" }, { databaseSuffix: "company_u_c" }), /confirmation explicite/);
assert.throws(() => assertLegacyRecoveryConfirmation({ confirmed: true, databaseSuffix: "company_u_a" }, { databaseSuffix: "company_u_b" }), /contexte de destination a changé/);
assert.equal(assertLegacyRecoveryConfirmation({ confirmed: true, databaseSuffix: "company_u_c" }, { databaseSuffix: "company_u_c" }).databaseSuffix, "company_u_c");
console.log("✓ Récupération des anciens coffres : sélection et affectation explicites validées.");
