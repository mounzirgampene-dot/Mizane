// MIZANE — Lecture seule des documents publiés de la Boussole.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { normalizeBoussoleQuery, matchesBoussoleQuery } from "./boussole-search.js";
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let clientPromise;
async function getClient() {
  if (!clientPromise) clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  return clientPromise;
}
export function expandBoussoleCloudSearchVariants(query, synonymRows = []) {
  const normalized = normalizeBoussoleQuery(query);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  const tokens = normalized.split(" ").filter(Boolean);
  for (const row of synonymRows) {
    const term = normalizeBoussoleQuery(row?.normalized_term || row?.term || "");
    const synonyms = Array.isArray(row?.synonyms) ? row.synonyms.map(normalizeBoussoleQuery).filter(Boolean) : [];
    for (const token of tokens) {
      if (token === term) for (const synonym of synonyms) variants.add(normalized.replace(token, synonym));
      else if (synonyms.includes(token) && term) variants.add(normalized.replace(token, term));
    }
  }
  return [...variants].slice(0, 16);
}
export async function searchCloudBoussoleDocuments(query, { locale = "fr", limit = 8 } = {}) {
  const normalized = normalizeBoussoleQuery(query);
  if (normalized.length < 2) return { available: true, results: [] };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { available: false, results: [] };
  const supabase = await getClient();
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  let documentQuery = supabase.from("boussole_documents")
    .select("id,slug,module_key,feature_key,visibility,company_id,current_published_version,published_at")
    .eq("status", "published").order("published_at", { ascending: false }).limit(120);
  if (companyId && UUID_PATTERN.test(companyId)) documentQuery = documentQuery.or("visibility.eq.global,company_id.eq." + companyId);
  else documentQuery = documentQuery.eq("visibility", "global");
  const { data: documents, error: documentError } = await documentQuery;
  if (documentError) throw documentError;
  if (!documents?.length) return { available: true, results: [] };
  const documentIds = documents.map(document => document.id);
  const selectedLocale = locale === "ar" ? "ar" : "fr";
  const [{ data: versions, error: versionsError }, { data: synonyms, error: synonymsError }] = await Promise.all([
    supabase.from("boussole_document_versions")
      .select("document_id,version_number,locale,title,summary,content_markdown,structured_content,source_references,learning_level,estimated_minutes,published_at")
      .in("document_id", documentIds).eq("status", "published").eq("locale", selectedLocale)
      .order("version_number", { ascending: false }).limit(500),
    supabase.from("boussole_search_synonyms")
      .select("normalized_term,synonyms").eq("locale", selectedLocale).eq("is_active", true).limit(200),
  ]);
  if (versionsError) throw versionsError;
  if (synonymsError) throw synonymsError;
  const variants = expandBoussoleCloudSearchVariants(normalized, synonyms || []);
  const latestByDocument = new Map();
  for (const version of versions || []) if (!latestByDocument.has(version.document_id)) latestByDocument.set(version.document_id, version);
  const matches = [];
  for (const document of documents) {
    const version = latestByDocument.get(document.id);
    if (!version) continue;
    if (Number.isInteger(document.current_published_version) && version.version_number !== document.current_published_version) continue;
    const searchable = [document.slug, document.module_key, document.feature_key, version.title, version.summary, version.content_markdown, JSON.stringify(version.structured_content || {})].filter(Boolean).join(" ");
    if (!variants.some(variant => matchesBoussoleQuery(searchable, variant))) continue;
    matches.push({
      id: document.id, slug: document.slug, visibility: document.visibility,
      module_key: document.module_key, feature_key: document.feature_key,
      version_number: version.version_number, locale: version.locale,
      title: version.title, summary: version.summary || "",
      content_markdown: version.content_markdown || "",
      source_references: Array.isArray(version.source_references) ? version.source_references : [],
      learning_level: version.learning_level, estimated_minutes: version.estimated_minutes,
      published_at: version.published_at || document.published_at,
    });
  }
  matches.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return { available: true, results: matches.slice(0, Math.max(1, Math.min(20, Number(limit) || 8))) };
}
