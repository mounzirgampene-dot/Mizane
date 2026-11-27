import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127120000_boussole_editorial_governance.sql", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/boussole-editor/index.ts", import.meta.url), "utf8");
const englishMigration = readFileSync(new URL("../supabase/migrations/20261127133000_boussole_english_locale.sql", import.meta.url), "utf8");
const editorUi = readFileSync(new URL("../js/boussole-editor.js", import.meta.url), "utf8");

assert.match(migration, /create table public\.boussole_editor_roles/);
assert.match(migration, /create table public\.boussole_editor_audit/);
assert.match(migration, /boussole_editor_roles_grantor_fk_idx/);
assert.match(migration, /boussole_editor_audit_version_fk_idx/);
assert.match(migration, /enable row level security[\s\S]*force row level security/);
assert.match(migration, /revoke all on public\.boussole_editor_roles,public\.boussole_editor_audit[\s\S]*from public,anon,authenticated/);
assert.match(migration, /grant select on public\.boussole_editor_roles to service_role/);
assert.match(migration, /create or replace function public\.boussole_editor_transition/);
assert.match(migration, /security definer[\s\S]*set search_path = ''/);
assert.match(migration, /grant execute on function public\.boussole_editor_transition[\s\S]*to service_role/);
assert.match(migration, /r\.role in \('author','admin'\)/);
assert.match(migration, /r\.role in \(v_required_role,'admin'\)/);
assert.match(migration, /created_by is distinct from p_actor_id/);
assert.match(migration, /approved_by is distinct from p_actor_id/);
assert.match(migration, /Les versions française, arabe et anglaise doivent être approuvées avant publication/);
assert.match(migration, /current_published_version is null then 'review' else status/);
assert.match(migration, /document_archived/);
assert.match(migration, /document_restored/);
assert.match(migration, /Un document archivé doit être restauré/);
assert.match(migration, /reviewed_by=null,reviewed_at=null,approved_by=null,approved_at=null,published_at=null/);

assert.match(edge, /adminClient\.auth\.getUser\(jwt\)/);
assert.match(edge, /p_actor_id: authData\.user\.id/);
assert.doesNotMatch(edge, /p_actor_id:\s*body\./);
assert.match(edge, /adminClient\.rpc\("boussole_editor_transition"/);
assert.match(edge, /if \(error\.code === "42501"\)/);
assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(edge, /serviceKey.*localStorage|localStorage.*serviceKey/);
assert.match(edge, /1_000_000/);
console.log("Boussole éditoriale : rôles serveur, séparation des tâches et transitions contrôlées vérifiés.");


assert.ok(migration.includes("Les versions française, arabe et anglaise doivent être approuvées avant publication"));
assert.ok(migration.includes("v_other_locale_count<>3"));
assert.ok(migration.includes("v_next_version := coalesce(v_document.current_published_version,0) + 1"));
assert.ok(migration.includes("locale in ('fr','ar','en')"));
assert.ok(englishMigration.includes("locale in ('fr','ar','en')"));
assert.ok(englishMigration.includes("interface_locale in ('fr','ar','en')"));
assert.ok(englishMigration.includes("response_locale in ('fr','ar','en')"));
assert.ok(edge.includes('action === "list" || action === "get"'));
assert.ok(edge.includes("scopeRoles.length"));
assert.ok(edge.includes('body.locale !== "en"'));
assert.ok(editorUi.includes('functions.invoke("boussole-editor"'));
assert.ok(!editorUi.includes('.from("boussole_documents")'));
console.log("Boussole editorial: tri-language governance and scoped administration checks passed.");
