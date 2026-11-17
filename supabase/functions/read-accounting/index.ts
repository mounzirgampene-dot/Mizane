// MIZANE — Lecture comptable cloud sécurisée pour le portail et l'assistant SaaS.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mounzirgampene-dot.github.io",
  "http://localhost:8000",
]);

// Autorise les URL de prévisualisation Cloudflare Pages du projet DEV,
// sans ouvrir les fonctions à tous les sous-domaines pages.dev.
const isAllowedOrigin = (origin: string) =>
  allowedOrigins.has(origin) ||
  /^https:\/\/[a-z0-9-]+\.mizane-preview\.pages\.dev$/.test(origin) ||
  origin === "https://mizane-test-preview.pages.dev" ||
  /^https:\/\/[a-z0-9-]+\.mizane-test-preview\.pages\.dev$/i.test(origin);

const validUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (/^(?:aikey|aikeyenc|apikey|apikeyenc|providerapikey|providerapikeyenc|openaiapikey|openaiapikeyenc|mistralapikey|mistralapikeyenc|groqapikey|groqapikeyenc|googleapikey|googleapikeyenc|secret|accesstoken|refreshtoken)$/.test(normalizedKey)) continue;
    out[key] = redactSecrets(item);
  }
  return out;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const corsHeaders = {
    ...(origin && isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  const fail = (status: number, message: string) => json(status, { error: message });

  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return fail(405, "Méthode non autorisée.");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return fail(500, "Configuration serveur incomplète.");

  const authorization = request.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === authorization) return fail(401, "Authentification requise.");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const actor = authData.user;
  if (authError || !actor) return fail(401, "Session invalide ou expirée.");

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16_000) return fail(413, "Requête trop volumineuse.");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail(400, "Corps de requête invalide.");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "JSON invalide.");
  }

  const companyId = body.company_id;
  if (!validUuid(companyId)) return fail(400, "Identifiant d'entreprise invalide.");
  const limit = Number.isInteger(body.limit) ? Math.min(200, Math.max(1, Number(body.limit))) : 100;
  const offset = Number.isInteger(body.offset) ? Math.max(0, Number(body.offset)) : 0;
  if (offset > 1_000_000) return fail(400, "Position de lecture invalide.");
  const changesSince = body.changes_since == null ? 0 : Number(body.changes_since);
  if (!Number.isSafeInteger(changesSince) || changesSince < 0) return fail(400, "Curseur de synchronisation invalide.");

  const { data: membership, error: membershipError } = await admin
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", actor.id)
    .maybeSingle();

  if (membershipError) {
    console.error("read-accounting membership lookup:", membershipError.message);
    return fail(500, "Impossible de vérifier les autorisations.");
  }
  if (!membership || membership.status !== "active" ||
      !["admin", "accountant", "reader"].includes(membership.role)) {
    return fail(403, "Vous n'êtes pas autorisé à consulter cette comptabilité.");
  }

  const [settingsRes, accountsRes, thirdsRes, assetsRes, entriesRes, changesRes] = await Promise.all([
    admin.from("accounting_settings").select("settings,next_entry_id,updated_at,sync_version").eq("company_id", companyId).maybeSingle(),
    admin.from("accounting_custom_accounts").select("client_uid,code,label,account_type,updated_at,sync_version").eq("company_id", companyId).order("code").order("id").range(offset, offset + limit),
    admin.from("accounting_thirds").select("client_uid,name,third_type,phone,email,updated_at,sync_version").eq("company_id", companyId).order("name").order("id").range(offset, offset + limit),
    admin.from("accounting_assets").select("client_uid,name,account_code,amount,years,method,service_date,amortized,updated_at,sync_version").eq("company_id", companyId).order("name").order("id").range(offset, offset + limit),
    admin.from("accounting_entries").select("id,client_uid,entry_date,journal,reference,is_reversed,reverse_of_entry_id,created_at,updated_at,sync_version").eq("company_id", companyId).order("entry_date", { ascending: true }).order("id", { ascending: true }).range(offset, offset + limit),
    admin.from("accounting_sync_changes").select("change_seq,entity_type,client_uid,operation,changed_at").eq("company_id", companyId).gt("change_seq", changesSince).order("change_seq", { ascending: true }).limit(501),
  ]);

  for (const result of [settingsRes, accountsRes, thirdsRes, assetsRes, entriesRes, changesRes]) {
    if (result.error) {
      console.error("read-accounting query:", result.error.message);
      return fail(500, "Impossible de lire les données comptables.");
    }
  }

  const fetchedAccounts = accountsRes.data ?? [];
  const fetchedThirds = thirdsRes.data ?? [];
  const fetchedAssets = assetsRes.data ?? [];
  const fetchedEntries = entriesRes.data ?? [];
  const hasMoreAccounts = fetchedAccounts.length > limit;
  const hasMoreThirds = fetchedThirds.length > limit;
  const hasMoreAssets = fetchedAssets.length > limit;
  const hasMoreEntries = fetchedEntries.length > limit;
  const hasMore = hasMoreAccounts || hasMoreThirds || hasMoreAssets || hasMoreEntries;
  const accounts = fetchedAccounts.slice(0, limit);
  const thirds = fetchedThirds.slice(0, limit);
  const assets = fetchedAssets.slice(0, limit);
  const entries = fetchedEntries.slice(0, limit);
  const entryIds = entries.map((entry) => entry.id);
  let lines: Record<string, unknown>[] = [];
  if (entryIds.length) {
    const { data, error } = await admin
      .from("accounting_entry_lines")
      .select("entry_id,line_number,account_code,label,third_name,debit,credit")
      .eq("company_id", companyId)
      .in("entry_id", entryIds)
      .order("entry_id")
      .order("line_number");
    if (error) {
      console.error("read-accounting lines query:", error.message);
      return fail(500, "Impossible de lire les lignes comptables.");
    }
    lines = data ?? [];
  }

  const linesByEntry = new Map<string, Record<string, unknown>[]>();
  for (const line of lines) {
    const key = String(line.entry_id);
    const bucket = linesByEntry.get(key) ?? [];
    bucket.push(line);
    linesByEntry.set(key, bucket);
  }

  const fetchedChanges = changesRes.data ?? [];
  const hasMoreChanges = fetchedChanges.length > 500;
  const changes = fetchedChanges.slice(0, 500);

  const cloudSettings = settingsRes.data ? redactSecrets(settingsRes.data) as Record<string, unknown> : null;
  // Les comptes personnalisés ont leur propre table et leur propre version.
  // Ne pas exposer la copie historique intégrée aux paramètres importés.
  if (cloudSettings?.settings && typeof cloudSettings.settings === "object" && !Array.isArray(cloudSettings.settings)) {
    delete (cloudSettings.settings as Record<string, unknown>).customAccounts;
  }

  return json(200, {
    company_id: companyId,
    role: membership.role,
    settings: cloudSettings,
    custom_accounts: accounts,
    thirds,
    assets,
    entries: entries.map((entry) => ({ ...entry, lines: linesByEntry.get(String(entry.id)) ?? [] })),
    pagination: {
      offset, limit, returned: entries.length, has_more: hasMore,
      has_more_by_type: {
        custom_accounts: hasMoreAccounts, thirds: hasMoreThirds,
        assets: hasMoreAssets, entries: hasMoreEntries,
      },
      next_offset: hasMore ? offset + limit : null,
    },
    changes,
    changes_pagination: {
      since: changesSince,
      returned: changes.length,
      has_more: hasMoreChanges,
      next_cursor: changes.length ? changes[changes.length - 1].change_seq : changesSince,
    },
  });
});
