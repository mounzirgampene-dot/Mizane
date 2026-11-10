// MIZANE — Assistant IA (Mistral AI) + assistant local de secours.
import { trialBalance, incomeStatement, checkAnomalies, entryTotals } from "./accounting.js";
import { formatMoney } from "./countries.js";

export function aiConfigured(store) {
  return Boolean(store.settings.aiKey);
}

async function mistralChat(store, messages, { json = false, temperature = 0.2 } = {}) {
  const { aiEndpoint, aiKey, aiModel } = store.settings;
  if (!aiKey) throw new Error("Clé API Mistral manquante (Paramètres > Assistant IA).");
  const res = await fetch(aiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + aiKey },
    body: JSON.stringify({
      model: aiModel || "mistral-small-latest",
      temperature,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erreur Mistral ${res.status} : ${txt.slice(0, 300)}`);
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
    'Quand on te demande une écriture, propose-la au format JSON : {"date":"AAAA-MM-JJ","journal":"ACH|VTE|BAN|CAI|OD","reference":"...","lines":[{"account":"...","label":"...","debit":0,"credit":0}]}.',
    "Les comptes doivent exister dans le plan fourni. L'écriture doit être équilibrée (somme débits = somme crédits).",
    "Comptes disponibles (extraits) :\n" + planDigest(store),
  ].join("\n");
}

// Texte libre -> écriture proposée (JSON) revue par l'utilisateur avant validation.
export async function suggestEntry(store, text) {
  const content = await mistralChat(store, [
    { role: "system", content: systemPrompt(store) },
    { role: "user", content: "Propose l'écriture comptable pour cette opération, uniquement le JSON :\n" + text },
  ], { json: true });
  try {
    const parsed = JSON.parse(content);
    if (parsed.lines) return parsed;
    if (parsed.ecriture?.lines) return parsed.ecriture;
  } catch (e) { /* fallthrough */ }
  throw new Error("Réponse IA inexploitable : " + content.slice(0, 300));
}

export async function chat(store, history, userMessage) {
  const messages = [
    { role: "system", content: systemPrompt(store) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  return mistralChat(store, messages, { temperature: 0.3 });
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
  return mistralChat(store, [
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
    lines.push("Pour l'assistant complet (rédaction d'écritures en langage naturel, audit, explications), ajoutez votre clé API Mistral dans Paramètres.");
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

export { entryTotals };
