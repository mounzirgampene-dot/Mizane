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
  "request_changes", "approve", "publish", "archive", "restore", "manage_resource", "list_synonyms", "media_upload_url",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const optionalText = (value: unknown, max: number) =>
  typeof value === "string" && value.length <= max ? value : null;


function validMediaSignature(contentType: string, bytes: Uint8Array): boolean {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
  if (contentType === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (contentType === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (contentType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (contentType === "image/avif") return ascii(4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(8, 4));
  if (contentType === "application/pdf") return ascii(0, 5) === "%PDF-";
  if (contentType === "video/mp4") return ascii(4, 4) === "ftyp";
  if (contentType === "video/webm") return starts(0x1a, 0x45, 0xdf, 0xa3);
  return false;
}

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
      .select("id,slug,module_key,feature_key,visibility,company_id,status,current_published_version,min_app_version,max_app_version,created_by,updated_at,published_at")
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
    // Les auteurs ne voient que les versions publiées et leurs propres brouillons.
    const visibleVersions = canReviewAll
      ? (versions ?? [])
      : (versions ?? []).filter((version) =>
        version.status === "published" || version.created_by === authData.user.id
      );
    const visibleVersionIds = new Set(visibleVersions.map((version) => version.id));
    const { data: relations, error: relationsError } = await adminClient
      .from("boussole_document_relations")
      .select("id,source_document_id,target_document_id,relation_type,sort_order")
      .eq("source_document_id", document.id)
      .order("sort_order", { ascending: true });
    if (relationsError) return json(500, { error: "Chargement des relations documentaires impossible." });
    const { data: mediaRows, error: mediaError } = await adminClient
      .from("boussole_media_assets")
      .select("id,document_id,version_id,storage_path,file_name,content_type,byte_size,alt_text,caption,sort_order,is_active,created_at")
      .eq("document_id", document.id).eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (mediaError) return json(500, { error: "Chargement des ressources médias impossible." });
    // Ne jamais signer le média d'une version cachée à l'auteur.
    const visibleMediaRows = canReviewAll
      ? (mediaRows ?? [])
      : (mediaRows ?? []).filter((asset) =>
        asset.version_id !== null && visibleVersionIds.has(asset.version_id)
      );
    const media = await Promise.all(visibleMediaRows.map(async (asset) => {
      const { data: signed } = await adminClient.storage.from("boussole-media").createSignedUrl(asset.storage_path, 900);
      return { ...asset, signed_url: signed?.signedUrl ?? null };
    }));
    return json(200, { scope, company_id: companyId, roles: scopeRoles.map((role) => role.role),
      document, versions: visibleVersions, relations: relations ?? [], media });
  }

  if (action === "list_synonyms") {
    const { data: roles, error: rolesError } = await adminClient.from("boussole_editor_roles")
      .select("role").eq("user_id", authData.user.id).eq("scope_type", "global")
      .is("company_id", null).is("revoked_at", null);
    if (rolesError) return json(500, { error: "Vérification des droits impossible." });
    if (!(roles ?? []).some((row) => ["publisher", "admin"].includes(row.role))) {
      return json(403, { error: "Droit global de publication requis." });
    }
    const { data, error } = await adminClient.from("boussole_search_synonyms")
      .select("id,locale,term,normalized_term,synonyms,is_active,updated_at")
      .order("locale").order("term").limit(500);
    if (error) return json(500, { error: "Chargement des synonymes impossible." });
    return json(200, { synonyms: data ?? [] });
  }

  if (action === "media_upload_url") {
    if (!isUuid(body.document_id) ||
      (body.version_id !== null && body.version_id !== undefined && !isUuid(body.version_id))) {
      return json(400, { error: "Document ou version invalide." });
    }
    const mime = body.content_type, size = body.byte_size;
    const allowedMime = ["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","application/pdf"];
    if (!allowedMime.includes(String(mime)) || !Number.isInteger(size) || Number(size) < 1 || Number(size) > 20971520) {
      return json(400, { error: "Type ou taille de fichier non autorisé." });
    }
    const safeName = String(body.file_name ?? "resource").normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100) || "resource";
    const path = body.document_id + "/" + crypto.randomUUID() + "-" + safeName;
    const { error: authzError } = await adminClient.rpc("boussole_editor_manage_resource", {
      p_actor_id: authData.user.id, p_action: "media_upload_authorize",
      p_document_id: body.document_id, p_version_id: body.version_id ?? null,
      p_storage_path: path, p_content_type: mime, p_byte_size: size,
    });
    if (authzError) {
      if (authzError.code === "42501") return json(403, { error: "Droit éditorial insuffisant." });
      return json(400, { error: "Téléversement non autorisé." });
    }
    const { data, error } = await adminClient.storage.from("boussole-media").createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) return json(500, { error: "Création du téléversement sécurisé impossible." });
    return json(200, { path, token: data.token });
  }

  if (action === "manage_resource") {
    const resourceAction = body.resource_action;
    const supportedResourceActions = new Set([
      "synonym_upsert", "synonym_deactivate", "relation_upsert", "relation_delete",
      "media_register", "media_archive", "media_upload_authorize", "compatibility_update",
    ]);
    if (typeof resourceAction !== "string" || !supportedResourceActions.has(resourceAction)) {
      return json(400, { error: "Action de ressource invalide." });
    }
    if (body.document_id !== undefined && body.document_id !== null && !isUuid(body.document_id)) {
      return json(400, { error: "Identifiant documentaire invalide." });
    }
    if (body.target_document_id !== undefined && body.target_document_id !== null && !isUuid(body.target_document_id)) {
      return json(400, { error: "Identifiant du document lié invalide." });
    }
    if (body.resource_id !== undefined && body.resource_id !== null && !isUuid(body.resource_id)) {
      return json(400, { error: "Identifiant de ressource invalide." });
    }
    if (body.version_id !== undefined && body.version_id !== null && !isUuid(body.version_id)) {
      return json(400, { error: "Identifiant de version invalide." });
    }
    if (body.synonyms !== undefined &&
        (!Array.isArray(body.synonyms) || body.synonyms.length > 30 ||
         body.synonyms.some((item) => typeof item !== "string" || item.length > 180))) {
      return json(400, { error: "Liste de synonymes invalide." });
    }
    if (body.alt_text !== undefined &&
        (!body.alt_text || typeof body.alt_text !== "object" || Array.isArray(body.alt_text))) {
      return json(400, { error: "Textes alternatifs invalides." });
    }
    if (body.caption !== undefined &&
        (!body.caption || typeof body.caption !== "object" || Array.isArray(body.caption))) {
      return json(400, { error: "Légendes invalides." });
    }
    let archivedStoragePath: string | null = null;
    if (resourceAction === "media_register") {
      if (typeof body.storage_path !== "string" || !body.document_id ||
          !body.storage_path.startsWith(String(body.document_id) + "/")) {
        return json(400, { error: "Chemin média invalide." });
      }
      // Autoriser l'opération côté base avant toute lecture privilégiée de l'objet Storage.
      const { error: mediaAuthorizationError } = await adminClient.rpc("boussole_editor_manage_resource", {
        p_actor_id: authData.user.id,
        p_action: "media_upload_authorize",
        p_document_id: body.document_id,
        p_version_id: body.version_id ?? null,
        p_storage_path: body.storage_path,
        p_content_type: body.content_type ?? null,
        p_byte_size: body.byte_size ?? null,
      });
      if (mediaAuthorizationError) {
        if (mediaAuthorizationError.code === "42501") return json(403, { error: "Droit éditorial insuffisant." });
        if (mediaAuthorizationError.code === "22023") return json(400, { error: "Téléversement non autorisé." });
        return json(500, { error: "Vérification des droits média impossible." });
      }
      const { data: objectInfo, error: objectError } = await adminClient.storage.from("boussole-media").info(body.storage_path);
      if (objectError || !objectInfo) return json(400, { error: "Le fichier téléversé est introuvable." });
      if (objectInfo.metadata?.size !== undefined && Number(objectInfo.metadata.size) !== Number(body.byte_size)) {
        return json(400, { error: "La taille réelle du fichier ne correspond pas aux métadonnées." });
      }
      if (objectInfo.contentType && objectInfo.contentType !== body.content_type) {
        return json(400, { error: "Le type réel du fichier ne correspond pas aux métadonnées." });
      }
      const { data: uploadedFile, error: downloadError } = await adminClient.storage.from("boussole-media").download(body.storage_path);
      if (downloadError || !uploadedFile) return json(400, { error: "Lecture de contrôle du fichier impossible." });
      const bytes = new Uint8Array(await uploadedFile.arrayBuffer());
      if (bytes.byteLength !== Number(body.byte_size) || !validMediaSignature(String(body.content_type), bytes)) {
        return json(400, { error: "Le contenu réel du fichier ne correspond pas au type déclaré." });
      }
    }
    if (resourceAction === "media_archive" && isUuid(body.resource_id)) {
      const { data: asset } = await adminClient.from("boussole_media_assets").select("storage_path")
        .eq("id", body.resource_id).eq("document_id", body.document_id).maybeSingle();
      archivedStoragePath = asset?.storage_path ?? null;
    }
    const resourceArgs = {
      p_actor_id: authData.user.id,
      p_action: resourceAction,
      p_document_id: body.document_id ?? null,
      p_target_document_id: body.target_document_id ?? null,
      p_resource_id: body.resource_id ?? null,
      p_version_id: body.version_id ?? null,
      p_locale: body.locale ?? null,
      p_term: optionalText(body.term, 180),
      p_normalized_term: optionalText(body.normalized_term, 180),
      p_synonyms: body.synonyms ?? [],
      p_relation_type: body.relation_type ?? null,
      p_sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
      p_storage_path: optionalText(body.storage_path, 500),
      p_file_name: optionalText(body.file_name, 240),
      p_content_type: body.content_type ?? null,
      p_byte_size: body.byte_size ?? null,
      p_alt_text: body.alt_text ?? {},
      p_caption: body.caption ?? {},
      p_min_app_version: optionalText(body.min_app_version, 80),
      p_max_app_version: optionalText(body.max_app_version, 80),
    };
    const { data, error } = await adminClient.rpc("boussole_editor_manage_resource", resourceArgs);
    if (error) {
      if (resourceAction === "media_register" && typeof body.storage_path === "string") {
        const { error: cleanupError } = await adminClient.storage.from("boussole-media").remove([body.storage_path]);
        if (cleanupError) console.error("Boussole unregistered media cleanup pending:", cleanupError.message);
      }
      if (error.code === "42501") return json(403, { error: "Droit éditorial insuffisant ou opération refusée." });
      if (error.code === "P0002") return json(404, { error: "Ressource ou document introuvable." });
      if (error.code === "22023") return json(400, { error: "Les paramètres de la ressource sont invalides." });
      console.error("boussole_editor_manage_resource failed:", error.code ?? "unknown");
      return json(500, { error: "La gestion de la ressource n’a pas pu être exécutée." });
    }
    if (resourceAction === "media_archive" && archivedStoragePath) {
      const { error: removeError } = await adminClient.storage.from("boussole-media").remove([archivedStoragePath]);
      if (removeError) {
        console.error("Boussole media cleanup pending:", removeError.message);
        return json(200, { result: data, cleanup_pending: true });
      }
    }
    return json(200, { result: data });
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
