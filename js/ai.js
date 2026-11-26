// MIZANE — Assistant IA multi-fournisseurs (Mistral, Groq, Gemini) + assistant local de secours.
import { trialBalance, incomeStatement, checkAnomalies, entryTotals, validDate } from "./accounting.js";
import { buildAccountingControlReport } from "./accounting-controls.js";
import { getTaxCountryProfile, getActiveTaxRules } from "./tax-core.js";
import { formatMoney } from "./countries.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
const aiSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const activeCompanyId = () => localStorage.getItem(ACTIVE_COMPANY_KEY) || "";
const aiStatusKey = (companyId, provider) => "mizane_ai_configured_" + companyId + "_" + provider;
export async function configureCompanyAI(provider, apiKey) {
  const companyId = activeCompanyId();
  if (!companyId) throw new Error("Sélectionnez une entreprise dans votre espace MIZANE.");
  const { data, error } = await aiSupabase.functions.invoke("company-ai", { body: { action: "configure", company_id: companyId, provider, api_key: apiKey } });
  if (error) throw new Error(data?.error || "Enregistrement sécurisé de la clé impossible.");
  localStorage.setItem(aiStatusKey(companyId, provider), "1");
  return data;
}
export async function deleteCompanyAI(provider) {
  const companyId = activeCompanyId();
  if (!companyId) throw new Error("Aucune entreprise active.");
  const { data, error } = await aiSupabase.functions.invoke("company-ai", { body: { action: "delete", company_id: companyId, provider } });
  if (error) throw new Error(data?.error || "Suppression de la clé impossible.");
  localStorage.setItem(aiStatusKey(companyId, provider), "0");
  return data;
}
export async function refreshCompanyAIStatus(provider) {
  const companyId = activeCompanyId();
  if (!companyId) throw new Error("Sélectionnez une entreprise active.");
  const { data, error } = await aiSupabase.functions.invoke("company-ai", { body: { action: "status", company_id: companyId, provider } });
  if (error) throw new Error(data?.error || "État IA indisponible.");
  const configured = Array.isArray(data?.providers) && data.providers.includes(provider);
  localStorage.setItem(aiStatusKey(companyId, provider), configured ? "1" : "0");
  return { configured, role: data?.role || null, providers: data?.providers || [] };
}

export const PROVIDERS = {
  mistral: {
    label: "Mistral AI",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest", "open-mistral-nemo", "ministral-8b-latest", "pixtral-12b-2409"],
    vision: "pixtral-12b-2409",
    keyUrl: "console.mistral.ai/api-keys",
  },
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    models: ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "openai/gpt-oss-120b", "llama-3.1-8b-instant"],
    vision: "meta-llama/llama-4-scout-17b-16e-instruct",
    keyUrl: "console.groq.com/keys",
  },
  gemini: {
    label: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash"],
    vision: "gemini-3.8-flash",
    keyUrl: "aistudio.google.com/apikey",
  },
};

export function detectedProviderFromEndpoint(endpoint) {
  const ep = endpoint || "";
  for (const [id, p] of Object.entries(PROVIDERS)) if (p.endpoint === ep) return id;
  return "mistral";
}

export function providerOf(store) {
  const stored = store.settings.aiProvider;
  if (stored && PROVIDERS[stored]) return stored;
  return detectedProviderFromEndpoint(store.settings.aiEndpoint);
}

export function visionModel(store) {
  const p = PROVIDERS[providerOf(store)];
  return p ? p.vision : store.settings.aiModel || "";
}

export function aiConfigured(store) {
  const companyId = activeCompanyId();
  return Boolean(companyId && localStorage.getItem(aiStatusKey(companyId, providerOf(store))) === "1");
}

// Messages (format OpenAI) -> corps d'appel Gemini (format generateContent).
export function toGeminiBody(messages, { json = false, temperature = 0.2 } = {}) {
  const system = [];
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") { system.push(typeof m.content === "string" ? m.content : ""); continue; }
    const parts = [];
    if (typeof m.content === "string") parts.push({ text: m.content });
    else for (const p of m.content) {
      if (p.type === "text") parts.push({ text: p.text });
      else if (p.type === "image_url") {
        const src = typeof p.image_url === "string" ? p.image_url : p.image_url.url;
        const head = src.slice(0, src.indexOf(","));
        parts.push({ inline_data: { mime_type: head.slice(head.indexOf(":") + 1, head.indexOf(";")), data: src.slice(src.indexOf(",") + 1) } });
      }
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }
  return { systemInstruction: { parts: [{ text: system.join("\n") }] }, contents, generationConfig: { temperature, ...(json ? { response_mime_type: "application/json" } : {}) } };
}

async function aiChat(store, messages, { json = false, temperature = 0.2, model } = {}) {
  const companyId = activeCompanyId();
  if (!companyId) throw new Error("Sélectionnez une entreprise cloud dans votre espace MIZANE.");
  const pid = providerOf(store);
  if (!PROVIDERS[pid]) throw new Error("Choisissez Mistral, Groq ou Gemini dans les paramètres IA.");
  const { data: sessionData } = await aiSupabase.auth.getSession();
  const session = sessionData?.session;
  if (!session?.access_token) throw new Error("Connectez-vous à votre espace MIZANE pour utiliser l'assistant IA.");
  const response = await fetch(SUPABASE_URL + "/functions/v1/company-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + session.access_token, "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "chat", company_id: companyId, provider: pid, model: model || store.settings.aiModel || PROVIDERS[pid].models[0], temperature, json, messages }),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error("Réponse invalide du serveur IA MIZANE."); }
  if (!response.ok) throw new Error(data?.error || "Erreur du serveur IA (" + response.status + ").");
  return data.content || "";
}

function planDigest(store, limit = 80) {
  const accts = [...store.settings.customAccounts, ...(store.__planAccounts || [])];
  return accts.slice(0, limit).map((a) => `${a.code} ${a.label} (${a.type})`).join("\n");
}

export function systemPrompt(store) {
  return [
    "Tu es l'assistant comptable intégré de MIZANE, application de comptabilité générale en partie double.",
    `Société : ${store.settings.companyName}. Pays : ${store.settings.country}. Devise : ${store.settings.currency}.`,
    `Plan comptable : ${store.settings.plan}. Exercice : ${store.settings.exerciceStart} au ${store.settings.exerciceEnd}.`,
    "Réponds toujours dans la langue de l'utilisateur (français par défaut).",
    "Quand on te demande une écriture, propose-la au format JSON : {\"date\":\"AAAA-MM-JJ\",\"journal\":\"ACH|VTE|BAN|CAI|OD\",\"reference\":\"...\",\"lines\":[{\"account\":\"...\",\"label\":\"...\",\"debit\":0,\"credit\":0}]}",
    "Quand on te demande plusieurs écritures à partir d'un texte, renvoie : {\"entries\":[ ...même format... ]}.",
    "Les comptes doivent exister dans le plan fourni. Chaque écriture doit être équilibrée (somme débits = somme crédits). Ne devine jamais une date, un montant, un compte, une devise ou une TVA absents ou illisibles : signale l’incertitude et laisse la valeur vide ou demande une précision. Ne déduis jamais un taux de TVA sans preuve explicite sur le justificatif et le contexte fiscal applicable. Une écriture proposée reste une hypothèse à vérifier par l’utilisateur, jamais une validation fiscale ou juridique.",
    "Comptes disponibles (extrait) :\n" + planDigest(store),
  ].join("\n");
}

// Photo -> dataURL JPEG compressé (pour l'IA vision).
export function imageFileToDataUrl(file, maxDim = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const img = new Image();
    reader.onload = () => { img.src = reader.result; };
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    reader.onerror = img.onerror = () => reject(new Error("Image illisible."));
    reader.readAsDataURL(file);
  });
}

// Texte libre (+ photo optionnelle) -> écriture proposée (JSON) revue par l'utilisateur avant validation.
export async function suggestEntry(store, text, imageDataUrl = null) {
  const userContent = imageDataUrl
    ? [
        { type: "text", text: "Lis ce justificatif (facture, reçu, ticket ou document de transaction), relève uniquement les faits visibles et prépare une écriture détaillée. Renvoie un JSON avec date, journal, reference, lines, sourceFacts (faits visibles) et uncertainties (données absentes, ambiguës ou illisibles). N’invente aucun montant, compte, date, devise ou taux fiscal." + (text ? "\nPrécisions fournies par l’utilisateur : " + text : "") },
        { type: "image_url", image_url: imageDataUrl },
      ]
    : "Analyse cette opération et prépare une écriture comptable détaillée. N'invente aucune donnée. Renvoie uniquement un JSON contenant date, journal, reference, lines, sourceFacts et uncertainties :\n" + text;
  const content = await aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content: userContent },
  ], { json: true, model: imageDataUrl ? visionModel(store) : undefined });
  try {
    const parsed = JSON.parse(content);
    const proposal = parsed.lines ? parsed : parsed.ecriture?.lines ? parsed.ecriture : parsed.entry?.lines ? parsed.entry : null;
    if (proposal) return {
      ...proposal,
      aiReview: {
        sourceFacts: Array.isArray(parsed.sourceFacts) ? parsed.sourceFacts.slice(0, 20) : [],
        uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.slice(0, 20) : [],
      },
    };
  } catch (_e) { /* fallthrough */ }
  throw new Error("Réponse IA inexploitable : " + content.slice(0, 300));
}

export async function chat(store, history, userMessage) {
  const messages = [
    { role: "system", content: systemPrompt(store) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  return aiChat(store, messages, { temperature: 0.3 });
}

// Conversation avec photo (modèle vision du fournisseur).
export async function chatWithImage(store, history, text, imageDataUrl) {
  return aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: imageDataUrl }] },
  ], { temperature: 0.3, model: visionModel(store) });
}

// Texte (relevé, factures, notes…) -> tableau d'écritures proposées par l'IA.
export async function importEntriesFromText(store, text) {
  const content = await aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content:
      "Voici un texte (relevé bancaire, factures, notes, cahier d'opérations). Extrais TOUTES les opérations comptables et renvoie UNIQUEMENT un JSON : " +
      "{\"entries\":[{\"date\":\"AAAA-MM-JJ\",\"journal\":\"ACH|VTE|BAN|CAI|OD\",\"reference\":\"...\",\"lines\":[{\"account\":\"...\",\"label\":\"...\",\"debit\":0,\"credit\":0}],\"sourceFacts\":[],\"uncertainties\":[]} ]}. " +
      "Chaque écriture doit être équilibrée et utiliser des comptes du plan fourni. Renseigne sourceFacts avec les éléments réellement présents dans le texte et uncertainties avec les champs absents, ambigus ou illisibles. Si la date est absente ou illisible, laisse date vide : ne la remplace jamais par la date du jour. Ne complète aucune donnée manquante.\n\nTEXTE :\n" + text },
  ], { json: true });
  let parsed;
  try { parsed = JSON.parse(content); } catch (_e) { throw new Error("Réponse IA inexploitable : " + content.slice(0, 300)); }
  const arr = parsed.entries || parsed.ecritures || [];
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Aucune écriture trouvée dans la réponse IA.");
  return arr.map((entry) => ({ ...entry, date: validDate(entry?.date) ? entry.date : "", aiReview: { sourceFacts: Array.isArray(entry?.sourceFacts) ? entry.sourceFacts.slice(0, 20) : [], uncertainties: Array.isArray(entry?.uncertainties) ? entry.uncertainties.slice(0, 20) : [] } }));
}

export function buildAiAuditSnapshot(store) {
  const controls = buildAccountingControlReport(store);
  const profile = getTaxCountryProfile(store?.settings?.country);
  const taxFindings = [];
  let taxMetadataCount = 0;
  for (const entry of (Array.isArray(store?.entries) ? store.entries : [])) {
    if (!validDate(entry?.date)) continue;
    if ((controls.period.start && entry.date < controls.period.start) || (controls.period.end && entry.date > controls.period.end)) continue;
    for (const [index, line] of (Array.isArray(entry.lines) ? entry.lines : []).entries()) {
      const rawRate = line?.taxRate ?? line?.vatRate;
      const taxCode = String(line?.taxCode || line?.vatCode || "").trim();
      const rawTax = line?.taxAmount ?? line?.vatAmount;
      const rawBase = line?.taxBase ?? line?.taxableBase ?? line?.baseAmount;
      if (rawRate === undefined && !taxCode && rawTax === undefined && rawBase === undefined) continue;
      taxMetadataCount++;
      const add = (type, message, extra = {}) => taxFindings.push({
        type, entryId: entry.id ?? null, date: entry.date, line: index + 1,
        account: String(line?.account || ""), message, ...extra,
      });
      if (profile.status !== "active") {
        add("tax_reference_unavailable", "Données fiscales explicites détectées, mais aucun référentiel fiscal actif et vérifié ne permet de qualifier cette ligne. Aucun taux n’a été supposé.");
        continue;
      }
      const rules = getActiveTaxRules(profile.countryCode, "VAT", entry.date);
      if (!rules.length) {
        add("tax_reference_missing", "Aucune règle de TVA active n’est disponible dans le référentiel pour cette date. Le contrôle du taux est indisponible.", { taxCode: taxCode || null });
        continue;
      }
      const codeRule = taxCode ? rules.find(rule => rule.code === taxCode) : null;
      const rate = rawRate === "" || rawRate === null || rawRate === undefined ? NaN : Number(rawRate);
      if (taxCode && !codeRule) add("tax_code_unrecognized", "Code fiscal absent ou inactif dans le référentiel officiel à la date de l’écriture.", { taxCode });
      if (Number.isFinite(rate) && (rate < 0 || rate > 100)) add("tax_rate_invalid", "Taux fiscal hors de l’intervalle autorisé.", { rate });
      else if (Number.isFinite(rate) && !rules.some(rule => Math.abs(rule.rate - rate) < 0.0001)) {
        add("tax_rate_unreferenced", "Taux présent sur la ligne mais non reconnu par le référentiel actif à cette date. Vérification humaine nécessaire.", { rate });
      }
      if (codeRule && Number.isFinite(rate) && Math.abs(codeRule.rate - rate) > 0.0001) {
        add("tax_code_rate_mismatch", "Le code fiscal et le taux saisi sur la ligne ne correspondent pas.", { taxCode, rate, officialRate: codeRule.rate });
      }
      const effectiveRate = Number.isFinite(rate) ? rate : codeRule?.rate;
      if (!Number.isFinite(effectiveRate) && (rawTax !== undefined || rawBase !== undefined)) {
        add("tax_data_incomplete", "Informations fiscales incomplètes : aucun taux explicite ni code fiscal reconnu ne permet de vérifier le calcul.");
      }
      const taxAmount = rawTax === "" || rawTax === null || rawTax === undefined ? NaN : Number(rawTax);
      const base = rawBase === "" || rawBase === null || rawBase === undefined ? NaN : Number(rawBase);
      if (Number.isFinite(taxAmount) && Number.isFinite(base) && Number.isFinite(effectiveRate) && base >= 0 && taxAmount >= 0) {
        const expected = Math.round((base * effectiveRate / 100 + Number.EPSILON) * 100) / 100;
        if (Math.abs(expected - taxAmount) > 0.02) add("tax_amount_mismatch", "Montant de taxe différent du calcul arithmétique à partir de la base et du taux explicitement enregistrés.", { expectedTax: expected, recordedTax: taxAmount });
      }
    }
  }
  return {
    period: controls.period,
    accounting: {
      totals: controls.totals,
      bySeverity: controls.bySeverity,
      warnings: controls.warnings.slice(0, 35),
      abnormalBalances: controls.balances.filter(row => row.abnormalSide).slice(0, 25),
    },
    tax: {
      countryCode: profile.countryCode,
      countryName: profile.countryName,
      referenceStatus: profile.status,
      rulesVersion: profile.rulesVersion || null,
      explicitTaxLines: taxMetadataCount,
      findings: taxFindings.slice(0, 35),
      note: taxMetadataCount ? null : "Aucune donnée fiscale explicite détectée dans les lignes comptables. Cela ne prouve ni l’absence ni la présence d’une TVA oubliée.",
    },
  };
}

export async function aiAudit(store) {
  const snapshot = buildAiAuditSnapshot(store);
  const is = incomeStatement(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const tb = trialBalance(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const resume = [
    `Écritures : ${store.entries.length}.`,
    `Balance : débits ${tb.totals.debit} / crédits ${tb.totals.credit}.`,
    `Produits ${is.totProduits} - Charges ${is.totCharges} = Résultat ${is.resultat}.`,
    "Contrôles comptables et fiscaux structurés :",
    JSON.stringify(snapshot),
  ].join("\n");
  return aiChat(store, [
    { role: "system", content: systemPrompt(store) + "\nPour l’audit, distingue impérativement les anomalies calculées des hypothèses à examiner. Ne conclus jamais à une fraude ou à une omission fiscale sur une simple absence de donnée. N’invente ni taux, ni règle, ni obligation fiscale. Si le référentiel fiscal du pays n’est pas actif, indique clairement que le contrôle de conformité au taux n’est pas disponible. Donne des recommandations traçables en citant les identifiants d’écriture, dates et comptes disponibles. L’audit est consultatif et ne modifie aucune écriture." },
    { role: "user", content: "Effectue un audit comptable et une revue de cohérence fiscale à partir des éléments calculés ci-dessous. Sépare les constats vérifiables, les signaux à examiner et les limites du contrôle.\n" + resume },
  ], { temperature: 0.2 });
}

// ---------- Assistant local (sans clé API) ----------

export function localAssist(store, question) {
  const q = (question || "").toLowerCase();
  const is = incomeStatement(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const tb = trialBalance(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const anomalies = checkAnomalies(store);
  const cur = store.settings.currency;
  const lines = [];
  if (q.includes("résultat") || q.includes("resultat") || q.includes("bénéfice") || q.includes("benefice")) {
    lines.push(`Produits : ${formatMoney(is.totProduits, cur)} — Charges : ${formatMoney(is.totCharges, cur)}.`);
    lines.push(`Résultat de l'exercice : ${formatMoney(is.resultat, cur)} (${is.resultat >= 0 ? "bénéfice" : "perte"}).`);
  } else if (q.includes("balance") || q.includes("totaux")) {
    lines.push(`Balance : débits ${formatMoney(tb.totals.debit, cur)} / crédits ${formatMoney(tb.totals.credit, cur)}.`);
    lines.push(tb.totals.debit === tb.totals.credit ? "La balance est équilibrée." : "⚠ La balance n'est pas équilibrée, vérifiez les écritures.");
  } else if (q.includes("erreur") || q.includes("anomalie") || q.includes("contrôle") || q.includes("controle")) {
    if (!anomalies.length) lines.push("Aucune anomalie détectée par le moteur local (équilibre, comptes inconnus, doublons).");
    else { lines.push(`${anomalies.length} anomalie(s) :`); anomalies.slice(0, 10).forEach((a) => lines.push("• " + a.message)); }
  } else if (q.includes("tva")) {
    lines.push("Astuce TVA : à la vente, créditez le compte de produit et le compte TVA facturée (4431/4457 selon plan), débiterez le client TTC.");
    lines.push("À l'achat : débiterez la charge ou l'immobilisation HT + TVA récupérable (4452/4456), créditez le fournisseur TTC.");
  } else {
    lines.push("Assistant local actif (sans IA). Questions utiles : « résultat », « balance », « erreurs », « TVA ».");
    lines.push("Pour l'assistant complet (rédaction d'écritures en langage naturel, audit, explications), ajoutez votre clé IA (Groq, Gemini ou Mistral) dans Paramètres.");
  }
  return lines.join("\n");
}

// Détection d'erreurs locale toujours disponible, même avec IA.
export function localAuditSummary(store) {
  const anomalies = checkAnomalies(store);
  const dup = anomalies.filter((a) => a.type === "doublon").length;
  const unk = anomalies.filter((a) => a.type === "compte_inconnu").length;
  const des = anomalies.filter((a) => a.type === "desequilibre").length;
  return { total: anomalies.length, doublons: dup, comptesInconnus: unk, desequilibres: des, anomalies };
}

export function parseEntryFromTextLocal(store, text) {
  // Repli simple : « achat matériel 5000 en espèces » -> OD. L'IA reste bien meilleure.
  const m = text.match(/([\d\s.,]+)\s*(?:fcfa|dh|mad|eur|€|tnd|dt|usd|\$)?/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/[\s,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!amount || amount <= 0) return null;
  const t = text.toLowerCase();
  const isSale = t.includes("vente") || t.includes("facturé") || t.includes("facture client");
  const isCash = t.includes("espèce") || t.includes("espece") || t.includes("caisse");
  const isBank = t.includes("banque") || t.includes("virement") || t.includes("chèque") || t.includes("cheque");
  const lines = isSale
    ? [
        { account: isCash ? "571" : isBank ? "521" : "411", label: text.slice(0, 60), debit: amount, credit: 0 },
        { account: "701", label: text.slice(0, 60), debit: 0, credit: amount },
      ]
    : [
        { account: "6055", label: text.slice(0, 60), debit: amount, credit: 0 },
        { account: isCash ? "571" : isBank ? "521" : "401", label: text.slice(0, 60), debit: 0, credit: amount },
      ];
  return { date: "", journal: isSale ? "VTE" : "ACH", reference: "IA locale", lines };
}

// Repli local de l'import de texte : une ligne par écriture, format
// « AAAA-MM-JJ compteDébit compteCrédit montant libellé » (date optionnelle).
function guessJournalLocal(debit, credit) {
  const d = String(debit), c = String(credit);
  if (d.startsWith("7") || c.startsWith("7")) return "VTE";
  if (d.startsWith("52") || c.startsWith("52")) return "BAN";
  if (d.startsWith("57") || c.startsWith("57")) return "CAI";
  if (d.startsWith("6") || d.startsWith("2")) return "ACH";
  return "OD";
}

export function parseEntriesFromTextLocal(store, text) {
  const out = [];
  for (const raw of String(text || "").split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{2,6})\s+(\d{2,6})\s+([\d\s.,]+?)\s*(.*)$/);
    if (!m) continue;
    const amount = Number(m[4].replace(/[\s,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (!amount || amount <= 0) continue;
    const label = (m[5] || line).slice(0, 60);
    out.push({
      date: m[1] || "",
      journal: guessJournalLocal(m[2], m[3]),
      reference: "Import local",
      lines: [
        { account: m[2], label, debit: amount, credit: 0 },
        { account: m[3], label, debit: 0, credit: amount },
      ],
    });
  }
  return out;
}

export { entryTotals };
