// MIZANE — Import initial de la comptabilité locale vers une entreprise cloud.
// Le JWT est vérifié par la plateforme et de nouveau résolu côté serveur.
// Le RPC SECURITY DEFINER n'est appelable que par service_role.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mounzirgampene-dot.github.io",
  "http://localhost:8000",
]);

const validUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const corsHeaders = {
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
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

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  const actor = authData.user;
  if (authError || !actor) return fail(401, "Session invalide ou expirée.");

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_200_000) {
      return fail(413, "La sauvegarde dépasse la taille maximale autorisée. Exportez-la et réduisez les pièces volumineuses.");
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(400, "Corps de requête invalide.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "JSON invalide.");
  }

  const companyId = body.company_id;
  const snapshot = body.snapshot;
  if (!validUuid(companyId)) return fail(400, "Identifiant d'entreprise invalide.");
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return fail(400, "Sauvegarde comptable absente ou invalide.");
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", actor.id)
    .maybeSingle();

  if (membershipError) {
    console.error("sync-accounting membership lookup:", membershipError.message);
    return fail(500, "Impossible de vérifier les autorisations.");
  }
  if (!membership || membership.status !== "active" ||
      !["admin", "accountant"].includes(membership.role)) {
    return fail(403, "Seuls un administrateur ou un comptable actif peuvent importer la comptabilité.");
  }

  const { data, error } = await adminClient.rpc("import_accounting_snapshot", {
    p_company_id: companyId,
    p_actor_user_id: actor.id,
    p_snapshot: snapshot,
  });

  if (error) {
    if (error.code === "42501") return fail(403, "Accès comptable refusé.");
    if (error.code === "23505") return fail(409, error.message);
    if (["22023", "23514", "23503", "22P02"].includes(error.code)) {
      return fail(422, error.message);
    }
    console.error("sync-accounting import:", error.code, error.message);
    return fail(500, "L'import comptable a échoué. Aucune donnée partielle n'a été conservée.");
  }

  return json(200, data as Record<string, unknown>);
});
