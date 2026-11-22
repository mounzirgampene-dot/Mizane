// MIZANE — Écriture incrémentale cloud sécurisée.
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
const validUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const headers = {
    ...(origin && isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Configuration serveur incomplète." });

  const authorization = request.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === authorization) return json(401, { error: "Authentification requise." });

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const actor = authData.user;
  if (authError || !actor) return json(401, { error: "Session invalide ou expirée." });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 500_000) {
      return json(413, { error: "Le lot dépasse la taille maximale de 500 Ko." });
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: "Corps de requête invalide." });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "JSON invalide." });
  }

  const companyId = body.company_id;
  const operationUid = body.operation_uid;
  const operations = body.operations;
  if (!validUuid(companyId) || !validUuid(operationUid) ||
      !Array.isArray(operations) || operations.length < 1 || operations.length > 100) {
    return json(400, { error: "Entreprise, identifiant d’opération ou lot invalide." });
  }

  const { data: membership, error: membershipError } = await admin
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", actor.id)
    .maybeSingle();
  if (membershipError) {
    console.error("push-accounting-changes membership:", membershipError.message);
    return json(500, { error: "Impossible de vérifier les autorisations." });
  }
  if (!membership || membership.status !== "active" ||
      !["admin", "accountant"].includes(membership.role)) {
    return json(403, { error: "Seuls un administrateur ou un comptable actif peuvent modifier la comptabilité." });
  }

  const { data, error } = await admin.rpc("push_accounting_changes", {
    p_company_id: companyId,
    p_actor_user_id: actor.id,
    p_operation_uid: operationUid,
    p_operations: operations,
  });
  if (error) {
    if (error.code === "42501") return json(403, { error: "Accès comptable refusé." });
    if (error.code === "23505") return json(409, { error: error.message, code: error.code });
    if (["22023", "23514", "23503", "22P02"].includes(error.code)) {
      return json(422, { error: error.message, code: error.code });
    }
    console.error("push-accounting-changes RPC:", error.code, error.message);
    return json(500, { error: "La synchronisation a échoué ; aucune modification partielle n’a été conservée." });
  }
  return json(200, data as Record<string, unknown>);
});
