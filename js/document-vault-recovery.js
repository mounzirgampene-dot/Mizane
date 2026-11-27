// MIZANE — Récupération explicite des anciens coffres documentaires IndexedDB.
import { resolveDocumentStorageScope } from "./document-storage-scope.js";
import { putLocalAccountingDocument, getLocalAccountingDocument } from "./accounting-documents.js";
import { putTaxEvidenceFile, getTaxEvidenceFile } from "./tax-documents-store.js";

export const LEGACY_DOCUMENT_VAULTS = Object.freeze({
  accounting: "mizane_accounting_documents_v1",
  tax: "mizane_tax_evidence_v1",
});

function openExistingDatabase(indexedDBApi, name) {
  if (!indexedDBApi?.open) throw new Error("IndexedDB n’est pas disponible sur cet appareil.");
  return new Promise((resolve, reject) => {
    const request = indexedDBApi.open(name);
    let createdDuringProbe = false;
    request.onupgradeneeded = () => {
      // Abort immediately if the database did not exist: never create a blank legacy vault.
      createdDuringProbe = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      if (createdDuringProbe) resolve(null);
      else reject(request.error || new Error("Lecture de l’ancien coffre impossible."));
    };
    request.onblocked = () => reject(new Error("L’ancien coffre est encore utilisé dans un autre onglet. Fermez les autres onglets MIZANE puis recommencez."));
  });
}

async function readLegacyRecords(name, indexedDBApi = globalThis.indexedDB) {
  const db = await openExistingDatabase(indexedDBApi, name);
  if (!db) return [];
  try {
    if (!db.objectStoreNames.contains("files")) return [];
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("files", "readonly");
      const request = transaction.objectStore("files").getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error("Lecture des anciens justificatifs impossible."));
      transaction.onabort = () => reject(transaction.error || new Error("Lecture de l’ancien coffre interrompue."));
    });
  } finally {
    db.close();
  }
}

export function summarizeLegacyDocumentRecord(record = {}, vault = "accounting") {
  return {
    id: String(record.id ?? ""),
    vault,
    fileName: String(record.fileName || record.name || "Fichier sans nom").slice(0, 240),
    mimeType: String(record.mimeType || record.type || "application/octet-stream").slice(0, 120),
    size: Number.isFinite(Number(record.size)) ? Number(record.size) : Number(record.blob?.size) || 0,
    entryIds: Array.isArray(record.entryIds) ? [...new Set(record.entryIds.map(Number).filter(Number.isSafeInteger))] : [],
    declarationId: String(record.declarationId || ""),
    category: String(record.category || ""),
    hasBlob: typeof Blob !== "undefined" && record.blob instanceof Blob,
  };
}

export function validateLegacyRecoverySelection(selectedIds, availableIds) {
  const selected = [...new Set((selectedIds || []).map(String).filter(Boolean))];
  const available = new Set((availableIds || []).map(String));
  const unknown = selected.filter((id) => !available.has(id));
  if (unknown.length) throw new Error("La sélection contient un justificatif absent de l’inventaire. Relancez l’inventaire.");
  return selected;
}

export function assertLegacyRecoveryConfirmation(confirmation, scope) {
  if (confirmation?.confirmed !== true) throw new Error("La récupération exige une confirmation explicite de l’affectation des fichiers sélectionnés.");
  if (!scope?.databaseSuffix || confirmation.databaseSuffix !== scope.databaseSuffix) {
    throw new Error("Le contexte de destination a changé. Relancez l’inventaire et confirmez à nouveau l’entreprise ou l’utilisateur actif.");
  }
  return scope;
}

export async function inspectLegacyDocumentVaults({ indexedDBApi = globalThis.indexedDB } = {}) {
  const [accounting, tax] = await Promise.all([
    readLegacyRecords(LEGACY_DOCUMENT_VAULTS.accounting, indexedDBApi),
    readLegacyRecords(LEGACY_DOCUMENT_VAULTS.tax, indexedDBApi),
  ]);
  return {
    accounting: accounting.map((record) => summarizeLegacyDocumentRecord(record, "accounting")),
    tax: tax.map((record) => summarizeLegacyDocumentRecord(record, "tax")),
    sourceDatabasesRemainUntouched: true,
  };
}

export async function recoverLegacyAccountingDocuments({
  selectedIds,
  confirmation,
  existingEntryIds = [],
  indexedDBApi = globalThis.indexedDB,
} = {}) {
  const scope = resolveDocumentStorageScope();
  assertLegacyRecoveryConfirmation(confirmation, scope);
  const records = await readLegacyRecords(LEGACY_DOCUMENT_VAULTS.accounting, indexedDBApi);
  const selected = validateLegacyRecoverySelection(selectedIds, records.map((record) => record.id));
  const validEntries = new Set([...existingEntryIds].map(Number));
  const result = { imported: [], skipped: [] };

  for (const record of records.filter((item) => selected.includes(String(item.id)))) {
    const summary = summarizeLegacyDocumentRecord(record, "accounting");
    if (!summary.hasBlob || !summary.id || !summary.entryIds.length || summary.entryIds.some((id) => !validEntries.has(id))) {
      result.skipped.push({ id: summary.id, reason: "Fichier absent ou écriture liée non présente dans l’entreprise active." });
      continue;
    }
    if (await getLocalAccountingDocument(summary.id)) {
      result.skipped.push({ id: summary.id, reason: "Un justificatif portant déjà cet identifiant existe dans le coffre de destination." });
      continue;
    }
    const file = new File([record.blob], summary.fileName, { type: summary.mimeType });
    await putLocalAccountingDocument({
      id: summary.id,
      file,
      entryIds: summary.entryIds,
      metadata: {
        type: record.type,
        documentDate: record.documentDate,
        counterparty: record.counterparty,
        reference: record.reference,
        journal: record.journal,
        notes: record.notes,
      },
      uploadedAt: record.uploadedAt,
    });
    const verified = await getLocalAccountingDocument(summary.id);
    if (!verified?.blob || Number(verified.blob.size) !== Number(record.blob.size)) {
      throw new Error("Vérification après import échouée pour le justificatif comptable " + summary.id + ".");
    }
    result.imported.push(summary.id);
  }
  return { ...result, destination: scope.databaseSuffix, sourcePreserved: true };
}

export async function recoverLegacyTaxEvidence({
  selectedIds,
  confirmation,
  indexedDBApi = globalThis.indexedDB,
} = {}) {
  const scope = resolveDocumentStorageScope();
  assertLegacyRecoveryConfirmation(confirmation, scope);
  const records = await readLegacyRecords(LEGACY_DOCUMENT_VAULTS.tax, indexedDBApi);
  const selected = validateLegacyRecoverySelection(selectedIds, records.map((record) => record.id));
  const result = { imported: [], skipped: [] };

  for (const record of records.filter((item) => selected.includes(String(item.id)))) {
    const summary = summarizeLegacyDocumentRecord(record, "tax");
    if (!summary.hasBlob || !summary.id) {
      result.skipped.push({ id: summary.id, reason: "Fichier absent ou identifiant invalide." });
      continue;
    }
    if (await getTaxEvidenceFile(summary.id)) {
      result.skipped.push({ id: summary.id, reason: "Un fichier portant déjà cet identifiant existe dans le coffre de destination." });
      continue;
    }
    const file = new File([record.blob], summary.fileName, { type: summary.mimeType });
    await putTaxEvidenceFile(summary.id, file);
    const verified = await getTaxEvidenceFile(summary.id);
    if (!verified?.blob || Number(verified.blob.size) !== Number(record.blob.size)) {
      throw new Error("Vérification après import échouée pour le justificatif fiscal " + summary.id + ".");
    }
    result.imported.push(summary.id);
  }
  return { ...result, destination: scope.databaseSuffix, sourcePreserved: true };
}
