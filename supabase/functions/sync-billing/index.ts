// MIZANE — Synchronisation sécurisée des devis, factures et règlements.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mounzirgampene-dot.github.io",
  "http://localhost:8000",
]);
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

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  const actor = authData.user;
  if (authError || !actor) return json(401, { error: "Session invalide ou expirée." });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_100_000) return json(413, { error: "Données de facturation trop volumineuses." });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "Corps de requête invalide." });
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "JSON invalide." });
  }

  const companyId = body.company_id;
  const action = body.action;
  if (!validUuid(companyId) || !["read", "write"].includes(String(action))) {
    return json(400, { error: "Entreprise ou action invalide." });
  }
  const { data: membership, error: membershipError } = await admin
    .from("company_memberships").select("role,status")
    .eq("company_id", companyId).eq("user_id", actor.id).maybeSingle();
  if (membershipError) return json(500, { error: "Impossible de vérifier les autorisations." });
  if (!membership || membership.status !== "active" ||
      !["admin", "accountant", "reader"].includes(membership.role)) {
    return json(403, { error: "Vous n'êtes pas autorisé à consulter cette facturation." });
  }

  if (action === "read") {
    const { data, error } = await admin.from("company_billing")
      .select("data,sync_version").eq("company_id", companyId).maybeSingle();
    if (error) {
      console.error("sync-billing read:", error.message);
      return json(500, { error: "Impossible de lire les données de facturation." });
    }
    return json(200, {
      company_id: companyId,
      data: data?.data ?? null,
      sync_version: Number(data?.sync_version) || 0,
    });
  }

  if (!["admin", "accountant"].includes(membership.role)) {
    return json(403, { error: "Votre rôle est en lecture seule." });
  }
  const operationUid = body.operation_uid;
  const expectedVersion = body.expected_sync_version;
  const data = body.data;
  if (!validUuid(operationUid) || !Number.isSafeInteger(expectedVersion) ||
      Number(expectedVersion) < 0 || !data || typeof data !== "object" || Array.isArray(data)) {
    return json(400, { error: "Opération de synchronisation invalide." });
  }
  const { data: result, error } = await admin.rpc("sync_company_billing", {
    p_company_id: companyId,
    p_actor_user_id: actor.id,
    p_operation_uid: operationUid,
    p_expected_sync_version: expectedVersion,
    p_data: data,
  });
  if (error) {
    if (error.code === "42501") return json(403, { error: "Accès à la facturation refusé." });
    if (error.code === "22023") return json(422, { error: error.message });
    console.error("sync-billing RPC:", error.code, error.message);
    return json(500, { error: "La synchronisation de la facturation a échoué." });
  }
  return json(200, result as Record<string, unknown>);
});
