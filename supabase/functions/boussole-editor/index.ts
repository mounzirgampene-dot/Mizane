// MIZANE — API d'administration éditoriale de la Boussole.
// Les rôles sont lus côté serveur ; aucune autorisation ne vient du navigateur.
// Déploiement DEV uniquement après revue et migration correspondante.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://mounzirgampene-dot.github.io",
  "http://localhost:8000",
]);
const actions = new Set([
  "list", "get", "create_draft", "update_draft", "create_locale_version", "submit_review",
  "request_changes", "approve", "publish", "archive", "restore",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const optionalText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max ? value : null;

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const originAllowed = (value: string) =>
    allowedOrigins.has(value) ||
    /^https:\/\/[a-z0-9-]+\.mizane-test-preview\.pages\.dev$/i.test(value) ||
    value === "https://mizane-test-preview.pages.dev";
  const corsHeaders = {
    ...(origin && originAllowed(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Configuration serveur incomplète." });

  const authorization = request.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === authorization) return json(401, { error: "Authentification requise." });

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !authData.user) return json(401, { error: "Session invalide ou expirée." });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json(413, { error: "Contenu trop volumineux." });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: "Corps de requête invalide." });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "JSON invalide." });
  }

  const action = body.action;
  if (typeof action !== "string" || !actions.has(action)) {
    return json(400, { error: "Action éditoriale invalide." });
  }
  if (body.document_id !== undefined && body.document_id !== null && !isUuid(body.document_id)) {
    return json(400, { error: "Identifiant documentaire invalide." });
  }
  if (body.version_id !== undefined && body.version_id !== null && !isUuid(body.version_id)) {
    return json(400, { error: "Identifiant de version invalide." });
  }
  if (body.company_id !== undefined && body.company_id !== null && !isUuid(body.company_id)) {
    return json(400, { error: "Identifiant d’entreprise invalide." });
  }
  if (body.visibility !== undefined && body.visibility !== "global" && body.visibility !== "company") {
    return json(400, { error: "Portée documentaire invalide." });
  }
  if (body.locale !== undefined && body.locale !== "fr" && body.locale !== "ar" && body.locale !== "en") {
    return json(400, { error: "Langue documentaire invalide." });
  }
  if (action === "list" || action === "get") {
    const scope = body.scope === "global" ? "global" : "company";
    const companyId = body.company_id ?? null;
    if (scope === "company" && !isUuid(companyId)) {
      return json(400, { error: "Entreprise active requise pour cet espace éditorial." });
    }
    const { data: roleRows, error: roleError } = await adminClient
      .from("boussole_editor_roles")
      .select("scope_type,company_id,role")
      .eq("user_id", authData.user.id)
      .is("revoked_at", null);
    if (roleError) {
      console.error("boussole_editor_roles lookup failed:", roleError.code ?? "unknown");
      return json(500, { error: "Vérification des droits éditoriaux impossible." });
    }
    const roles = roleRows ?? [];
    let scopeRoles = roles.filter((role) =>
      scope === "global"
        ? role.scope_type === "global" && role.company_id === null
        : role.scope_type === "company" && role.company_id === companyId
    );
    if (scope === "company") {
      const { data: membership, error: membershipError } = await adminClient
        .from("company_memberships")
        .select("status")
        .eq("company_id", companyId)
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (membershipError || membership?.status !== "active") {
        return json(403, { error: "Appartenance active à cette entreprise requise." });
      }
    }
    if (!scopeRoles.length) return json(403, { error: "Aucun rôle éditorial actif dans cet espace." });

    if (action === "list") {
      let query = adminClient.from("boussole_documents")
        .select("id,slug,module_key,feature_key,visibility,company_id,status,current_published_version,created_by,updated_at,published_at")
        .eq("visibility", scope)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (scope === "company") query = query.eq("company_id", companyId);
      const canReviewAll = scopeRoles.some((role) => ["reviewer", "publisher", "admin"].includes(role.role));
      if (!canReviewAll) query = query.or("status.eq.published,created_by.eq." + authData.user.id);
      const { data: documents, error: documentsError } = await query;
      if (documentsError) return json(500, { error: "Chargement des documents éditoriaux impossible." });
      return json(200, { scope, company_id: companyId, roles: scopeRoles.map((role) => role.role), documents: documents ?? [] });
    }

    if (!isUuid(body.document_id)) return json(400, { error: "Identifiant documentaire invalide." });
    const { data: document, error: documentError } = await adminClient
      .from("boussole_documents")
      .select("id,slug,module_key,feature_key,visibility,company_id,status,current_published_version,updated_at,published_at")
      .eq("id", body.document_id)
      .maybeSingle();
    if (documentError || !document) return json(404, { error: "Document introuvable." });
    if (scope === "global" && document.visibility !== "global") return json(403, { error: "Document hors de cet espace éditorial." });
    if (scope === "company" && (document.visibility !== "company" || document.company_id !== companyId)) return json(403, { error: "Document hors de cet espace éditorial." });
    const canReviewAll = scopeRoles.some((role) => ["reviewer", "publisher", "admin"].includes(role.role));
    if (!canReviewAll && document.status !== "published" && document.created_by !== authData.user.id) {
      return json(403, { error: "Un auteur ne peut consulter que ses propres brouillons et les documents publiés." });
    }
    const { data: versions, error: versionsError } = await adminClient
      .from("boussole_document_versions")
      .select("id,document_id,version_number,locale,title,summary,content_markdown,structured_content,source_references,learning_level,estimated_minutes,status,created_by,reviewed_by,approved_by,created_at,reviewed_at,approved_at,published_at")
      .eq("document_id", document.id)
      .order("version_number", { ascending: false })
      .order("locale", { ascending: true });
    if (versionsError) return json(500, { error: "Chargement des versions éditoriales impossible." });
    return json(200, { scope, company_id: companyId, roles: scopeRoles.map((role) => role.role), document, versions: versions ?? [] });
  }

  if (body.structured_content !== undefined &&
      (!body.structured_content || typeof body.structured_content !== "object" || Array.isArray(body.structured_content))) {
    return json(400, { error: "Contenu structuré invalide." });
  }
  if (body.source_references !== undefined && !Array.isArray(body.source_references)) {
    return json(400, { error: "Références documentaires invalides." });
  }
  if (body.estimated_minutes !== undefined && body.estimated_minutes !== null &&
      (!Number.isInteger(body.estimated_minutes) || Number(body.estimated_minutes) < 1 || Number(body.estimated_minutes) > 1440)) {
    return json(400, { error: "Durée pédagogique invalide." });
  }
  if (body.learning_level !== undefined && body.learning_level !== null &&
      !["beginner", "intermediate", "advanced"].includes(String(body.learning_level))) {
    return json(400, { error: "Niveau pédagogique invalide." });
  }

  const rpcArgs = {
    p_actor_id: authData.user.id,
    p_action: action,
    p_document_id: body.document_id ?? null,
    p_version_id: body.version_id ?? null,
    p_visibility: body.visibility ?? "global",
    p_company_id: body.company_id ?? null,
    p_slug: optionalText(body.slug, 180),
    p_module_key: optionalText(body.module_key, 100),
    p_feature_key: optionalText(body.feature_key, 120),
    p_locale: body.locale ?? null,
    p_title: optionalText(body.title, 240),
    p_summary: optionalText(body.summary, 2000),
    p_content_markdown: optionalText(body.content_markdown, 200000),
    p_structured_content: body.structured_content ?? {},
    p_source_references: body.source_references ?? [],
    p_learning_level: body.learning_level ?? null,
    p_estimated_minutes: body.estimated_minutes ?? null,
    p_review_note: optionalText(body.review_note, 1000),
  };
  const { data, error } = await adminClient.rpc("boussole_editor_transition", rpcArgs);
  if (error) {
    if (error.code === "42501") return json(403, { error: "Droit éditorial insuffisant ou transition refusée." });
    if (error.code === "P0002") return json(404, { error: "Document introuvable." });
    if (error.code === "22023") return json(400, { error: "Les paramètres ou l’état documentaire ne permettent pas cette transition." });
    console.error("boussole_editor_transition failed:", error.code ?? "unknown");
    return json(500, { error: "La transition éditoriale n’a pas pu être exécutée." });
  }
  return json(200, { result: data });
});
