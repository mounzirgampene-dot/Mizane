// MIZANE — Application transactionnelle d'une migration de plan, avec retour arrière.
import { buildAccountCache, validateEntry } from "../accounting.js";
import { dryRunPlanMigration } from "./mapping.js";
import { buildMigrationAudit } from "./migration-audit.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
function fingerprint(value) {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0") + ":" + input.length;
}
function accountRows(plan) {
  return (plan?.accounts || []).map((row) => Array.isArray(row)
    ? { code: String(row[0]), label: String(row[1]), type: String(row[2]) }
    : { code: String(row.code), label: String(row.label), type: String(row.type) });
}
function validateTargetEntries(entries, targetPlan, customAccounts = []) {
  const accounts = accountRows(targetPlan);
  const targetCodes = new Set(accounts.map((account) => account.code));
  const collisions = customAccounts.filter((account) => targetCodes.has(String(account.code)));
  if (collisions.length) throw new Error("Collision avec les comptes personnalisés : " + collisions.map((account) => account.code).join(", ") + ". Résolvez ces conflits avant la migration.");
  const validationStore = { settings: { customAccounts: customAccounts || [] } };
  buildAccountCache(validationStore, accounts);
  const errors = [];
  for (const entry of entries) {
    const validation = validateEntry(validationStore, entry);
    if (!validation.ok) errors.push("Écriture #" + entry.id + " : " + validation.errors.join(" "));
  }
  if (errors.length) throw new Error("La validation du nouveau référentiel a échoué. " + errors.slice(0, 12).join(" "));
}
export function planMigrationPreview(store, { sourcePlan, targetPlan, mapping }) {
  if (!store?.settings || !Array.isArray(store.entries)) throw new Error("Données comptables indisponibles.");
  if (String(store.settings.plan) !== String(sourcePlan?.id)) throw new Error("Le référentiel actif n'est pas le plan source.");
  if (mapping?.status !== "approved" || !mapping.rules?.length || mapping.rules.some((rule) => rule.status !== "approved")) {
    throw new Error("Le rapprochement et toutes ses règles doivent être approuvés.");
  }
  if (mapping.rules.some((rule) => rule.relation === "unmapped")) throw new Error("Les règles non rapprochées doivent être résolues avant migration.");
  const result = dryRunPlanMigration({ entries: store.entries, sourcePlan, targetPlan, mapping });
  if (!result.canApply || result.migratedEntryCount !== store.entries.length) {
    throw new Error("Migration bloquée : " + (result.errors.slice(0, 8).join(" ") || result.unmapped.length + " compte(s) restent non rapprochés."));
  }
  validateTargetEntries(result.entries, targetPlan, store.settings.customAccounts || []);
  return result;
}
export function applyPlanMigration(store, { sourcePlan, targetPlan, mapping, maxSnapshotBytes = 1500000 }) {
  const preview = planMigrationPreview(store, { sourcePlan, targetPlan, mapping });
  const beforeEntries = clone(store.entries);
  const snapshotBytes = JSON.stringify(beforeEntries).length;
  if (snapshotBytes > maxSnapshotBytes) throw new Error("Migration non appliquée : la sauvegarde de sécurité dépasse la limite locale de " + maxSnapshotBytes.toLocaleString("fr-FR") + " caractères. Exportez vos données et réduisez le volume avant de réessayer.");
  const now = new Date().toISOString();
  const history = Array.isArray(store.settings.planMigrationHistory) ? store.settings.planMigrationHistory : [];
  const auditReport = buildMigrationAudit({ beforeEntries, afterEntries: preview.entries, sourcePlan, targetPlan, mapping });
  const record = {
    id: "migration-" + Date.now().toString(36),
    mappingId: mapping.id,
    mappingLabel: mapping.label,
    mappingSnapshot: clone(mapping),
    approvedBy: mapping.approvedBy || null,
    approvedAt: mapping.approvedAt || null,
    events: [{ type: "applied", at: now, actor: null }],
    auditReport,
    sourcePlanId: sourcePlan.id,
    targetPlanId: targetPlan.id,
    status: "applied",
    appliedAt: now,
    undoneAt: null,
    entryCount: beforeEntries.length,
    beforeFingerprint: fingerprint(beforeEntries),
    afterFingerprint: fingerprint(preview.entries),
    beforeEntries,
  };
  const previousEntries = store.entries;
  const previousPlan = store.settings.plan;
  try {
    store.entries = clone(preview.entries);
    store.settings.plan = targetPlan.id;
    store.settings.planMigrationHistory = [...history, record].slice(-3);
    return { record: clone(record), migratedEntryCount: preview.migratedEntryCount, blockedEntryCount: preview.blockedEntryCount };
  } catch (error) {
    store.entries = previousEntries;
    store.settings.plan = previousPlan;
    throw error;
  }
}
export function undoPlanMigration(store, migrationId = null) {
  const history = Array.isArray(store?.settings?.planMigrationHistory) ? store.settings.planMigrationHistory : [];
  const record = [...history].reverse().find((item) => item.status === "applied" && (!migrationId || item.id === migrationId));
  if (!record) throw new Error("Aucune migration applicable au retour arrière.");
  if (String(store.settings.plan) !== String(record.targetPlanId)) throw new Error("Retour arrière refusé : le référentiel actif a changé depuis la migration.");
  if (fingerprint(store.entries) !== record.afterFingerprint) throw new Error("Retour arrière refusé : les écritures ont changé depuis la migration. Exportez une sauvegarde et faites vérifier les modifications avant toute restauration.");
  if (!Array.isArray(record.beforeEntries) || record.beforeEntries.length !== record.entryCount) throw new Error("Sauvegarde de migration absente ou incomplète.");
  const restored = clone(record.beforeEntries);
  record.status = "undone";
  record.undoneAt = new Date().toISOString();
  record.events = [...(Array.isArray(record.events) ? record.events : []), { type: "undone", at: record.undoneAt, actor: null }];
  store.entries = restored;
  store.settings.plan = record.sourcePlanId;
  return { record: clone(record), restoredEntryCount: restored.length };
}
export function migrationFingerprint(entries) { return fingerprint(entries); }
