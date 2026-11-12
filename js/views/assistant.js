// MIZANE — Écrans : assistant IA (photo, import de texte, audit) et paramètres.
import { validateEntry, postEntry, checkAnomalies } from "../accounting.js";
import { PLANS, getPlan, ACCOUNT_TYPES } from "../plans.js";
import { COUNTRIES, getCountry } from "../countries.js";
import {
  aiConfigured, chat, chatWithImage, aiAudit, localAssist, localAuditSummary,
  imageFileToDataUrl, importEntriesFromText, parseEntriesFromTextLocal, PROVIDERS, providerOf,
} from "../ai.js";
import { saveStore, exportJSON, importJSON, resetStore, demoData } from "../db.js";
import { LANGS } from "../i18n.js";
import { encryptSecret } from "../crypto.js";
import { store, planAccounts, aiHistory, $app, router, toast, esc, refreshPlan, initStore } from "../state.js";

export function viewAssistant() {
  const audit = localAuditSummary(store);
  const configured = aiConfigured(store);
  $app.innerHTML = `
    <h1>Assistant IA</h1>
    ${configured
      ? `<p class="ok-msg">✓ IA connectée (${esc(PROVIDERS[providerOf(store)]?.label || "fournisseur personnalisé")}, modèle ${esc(store.settings.aiModel)}).</p>`
      : `<p class="warn">⚠ Aucune clé API configurée. L'assistant local basique est actif. Ajoutez votre clé dans <a href="#settings">Paramètres</a> (Groq, Gemini ou Mistral — gratuit).</p>`}
    <div class="grid cols-3">
      <div class="card kpi"><div class="value">${audit.total}</div><div class="label">Anomalies (moteur local)</div></div>
      <div class="card kpi"><div class="value">${audit.desequilibres}</div><div class="label">Déséquilibres</div></div>
      <div class="card kpi"><div class="value">${audit.comptesInconnus}</div><div class="label">Comptes inconnus</div></div>
    </div>
    <div class="card">
      <h2>📥 Remplir la comptabilité depuis un texte</h2>
      <p class="muted">Collez un relevé bancaire, des factures ou vos notes. L'IA crée toutes les écritures : grand livre, balance, bilan et résultat se remplissent automatiquement. Format local sans clé : une ligne par opération « date compteDébit compteCrédit montant libellé ».</p>
      <textarea id="import-text" rows="6" placeholder="Ex. :&#10;2025-01-05 521 101 1000000 Apport en capital&#10;2025-01-10 601 401 25000 Achat marchandises à crédit&#10;2025-01-15 571 701 118000 Vente au comptant"></textarea>
      <div class="actions"><button id="import-run">${configured ? "🤖 Analyser avec l'IA" : "Analyser (mode local)"}</button></div>
      <div id="import-result" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h2>💬 Conversation</h2>
      <div class="chat-box" id="chat-box">
        <div class="chat-msg ai">Bonjour ! Je suis l'assistant comptable MIZANE${configured ? " (IA connectée)" : " (mode local)"}. Posez vos questions, ou joignez la photo d'une facture ou d'un reçu pour que je la lise.</div>
        ${aiHistory.map((m) => `<div class="chat-msg ${m.role === "user" ? "user" : "ai"}">${esc(m.content)}</div>`).join("")}
      </div>
      <div class="img-preview hidden" id="chat-img-preview"><img id="chat-img-thumb" alt="aperçu"><span class="muted" id="chat-img-name"></span><button class="danger small" id="chat-img-remove">✕</button></div>
      <div class="row">
        <div class="nogrow"><button class="secondary" id="chat-photo" title="Joindre une photo de facture ou reçu">📷</button></div>
        <input type="file" id="chat-file" accept="image/*" class="hidden">
        <input id="chat-input" placeholder="Ex. : Quel est mon résultat ? Ou « lis cette facture » avec une photo…">
        <div class="nogrow"><button id="chat-send">Envoyer</button></div>
      </div>
    </div>
    <div class="card">
      <h2>🔎 Audit intelligent</h2>
      <p class="muted">Analyse complète des écritures : erreurs, TVA oubliée, comptes suspects, recommandations.</p>
      <button id="audit-run">${configured ? "Lancer l'audit IA" : "Lancer le contrôle local"}</button>
      <div id="audit-result" style="margin-top:10px"></div>
    </div>
  `;

  // ---- Import de texte -> écritures ----
  document.getElementById("import-run").addEventListener("click", async () => {
    const text = document.getElementById("import-text").value.trim();
    if (!text) return toast("Collez d'abord un texte.");
    const out = document.getElementById("import-result");
    out.innerHTML = `<p class="muted">⏳ Analyse en cours…</p>`;
    let proposals;
    try {
      proposals = configured ? await importEntriesFromText(store, text) : parseEntriesFromTextLocal(store, text);
    } catch (err) {
      out.innerHTML = `<p class="errors">${esc(err.message)}</p>`;
      return;
    }
    if (!proposals.length) { out.innerHTML = `<p class="errors">Aucune opération reconnue dans ce texte.</p>`; return; }
    const checked = proposals.map((p) => ({ p, v: validateEntry(store, p) }));
    const valid = checked.filter((c) => c.v.ok);
    out.innerHTML = `
      <p>${checked.length} écriture(s) proposée(s) — ${valid.length} valide(s), ${checked.length - valid.length} à corriger.</p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Journal</th><th>Détail</th><th>Contrôle</th></tr></thead>
      <tbody>${checked.map((c) => `<tr><td>${esc(c.p.date)}</td><td>${esc(c.p.journal)}</td>
        <td class="muted">${esc(c.p.lines.map((l) => `${l.account} ${l.debit ? "D" + l.debit : "C" + l.credit}`).join(" · "))}</td>
        <td>${c.v.ok ? `<span class="ok-msg">✓ équilibrée</span>` : `<span class="errors">✗ ${esc(c.v.errors[0] || "invalide")}</span>`}</td></tr>`).join("")}</tbody></table></div>
      ${valid.length ? `<div class="actions"><button id="import-save">Enregistrer les ${valid.length} écriture(s) valide(s)</button></div>` : ""}`;
    if (valid.length) {
      document.getElementById("import-save").addEventListener("click", () => {
        let n = 0;
        for (const c of valid) { const r = postEntry(store, c.p); if (r.ok) n++; }
        saveStore(store);
        toast(`✓ ${n} écriture(s) enregistrée(s) : grand livre, balance, bilan et résultat mis à jour.`);
        router.go("entries");
      });
    }
  });

  // ---- Conversation avec photo ----
  let photoData = null;
  const preview = document.getElementById("chat-img-preview");
  document.getElementById("chat-photo").addEventListener("click", () => document.getElementById("chat-file").click());
  document.getElementById("chat-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photoData = await imageFileToDataUrl(file);
      document.getElementById("chat-img-thumb").src = photoData;
      document.getElementById("chat-img-name").textContent = file.name;
      preview.classList.remove("hidden");
    } catch (err) { toast(err.message); }
  });
  document.getElementById("chat-img-remove").addEventListener("click", () => {
    photoData = null;
    preview.classList.add("hidden");
    document.getElementById("chat-file").value = "";
  });
  const send = async () => {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg && !photoData) return;
    if (photoData && !aiConfigured(store)) { toast("La lecture de photo nécessite une clé IA (Paramètres)."); return; }
    const shown = msg || "(photo jointe)";
    aiHistory.push({ role: "user", content: shown });
    input.value = "";
    const box = document.getElementById("chat-box");
    box.insertAdjacentHTML("beforeend",
      `<div class="chat-msg user">${photoData ? `<img src="${photoData}" class="chat-img" alt="photo jointe">` : ""}${esc(shown)}</div><div class="chat-msg ai">⏳ …</div>`);
    box.scrollTop = box.scrollHeight;
    let reply;
    try {
      reply = photoData
        ? await chatWithImage(store, aiHistory.slice(0, -1), msg || "Lis ce justificatif et résume les montants.", photoData)
        : aiConfigured(store) ? await chat(store, aiHistory.slice(0, -1), msg) : localAssist(store, msg);
    } catch (err) {
      reply = "Erreur IA : " + err.message + "\n\nRéponse de l'assistant local :\n" + localAssist(store, msg);
    }
    aiHistory.push({ role: "assistant", content: reply });
    box.querySelector(".chat-msg.ai:last-child").textContent = reply;
    box.scrollTop = box.scrollHeight;
  };
  document.getElementById("chat-send").addEventListener("click", send);
  document.getElementById("chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  document.getElementById("audit-run").addEventListener("click", async () => {
    const out = document.getElementById("audit-result");
    out.innerHTML = `<p class="muted">⏳ Analyse en cours…</p>`;
    const anomalies = checkAnomalies(store);
    let html = anomalies.length
      ? `<ul class="errors">${anomalies.slice(0, 15).map((a) => `<li>${esc(a.message)}</li>`).join("")}</ul>`
      : `<p class="ok-msg">✓ Aucune anomalie détectée par le moteur local.</p>`;
    if (aiConfigured(store)) {
      try { html += `<div class="chat-msg ai" style="max-width:100%">${esc(await aiAudit(store))}</div>`; }
      catch (err) { html += `<p class="errors">${esc(err.message)}</p>`; }
    }
    out.innerHTML = html;
  });
}

export function viewSettings() {
  const s = store.settings;
  const plan = getPlan(s.plan);
  const pid = providerOf(store);
  $app.innerHTML = `
    <h1>Paramètres</h1>
    <div class="card">
      <h2>🏢 Société & internationalisation</h2>
      <div class="row">
        <div><label>Nom de la société</label><input id="s-company" value="${esc(s.companyName)}"></div>
        <div><label>Pays (plan, devise, TVA choisis automatiquement)</label>
          <select id="s-country">${COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === s.country ? "selected" : ""}>${esc(c.name)} — ${c.currency} (${esc(c.zone)})</option>`).join("")}</select>
        </div>
      </div>
      <div class="row">
        <div><label>Plan comptable</label>
          <select id="s-plan">${Object.values(PLANS).map((p) => `<option value="${p.id}" ${p.id === s.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        </div>
        <div><label>Devise</label><input id="s-currency" value="${esc(s.currency)}" maxlength="3"></div>
        <div><label>Langue</label>
          <select id="s-language">${LANGS.map(([id, label]) => `<option value="${id}" ${(s.language || "fr") === id ? "selected" : ""}>${label}</option>`).join("")}</select>
        </div>
      </div>
      <div class="row">
        <div><label>Début d'exercice</label><input type="date" id="s-start" value="${esc(s.exerciceStart)}"></div>
        <div><label>Fin d'exercice</label><input type="date" id="s-end" value="${esc(s.exerciceEnd)}"></div>
        <div class="nogrow"><button id="s-save">Enregistrer</button></div>
      </div>
      <p class="muted" id="s-vat"></p>
    </div>

    <div class="card">
      <h2>🤖 Assistant IA</h2>
      <div class="row">
        <div><label>Fournisseur</label>
          <select id="s-aiprovider">
            ${Object.entries(PROVIDERS).map(([id, p]) => `<option value="${id}" ${pid === id ? "selected" : ""}>${p.label} — gratuit</option>`).join("")}
            <option value="custom" ${pid === "custom" ? "selected" : ""}>Personnalisé (compatible OpenAI)</option>
          </select>
        </div>
        <div><label>Clé API</label><input id="s-aikey" type="password" placeholder="Collez votre clé API" value="" ${s.aiKeyEnc ? "data-enc=\"1\"" : ""}></div>
        ${pid === "custom"
          ? `<div><label>Modèle</label><input id="s-aimodel-text" value="${esc(s.aiModel || "")}" placeholder="nom-du-modèle"></div>`
          : `<div><label>Modèle</label>
          <select id="s-aimodel">
            ${(PROVIDERS[pid].models.includes(s.aiModel) ? PROVIDERS[pid].models : [s.aiModel, ...PROVIDERS[pid].models]).map((m) => `<option ${m === s.aiModel ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>`}
      </div>
      <div class="row" ${pid === "custom" ? "" : "hidden"}>
        <div><label>Endpoint (compatible OpenAI)</label><input id="s-aiendpoint" placeholder="https://…/v1/chat/completions" value="${esc(s.aiEndpoint || "")}"></div>
      </div>
      <p class="muted" id="s-aikey-status">${s.aiKeyEnc ? "🔐 Clé chiffrée enregistrée sur cet appareil (AES-GCM)." : s.aiKey ? "⚠️ Clé en clair — resaisissez-la pour la chiffrer." : "Aucune clé enregistrée."} ${pid === "custom" ? "" : `Clé gratuite sur ${PROVIDERS[pid].keyUrl}.`} Les photos sont analysées par le modèle vision ${pid === "custom" ? "du fournisseur choisi" : PROVIDERS[pid].vision}.</p>
    </div>

    <div class="card">
      <h2>🔐 Confidentialité</h2>
      <p class="muted">Toutes vos données comptables restent sur votre appareil (stockage local). Rien n'est envoyé sur Internet, sauf : les textes/photos que vous soumettez à l'assistant IA (envoyés au fournisseur choisi dans les Paramètres : Mistral, Groq ou Google), et les sauvegardes que vous exportez vous-même.</p>
      <p class="muted">La clé API est chiffrée localement (AES-GCM, Web Crypto) avant d'être stockée. Attention : ce chiffrement protège contre une lecture directe du stockage, mais si votre appareil est compromis (logiciel malveillant, accès physique non verrouillé), la clé pourrait être récupérée. Utilisez le verrouillage de l'appareil et ne le partagez pas.</p>
    </div>

    <div class="card">
      <h2>📓 Plan de comptes — ${esc(plan.name)} (${planAccounts.length} comptes)</h2>
      <div class="row">
        <div><label>Nouveau compte (numéro)</label><input id="ca-code" placeholder="Ex. 7085"></div>
        <div><label>Libellé</label><input id="ca-label" placeholder="Ex. Ventes de services divers"></div>
        <div><label>Type</label><select id="ca-type">${Object.entries(ACCOUNT_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div class="nogrow"><button id="ca-add">Ajouter</button></div>
      </div>
      ${s.customAccounts.length ? `<p class="muted">Comptes personnalisés : ${s.customAccounts.map((a) => esc(a.code) + " " + esc(a.label)).join(" · ")}</p>` : ""}
      <details style="margin-top:8px"><summary class="muted">Voir le plan complet</summary>
        <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table><thead><tr><th>Compte</th><th>Libellé</th><th>Type</th></tr></thead>
        <tbody>${planAccounts.map((a) => `<tr><td>${esc(a.code)}</td><td>${esc(a.label)}</td><td>${esc(ACCOUNT_TYPES[a.type] || "?")}</td></tr>`).join("")}</tbody></table></div>
      </details>
    </div>

    <div class="card">
      <h2>💾 Données</h2>
      <div class="actions">
        <button class="secondary" id="d-export">⬇ Exporter la sauvegarde (JSON)</button>
        <button class="secondary" id="d-import">⬆ Importer une sauvegarde</button>
        <button class="secondary" id="d-demo">Charger la démonstration</button>
        <button class="danger" id="d-reset">Tout effacer</button>
      </div>
      <input type="file" id="d-file" accept=".json" class="hidden">
    </div>
  `;

  const updateVat = () => {
    const c = getCountry(document.getElementById("s-country").value);
    document.getElementById("s-vat").textContent = `Taux de TVA ${c.name} : ${c.vatRates.join("%, ")}% — Devise : ${c.currency} — Plan : ${PLANS[c.plan]?.name || c.plan}`;
  };
  updateVat();
  document.getElementById("s-country").addEventListener("change", (e) => {
    const c = getCountry(e.target.value);
    document.getElementById("s-plan").value = c.plan;
    document.getElementById("s-currency").value = c.currency;
    updateVat();
  });

  document.getElementById("s-save").addEventListener("click", () => {
    const c = getCountry(document.getElementById("s-country").value);
    s.companyName = document.getElementById("s-company").value.trim() || "Ma société";
    s.country = c.code;
    s.plan = document.getElementById("s-plan").value;
    s.currency = document.getElementById("s-currency").value.trim().toUpperCase() || c.currency;
    s.locale = c.locale;
    s.exerciceStart = document.getElementById("s-start").value || s.exerciceStart;
    s.exerciceEnd = document.getElementById("s-end").value || s.exerciceEnd;
    refreshPlan();
    saveStore(store);
    toast("✓ Paramètres enregistrés.");
    router.render();
  });

  document.getElementById("s-language").addEventListener("change", (e) => {
    s.language = e.target.value;
    saveStore(store);
    toast("✓ Langue enregistrée.");
    router.render();
  });

  document.getElementById("s-aikey").addEventListener("change", async (e) => {
    const v = e.target.value.trim();
    if (v) {
      try {
        s.aiKeyEnc = await encryptSecret(v);
        s.aiKey = "";
        toast("✓ Clé chiffrée et enregistrée.");
        document.getElementById("s-aikey-status").textContent = "🔐 Clé chiffrée enregistrée sur cet appareil (AES-GCM).";
      } catch (_err) {
        s.aiKey = v;
        s.aiKeyEnc = "";
        toast("Chiffrement indisponible : clé stockée en clair.");
      }
    } else {
      s.aiKey = "";
      s.aiKeyEnc = "";
      toast("Clé supprimée.");
      document.getElementById("s-aikey-status").textContent = "Aucune clé enregistrée.";
    }
    saveStore(store);
    e.target.value = "";
  });
  document.getElementById("s-aiprovider").addEventListener("change", (e) => {
    const id = e.target.value;
    s.aiProvider = id;
    if (id !== "custom") {
      s.aiEndpoint = PROVIDERS[id].endpoint;
      s.aiModel = PROVIDERS[id].models.includes(s.aiModel) ? s.aiModel : PROVIDERS[id].models[0];
    }
    saveStore(store);
    toast(id === "custom" ? "Fournisseur personnalisé : saisissez l'endpoint." : "Fournisseur : " + PROVIDERS[id].label + ".");
    router.render();
  });
  document.getElementById("s-aimodel")?.addEventListener("change", (e) => { s.aiModel = e.target.value; saveStore(store); });
  document.getElementById("s-aimodel-text")?.addEventListener("change", (e) => { s.aiModel = e.target.value.trim(); saveStore(store); });
  document.getElementById("s-aiendpoint")?.addEventListener("change", (e) => { s.aiEndpoint = e.target.value.trim(); saveStore(store); toast("✓ Endpoint enregistré."); });

  document.getElementById("ca-add").addEventListener("click", () => {
    const code = document.getElementById("ca-code").value.trim();
    const label = document.getElementById("ca-label").value.trim();
    if (!code || !label) return toast("Numéro et libellé obligatoires.");
    if (s.customAccounts.some((a) => a.code === code) || planAccounts.some((a) => a.code === code)) return toast("Ce compte existe déjà.");
    s.customAccounts.push({ code, label, type: document.getElementById("ca-type").value });
    refreshPlan();
    saveStore(store);
    toast("✓ Compte ajouté au plan.");
    router.render();
  });

  document.getElementById("d-export").addEventListener("click", () => exportJSON(store));
  document.getElementById("d-import").addEventListener("click", () => document.getElementById("d-file").click());
  document.getElementById("d-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await importJSON(file);
      const ok = confirm("Cette opération remplacera toutes les données comptables de cet appareil. Une sauvegarde JSON de l'état actuel sera téléchargée avant le remplacement. Continuer ?");
      if (!ok) return;
      exportJSON(store);
      initStore(data);
      toast("✓ Sauvegarde importée. La sauvegarde précédente a été téléchargée.");
      router.go("dashboard");
    } catch (err) {
      toast("Import impossible : " + err.message);
    } finally {
      e.target.value = "";
    }
  });
  document.getElementById("d-demo").addEventListener("click", () => {
    if (!confirm("Remplacer les données actuelles par la démonstration ?")) return;
    demoData(store);
    saveStore(store);
    toast("✓ Données de démonstration chargées.");
    router.go("dashboard");
  });
  document.getElementById("d-reset").addEventListener("click", () => {
    if (!confirm("Effacer TOUTES les données ? Cette action est irréversible.")) return;
    resetStore();
    initStore(null);
    router.go("dashboard");
    toast("Données effacées.");
  });
}
