// MIZANE — Assistant IA multi-fournisseurs (Mistral, Groq, Gemini) + assistant local de secours.
import { trialBalance, incomeStatement, checkAnomalies, entryTotals } from "./accounting.js";
import { formatMoney } from "./countries.js";
import { decryptSecret } from "./crypto.js";

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

export function providerOf(store) {
  const ep = store.settings.aiEndpoint || "";
  for (const [id, p] of Object.entries(PROVIDERS)) if (p.endpoint === ep) return id;
  return "custom";
}

export function visionModel(store) {
  const p = PROVIDERS[providerOf(store)];
  return p ? p.vision : store.settings.aiModel || "";
}

export function aiConfigured(store) {
  return Boolean(store.settings.aiKey || store.settings.aiKeyEnc);
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

const TIMEOUT_MS = 60000;

async function fetchTimeout(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error(`Délai dépassé : l'IA n'a pas répondu en ${TIMEOUT_MS / 1000} s. Vérifiez votre connexion Internet puis réessayez.`);
    if (e instanceof TypeError) throw new Error("Connexion au serveur de l'IA impossible. Vérifiez votre connexion Internet, désactivez l'économiseur de données ou les bloqueurs, puis réessayez.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function aiChat(store, messages, { json = false, temperature = 0.2, model } = {}) {
  const { aiEndpoint, aiKey, aiKeyEnc, aiModel } = store.settings;
  const key = aiKeyEnc ? await decryptSecret(aiKeyEnc) : aiKey;
  if (!key) throw new Error("Clé API manquante (Paramètres > Assistant IA).");
  const pid = providerOf(store);
  if (pid === "gemini") {
    const base = aiEndpoint.replace(/\/+$/, "");
    const call = async (m) => {
      const res = await fetchTimeout(`${base}/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toGeminiBody(messages, { json, temperature })) });
      const txt = res.ok ? "" : await res.text().catch(() => "");
      return { res, txt };
    };
    let m = model || aiModel || PROVIDERS.gemini.models[0];
    let { res, txt } = await call(m);
    if (res.status === 404 && /no longer available|is not found/i.test(txt) && m !== PROVIDERS.gemini.models[0]) {
      m = PROVIDERS.gemini.models[0];
      ({ res, txt } = await call(m));
    }
    if (!res.ok) throw new Error(`Erreur Gemini ${res.status} : ${txt.slice(0, 300)}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  }
  const mistral = pid === "mistral";
  const messages2 = mistral ? messages : messages.map((m) => typeof m.content !== "object" || !m.content ? m : { ...m, content: m.content.map((p) => p.type === "image_url" && typeof p.image_url === "string" ? { ...p, image_url: { url: p.image_url } } : p) });
  const res = await fetchTimeout(aiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({
      model: model || aiModel || "mistral-small-latest",
      temperature,
      messages: messages2,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erreur IA ${res.status} : ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
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
    "Les comptes doivent exister dans le plan fourni. Chaque écriture doit être équilibrée (somme débits = somme crédits).",
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
        { type: "text", text: "Voici un justificatif photographié (facture, reçu, ticket). Lis-le" + (text ? " en tenant compte de ces précisions" : "") + " et propose l'écriture comptable, uniquement le JSON :\n" + text },
        { type: "image_url", image_url: imageDataUrl },
      ]
    : "Propose l'écriture comptable pour cette opération, uniquement le JSON :\n" + text;
  const content = await aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content: userContent },
  ], { json: true, model: imageDataUrl ? visionModel(store) : undefined });
  try {
    const parsed = JSON.parse(content);
    if (parsed.lines) return parsed;
    if (parsed.ecriture?.lines) return parsed.ecriture;
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
  const today = new Date().toISOString().slice(0, 10);
  const content = await aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content:
      "Voici un texte (relevé bancaire, factures, notes, cahier d'opérations). Extrais TOUTES les opérations comptables et renvoie UNIQUEMENT un JSON : " +
      "{\"entries\":[{\"date\":\"AAAA-MM-JJ\",\"journal\":\"ACH|VTE|BAN|CAI|OD\",\"reference\":\"...\",\"lines\":[{\"account\":\"...\",\"label\":\"...\",\"debit\":0,\"credit\":0}]}]}. " +
      "Chaque écriture doit être équilibrée, avec des comptes du plan fourni. Utilise " + today + " si la date est inconnue.\n\nTEXTE :\n" + text },
  ], { json: true });
  let parsed;
  try { parsed = JSON.parse(content); } catch (_e) { throw new Error("Réponse IA inexploitable : " + content.slice(0, 300)); }
  const arr = parsed.entries || parsed.ecritures || [];
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("Aucune écriture trouvée dans la réponse IA.");
  return arr;
}

export async function aiAudit(store) {
  const anomalies = checkAnomalies(store);
  const is = incomeStatement(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const tb = trialBalance(store, store.settings.exerciceStart, store.settings.exerciceEnd);
  const resume = [
    `Écritures : ${store.entries.length}. Anomalies détectées par le moteur : ${anomalies.length}.`,
    `Balance : débits ${tb.totals.debit} / crédits ${tb.totals.credit}.`,
    `Produits ${is.totProduits} - Charges ${is.totCharges} = Résultat ${is.resultat}.`,
    anomalies.slice(0, 20).map((a) => "- " + a.message).join("\n"),
  ].join("\n");
  return aiChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content: "Voici l'état de ma comptabilité. Analyse-la, signale les erreurs, les comptes suspects, les oublis probables (TVA, charges à payer…) et donne des recommandations concrètes :\n" + resume },
  ], { temperature: 0.3 });
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
  return { date: new Date().toISOString().slice(0, 10), journal: isSale ? "VTE" : "ACH", reference: "IA locale", lines };
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
  const today = new Date().toISOString().slice(0, 10);
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
      date: m[1] || today,
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
