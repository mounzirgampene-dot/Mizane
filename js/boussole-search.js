// Normalisation et recherche locale FR/AR — aucun accès réseau.
export function normalizeBoussoleQuery(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesBoussoleQuery(content, query) {
  const normalizedContent = normalizeBoussoleQuery(content);
  const terms = normalizeBoussoleQuery(query).split(" ").filter(Boolean);
  return terms.length > 0 && terms.every(term => normalizedContent.includes(term));
}
