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
  /^https:\/\/[a-z0-9-]+\.mizane-preview\.pages\.dev$/.test(origin);

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
  // Vérifie cryptographiquement le JWT. Avec une clé asymétrique, getClaims
  // utilise le JWKS mis en cache et évite un aller-retour Auth à chaque lecture.
  // Avec HS256, le SDK conserve la validation côté Auth : aucun affaiblissement.
  const { data: claimsData, error: claimsError } = await admin.auth.getClaims(jwt);
  const actorId = claimsData?.claims?.sub;
  if (claimsError || typeof actorId !== "string" || !validUuid(actorId)) {
    return fail(401, "Session invalide ou expirée.");
  }

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

  // Une seule RPC regroupe le contrôle d'appartenance et les lectures comptables.
  // La fonction SQL est SECURITY INVOKER et son EXECUTE est réservé à service_role.
  const { data: snapshotData, error: snapshotError } = await admin.rpc("read_accounting_snapshot", {
    p_company_id: companyId,
    p_actor_user_id: actorId,
    p_offset: offset,
    p_limit: limit,
    p_changes_since: changesSince,
  });

  if (snapshotError) {
    console.error("read-accounting snapshot RPC:", snapshotError.message);
    return fail(500, "Impossible de lire les données comptables.");
  }
  if (!snapshotData || typeof snapshotData !== "object" || Array.isArray(snapshotData)) {
    return fail(500, "Réponse de lecture comptable invalide.");
  }

  const snapshot = snapshotData as Record<string, unknown>;
  if (snapshot.authorized !== true) {
    return fail(403, "Vous n'êtes pas autorisé à consulter cette comptabilité.");
  }

  const cloudSettings = snapshot.settings
    ? redactSecrets(snapshot.settings) as Record<string, unknown>
    : null;
  // Les comptes personnalisés ont leur propre table et leur propre version.
  // Ne pas exposer la copie historique intégrée aux paramètres importés.
  if (cloudSettings?.settings && typeof cloudSettings.settings === "object" && !Array.isArray(cloudSettings.settings)) {
    delete (cloudSettings.settings as Record<string, unknown>).customAccounts;
  }

  return json(200, {
    company_id: companyId,
    role: snapshot.role,
    settings: cloudSettings,
    custom_accounts: snapshot.custom_accounts ?? [],
    thirds: snapshot.thirds ?? [],
    assets: snapshot.assets ?? [],
    entries: snapshot.entries ?? [],
    pagination: snapshot.pagination,
    changes: snapshot.changes ?? [],
    changes_pagination: snapshot.changes_pagination,
  });
});
