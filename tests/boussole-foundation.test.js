import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127105326_boussole_foundation.sql", import.meta.url), "utf8");

assert.match(migration, /begin;[\s\S]*commit;/i);
for (const table of ["boussole_documents","boussole_document_versions","boussole_document_relations","boussole_search_synonyms","boussole_user_preferences","boussole_consent_events"]) {
  assert.match(migration, new RegExp("create table public\\." + table + "\\b", "i"), table + " doit être créée");
  assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security", "i"), table + " doit activer RLS");
  assert.match(migration, new RegExp("alter table public\\." + table + " force row level security", "i"), table + " doit forcer RLS");
}
assert.match(migration, /private\.is_active_company_member\(company_id\)/);
assert.match(migration, /private\.is_active_company_member\(d\.company_id\)/);
assert.match(migration, /user_id=auth\.uid\(\)/);
assert.match(migration, /grant insert \(user_id,consent_type,purpose,policy_version,decision,scope\)\s+on public\.boussole_consent_events to authenticated/i);
assert.doesNotMatch(migration, /grant select,insert on public\.boussole_consent_events to authenticated/i);
assert.match(migration, /created_at timestamptz not null default now\(\)/i, "l’horodatage doit être défini côté base");
const consentInsertGrant = migration.match(/grant insert \(([^)]*)\)\s+on public\.boussole_consent_events to authenticated/i);
assert.ok(consentInsertGrant);
assert.doesNotMatch(consentInsertGrant[1], /\b(created_at|id)\b/i, "les identifiants et horodatages sont générés par la base");
assert.doesNotMatch(migration, /grant\s+.*\b(update|delete|all)\b.*boussole_consent_events\s+to\s+authenticated/i);
assert.match(migration, /consent_type in \('ai_processing','business_data_access','usage_analytics'\)/);
assert.match(migration, /locale in \('fr','ar'\)/);

// Aucun rôle anon ne doit déclencher le helper private, dont le schéma n'est pas exposé.
const policyStatements = migration.match(/create policy\b[\s\S]*?;/gi) ?? [];
const anonPolicies = policyStatements.filter(policy => /\bto\s+anon\s*,\s*authenticated\b/i.test(policy));
assert.equal(anonPolicies.length, 4, "quatre politiques publiques sans helper privé");
for (const policy of anonPolicies) {
  assert.doesNotMatch(policy, /private\.is_active_company_member/i, "une politique publique ne doit pas appeler le helper privé");
}
assert.match(migration, /boussole_documents_read_company_published[\s\S]*?to authenticated[\s\S]*?private\.is_active_company_member/i);
assert.match(migration, /boussole_versions_read_company_published[\s\S]*?to authenticated[\s\S]*?private\.is_active_company_member/i);
assert.match(migration, /boussole_relations_read_company_published[\s\S]*?to authenticated[\s\S]*?private\.is_active_company_member/i);
console.log("Boussole foundation: contrôles statiques et séparation anon/authenticated réussis.");
