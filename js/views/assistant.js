// MIZANE — Écrans : assistant IA (photo, import de texte, audit) et paramètres.
import { validateEntry, postEntry, checkAnomalies } from "../accounting.js";
import { PLANS, getPlan, allAccounts, ACCOUNT_TYPES } from "../plans.js";
import { getCountryAccountingFramework } from "../plans/frameworks.js";
import { COUNTRIES, getCountry } from "../countries.js";
import {
  aiConfigured, chat, chatWithImage, aiAudit, buildAiAuditSnapshot, localAssist, localAuditSummary,
  imageFileToDataUrl, suggestEntry, importEntriesFromText, parseEntriesFromTextLocal, PROVIDERS, providerOf,
  configureCompanyAI, deleteCompanyAI, refreshCompanyAIStatus,
} from "../ai.js";
import { saveStore, exportJSON, importJSON, resetStore, demoData, downloadBlob } from "../db.js";
import { validateCustomPlan, createCustomPlan } from "../plans/custom.js";
import { validatePlanMapping, dryRunPlanMigration } from "../plans/mapping.js";
import { suggestAccountMatches, buildConversionRules } from "../plans/conversion-assistant.js";
import { applyPlanMigration, undoPlanMigration } from "../plans/migration.js";
import { migrationAuditRows } from "../plans/migration-audit.js";
import { LANGS } from "../i18n.js";
import { store, planAccounts, aiHistory, $app, router, toast, esc, refreshPlan, initStore } from "../state.js";

function draftLineMarkup(line, index) {
  return '<tr class="draft-line" data-line-index="' + index + '">' +
    '<td><input aria-label="Compte" data-line-field="account" maxlength="20" value="' + esc(line.account || '') + '" placeholder="Compte"></td>' +
    '<td><input aria-label="Libellé" data-line-field="label" maxlength="180" value="' + esc(line.label || '') + '" placeholder="Libellé"></td>' +
    '<td><input aria-label="Débit" data-line-field="debit" type="number" min="0" step="0.01" value="' + (line.debit ? esc(line.debit) : '') + '"></td>' +
    '<td><input aria-label="Crédit" data-line-field="credit" type="number" min="0" step="0.01" value="' + (line.credit ? esc(line.credit) : '') + '"></td>' +
    '<td><button type="button" class="danger small" data-draft-action="remove-line" aria-label="Supprimer la ligne">×</button></td></tr>';
}
function draftCardMarkup(entry, index, title) {
  const lines = Array.isArray(entry.lines) ? entry.lines : [];
  const facts = entry.aiReview && Array.isArray(entry.aiReview.sourceFacts) ? entry.aiReview.sourceFacts : [];
  const uncertainties = entry.aiReview && Array.isArray(entry.aiReview.uncertainties) ? entry.aiReview.uncertainties : [];
  return '<section class="card ai-draft-card" data-draft-card="' + index + '" style="margin:12px 0">' +
    '<h3>' + esc(title || ('Écriture proposée ' + (index + 1))) + '</h3>' +
    (facts.length ? '<p class="muted"><strong>Éléments relevés :</strong> ' + esc(facts.join(' · ')) + '</p>' : '') +
    (uncertainties.length ? '<p class="warn"><strong>À vérifier :</strong> ' + esc(uncertainties.join(' · ')) + '</p>' : '') +
    '<div class="row"><div><label>Date</label><input type="date" data-header="date" value="' + esc(entry.date || '') + '"></div>' +
    '<div><label>Journal</label><select data-header="journal">' + ['ACH','VTE','BAN','CAI','OD'].map(j => '<option value="' + j + '"' + (entry.journal === j ? ' selected' : '') + '>' + j + '</option>').join('') + '</select></div>' +
    '<div><label>Référence</label><input data-header="reference" maxlength="120" value="' + esc(entry.reference || '') + '"></div></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th></th></tr></thead><tbody data-draft-lines>' + lines.map((line,i) => draftLineMarkup(line,i)).join('') + '</tbody></table></div>' +
    '<div class="actions"><button type="button" class="secondary small" data-draft-action="add-line">+ Ajouter une ligne</button></div>' +
    '<div class="draft-validation muted" aria-live="polite"></div></section>';
}
function readDraftCard(card) {
  return { date: card.querySelector('[data-header="date"]').value, journal: card.querySelector('[data-header="journal"]').value, reference: card.querySelector('[data-header="reference"]').value.trim(),
    lines: Array.from(card.querySelectorAll('.draft-line')).map(row => ({ account: row.querySelector('[data-line-field="account"]').value.trim(), label: row.querySelector('[data-line-field="label"]').value.trim(), debit: row.querySelector('[data-line-field="debit"]').value, credit: row.querySelector('[data-line-field="credit"]').value })) };
}
function bindDraftEditors(root, onSave) {
  const refresh = card => { const result = validateEntry(store, readDraftCard(card)); const target = card.querySelector('.draft-validation'); target.innerHTML = result.ok ? '<span class="ok-msg">Contrôle technique réussi : écriture équilibrée et comptes reconnus.</span>' : '<span class="errors">' + esc(result.errors.join(' · ')) + '</span>'; return result; };
  root.addEventListener('input', event => { const card = event.target.closest('[data-draft-card]'); if (card) refresh(card); });
  root.addEventListener('change', event => { const card = event.target.closest('[data-draft-card]'); if (card) refresh(card); });
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-draft-action]');
    if (action) { const card = action.closest('[data-draft-card]'); if (!card) return; if (action.dataset.draftAction === 'add-line') { const body = card.querySelector('[data-draft-lines]'); body.insertAdjacentHTML('beforeend', draftLineMarkup({}, body.querySelectorAll('.draft-line').length)); refresh(card); } else if (action.dataset.draftAction === 'remove-line') { action.closest('.draft-line').remove(); refresh(card); } return; }
    if (!event.target.closest('[data-draft-save]')) return;
    const cards = Array.from(root.querySelectorAll('[data-draft-card]')); const drafts = cards.map(readDraftCard); const checks = cards.map(refresh);
    if (!cards.length || checks.some(check => !check.ok)) { toast('Corrigez toutes les écritures avant l’enregistrement. Aucune n’a été enregistrée.'); return; }
    const closed = drafts.find(draft => (store.settings.closedPeriods || []).some(period => draft.date >= period.start && draft.date <= period.end));
    if (closed) { toast('Au moins une écriture concerne une période clôturée. Aucun enregistrement effectué.'); return; }
    onSave(drafts);
  });
}

let assistantHistoryCompanyId = "";

export function viewAssistant() {
  const currentCompanyId = localStorage.getItem("mizane_active_company_v1") || "";
  if (currentCompanyId !== assistantHistoryCompanyId) {
    aiHistory.splice(0, aiHistory.length);
    assistantHistoryCompanyId = currentCompanyId;
  }
  const audit = localAuditSummary(store);
  const configured = aiConfigured(store);
  refreshCompanyAIStatus(providerOf(store)).then(() => { if (aiConfigured(store) !== configured) router.render(); }).catch(() => {});
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
      <h2>🧠 Copilote comptable — analyser un justificatif</h2>
      <p class="muted">Joignez une facture, un reçu ou un document de transaction. Le copilote extrait les faits, signale les incertitudes et prépare une écriture détaillée et modifiable. Aucune écriture n'est enregistrée automatiquement.</p>
      <div class="row">
        <div><label>Photo du justificatif</label><input type="file" id="invoice-photo" accept="image/jpeg,image/png,image/webp"></div>
        <div><label>Contexte de l’opération (facultatif)</label><input id="invoice-note" maxlength="1000" placeholder="Ex. : paiement par virement, achat de fournitures"></div>
      </div>
      <div class="actions"><button id="invoice-analyze" ${configured ? "" : "disabled"}>${configured ? "Analyser le justificatif" : "Configurez une clé IA pour activer la lecture"}</button></div>
      <div id="invoice-result" style="margin-top:10px"></div>
    </div>
    <div class="card">
      <h2>💬 Conversation</h2>\n      <p class="muted">Mémoire de conversation temporaire, limitée à cette session et réinitialisée lors d’un changement d’entreprise. Aucun historique de conversation n’est partagé entre entreprises.</p>
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
      <p class="muted">Audit des anomalies comptables, soldes inhabituels et cohérence des données fiscales explicitement saisies. Le contrôle fiscal compare uniquement les informations présentes à un référentiel officiel actif ; il ne déduit aucun taux et ne certifie pas la conformité.</p>
      <button id="audit-run">${configured ? "Lancer l'audit IA" : "Lancer le contrôle local"}</button>
      <div id="audit-result" style="margin-top:10px"></div>
    </div>
  `;

  // ---- Import de texte -> écritures ----

  // ---- Justificatif photo -> proposition d'écriture contrôlée ----
  document.getElementById("invoice-analyze").addEventListener("click", async () => {
    const file = document.getElementById("invoice-photo").files[0];
    const out = document.getElementById("invoice-result");
    if (!configured || !aiConfigured(store)) { toast("Configurez d'abord une clé IA dans Paramètres."); return; }
    if (!file) { toast("Sélectionnez une photo de facture ou de reçu."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast("Formats acceptés : JPEG, PNG ou WebP."); return; }
    if (file.size > 15 * 1024 * 1024) { toast("La photo dépasse la limite de 15 Mo."); return; }
    out.innerHTML = '<p class="muted">Analyse du justificatif en cours…</p>';
    try {
      const imageData = await imageFileToDataUrl(file);
      const note = document.getElementById("invoice-note").value.trim();
      const proposal = await suggestEntry(store, note, imageData);
      out.innerHTML = '<p><strong>Proposition IA — chaque champ est modifiable</strong></p>' +
        '<p class="muted">L’IA sépare les faits visibles des incertitudes. Corrigez les comptes, libellés, montants, date et journal. Vous pouvez ajouter ou supprimer des lignes. Rien ne sera enregistré avant votre validation explicite.</p>' +
        draftCardMarkup(proposal, 0, 'Écriture issue du justificatif') +
        '<p class="muted">Le contrôle technique vérifie la structure et l’équilibre ; il ne certifie ni l’authenticité du document ni sa conformité fiscale ou juridique.</p>' +
        '<div class="actions"><button type="button" data-draft-save>Valider et enregistrer l’écriture</button></div>';
      bindDraftEditors(out, drafts => {
        const posted = postEntry(store, drafts[0]);
        if (!posted.ok) { toast(posted.errors.join(' · ')); return; }
        saveStore(store);
        toast('Écriture enregistrée après validation.');
        router.go('entries');
      });
    } catch (err) {
      out.innerHTML = '<p class="errors">' + esc(err.message || "Lecture du justificatif impossible.") + '</p>';
    }
  });


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
    out.innerHTML = '<p><strong>' + proposals.length + ' écriture(s) extraites.</strong> Modifiez les dates, journaux, comptes, libellés et montants ; ajoutez ou retirez des lignes. L’enregistrement est global : si une seule écriture est invalide, aucune ne sera enregistrée.</p>' +
      proposals.map((proposal, index) => draftCardMarkup(proposal, index, 'Opération ' + (index + 1))).join('') +
      '<p class="muted">Les dates absentes restent vides. Les informations incertaines doivent être vérifiées sur les pièces originales.</p>' +
      '<div class="actions"><button type="button" data-draft-save>Valider et enregistrer les ' + proposals.length + ' écritures</button></div>';
    bindDraftEditors(out, drafts => {
      const closed = drafts.find(draft => (store.settings.closedPeriods || []).some(period => draft.date >= period.start && draft.date <= period.end));
      if (closed) { toast('Période clôturée : aucune écriture enregistrée.'); return; }
      const posted = [];
      for (const draft of drafts) {
        const result = postEntry(store, draft);
        if (!result.ok) { toast('Enregistrement interrompu : ' + result.errors.join(' · ')); return; }
        posted.push(result.entry);
      }
      saveStore(store);
      toast(posted.length + ' écriture(s) enregistrée(s) après validation.');
      router.go('entries');
    });
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
    const snapshot = buildAiAuditSnapshot(store);
    const anomalies = checkAnomalies(store);
    const taxFindings = snapshot.tax.findings;
    let html = anomalies.length
      ? `<ul class="errors">${anomalies.slice(0, 15).map((a) => `<li>${esc(a.message)}</li>`).join("")}</ul>`
      : `<p class="ok-msg">✓ Aucune anomalie détectée par le moteur local.</p>`;
    html += `<h3>Vigilance fiscale</h3>` + (taxFindings.length ? `<ul class="errors">${taxFindings.map(item => `<li>${esc(item.message)} (écriture ${esc(item.entryId ?? "—")}, ligne ${esc(item.line)})</li>`).join("")}</ul>` : `<p class="muted">${esc(snapshot.tax.note || "Aucune incohérence fiscale explicite détectée par les contrôles déterministes.")}</p>`) + (snapshot.tax.referenceStatus === "active" ? `<p class="muted">Référentiel actif : ${esc(snapshot.tax.countryName)} (${esc(snapshot.tax.rulesVersion || "version non précisée")}).</p>` : `<p class="warn">Référentiel fiscal non actif pour ce pays : aucune validation des taux n’est effectuée.</p>`);
    if (aiConfigured(store)) {
      try { html += `<div class="chat-msg ai" style="max-width:100%">${esc(await aiAudit(store))}</div>`; }
      catch (err) { html += `<p class="errors">${esc(err.message)}</p>`; }
    }
    out.innerHTML = html;
  });
}

export function viewSettings() {
  const s = store.settings;
  const plan = getPlan(s.plan, s.customPlans);
  const customPlan = (s.customPlans || []).find((item) => item.id === s.plan) || null;
  const pid = providerOf(store);
  const basePlanOptions = Object.values(PLANS).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === s.plan ? ' selected' : '') + '>' + esc(p.name) + '</option>').join("");
  const customPlanOptions = (s.customPlans || []).map((p) => '<option value="' + esc(p.id) + '"' + (p.id === s.plan ? ' selected' : '') + '>' + esc(p.name) + '</option>').join("");
  const customPlanRows = (s.customPlans || []).map((p) => '<tr><td>' + esc(p.name) + (p.id === s.plan ? ' <span class="ok-msg">Actif</span>' : '') + '</td><td>' + p.accounts.length + '</td><td><div class="actions"><button class="small secondary" data-cp-activate="' + esc(p.id) + '">Activer</button><button class="small secondary" data-cp-export="' + esc(p.id) + '">Exporter</button><button class="small danger" data-cp-delete="' + esc(p.id) + '">Supprimer</button></div></td></tr>').join("");
  const customPlanEditor = customPlan ? '<div class="custom-plan-editor" style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px"><h3>Modifier : ' + esc(customPlan.name) + '</h3><div class="row"><div><label>Nom du plan</label><input id="cp-edit-name" maxlength="100" value="' + esc(customPlan.name) + '"></div><div><label>Description</label><input id="cp-edit-description" maxlength="500" value="' + esc(customPlan.description || "") + '"></div><div class="nogrow"><button id="cp-save-meta">Enregistrer</button></div></div><h3>Ajouter un compte</h3><div class="row"><div><label>Numéro</label><input id="cp-account-code" maxlength="20" placeholder="Ex. 7085"></div><div><label>Libellé</label><input id="cp-account-label" maxlength="180" placeholder="Libellé du compte"></div><div><label>Type</label><select id="cp-account-type">' + Object.entries(ACCOUNT_TYPES).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join("") + '</select></div><div class="nogrow"><button id="cp-add-account">Ajouter</button></div></div><div class="table-wrap"><table><thead><tr><th>Compte</th><th>Libellé</th><th>Type</th><th>Action</th></tr></thead><tbody>' + customPlan.accounts.map(([code,label,type]) => '<tr><td>' + esc(code) + '</td><td>' + esc(label) + '</td><td>' + esc(ACCOUNT_TYPES[type] || type) + '</td><td><button class="small danger" data-cp-remove-account="' + esc(code) + '">Retirer</button></td></tr>').join("") + '</tbody></table></div></div>' : "";
  const customPlansCard = '<div class="card" id="custom-plans-card"><h2>Plans comptables personnalisés</h2><p class="muted">Créez une copie indépendante d’un référentiel ou d’un modèle, puis adaptez ses comptes. Les plans sont sauvegardés sur cet appareil et inclus dans la sauvegarde JSON MIZANE. Ils ne modifient jamais les référentiels officiels.</p><div class="row"><div><label>Nom du nouveau plan</label><input id="cp-new-name" maxlength="100" placeholder="Ex. Plan de la société"></div><div><label>Base à copier</label><select id="cp-new-base">' + basePlanOptions + customPlanOptions + '</select></div><div class="nogrow"><button id="cp-create">Créer une copie</button></div></div><div class="row"><div><label>Importer un plan personnalisé (.json)</label><input type="file" id="cp-import-file" accept=".json,application/json"></div><div class="nogrow"><button class="secondary" id="cp-import">Importer le plan</button></div></div>' + ((s.customPlans || []).length ? '<h3>Plans enregistrés</h3><div class="table-wrap"><table><thead><tr><th>Plan</th><th>Comptes</th><th>Actions</th></tr></thead><tbody>' + customPlanRows + '</tbody></table></div>' : '<p class="muted">Aucun plan personnalisé enregistré pour le moment.</p>') + customPlanEditor + '</div>';
  const conversionPlans = [...Object.values(PLANS), ...(s.customPlans || [])];
  const defaultConversionSource = conversionPlans.some((p) => p.id === s.plan) ? s.plan : (conversionPlans[0]?.id || "");
  const defaultConversionTarget = conversionPlans.find((p) => p.id !== defaultConversionSource)?.id || "";
  const conversionOptions = conversionPlans.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === defaultConversionSource ? ' selected' : '') + '>' + esc(p.name) + (p.official === false ? ' — personnalisé/indicatif' : '') + '</option>').join("");
  const conversionMappings = (s.planMappings || []).map((m) => '<option value="' + esc(m.id) + '">' + esc(m.label) + ' — ' + esc(m.sourcePlanId) + ' → ' + esc(m.targetPlanId) + ' (' + esc(m.status) + ')</option>').join("");
  const migrationRecords = [...(s.planMigrationHistory || [])].reverse();
  const activePlanMigration = migrationRecords.find((item) => item.status === "applied");
  const migrationHistoryHtml = migrationRecords.length
    ? '<section class="card" style="margin-top:12px"><h3>Historique et audit des migrations</h3><p class="muted">Comparaison des soldes attendus selon le rapprochement et des soldes réellement enregistrés dans le plan cible. Cette comparaison technique ne certifie pas une équivalence juridique ou comptable des référentiels.</p>' +
      migrationRecords.map((record) => {
        const report = record.auditReport;
        const rows = report ? migrationAuditRows(report) : [];
        const events = (record.events || []).map((event) => esc(event.type) + ' · ' + esc(event.at) + ' · acteur : ' + esc(event.actor || 'non renseigné')).join('<br>');
        const reportRows = rows.map((row) => '<tr>' + Object.values(row).map((value) => '<td>' + esc(value) + '</td>').join('') + '</tr>').join('');
        const reportTable = report
          ? '<p><strong>Contrôle :</strong> ' + esc(report.status) + ' · ' + report.differenceCount + ' écart(s) · ' + report.unmapped.length + ' compte(s) non rapproché(s) · ' + report.entryIssues.length + ' écriture(s) déséquilibrée(s)</p>' +
            '<p class="muted">Avant : débit ' + report.beforeTotals.debit + ' / crédit ' + report.beforeTotals.credit + ' — Après : débit ' + report.afterTotals.debit + ' / crédit ' + report.afterTotals.credit + ' — Écart global débit ' + report.totalsDifference.debit + ', crédit ' + report.totalsDifference.credit + '.</p>' +
            '<details><summary>Détail des soldes par compte (' + rows.length + ')</summary><div class="table-wrap"><table><thead><tr><th>Compte</th><th>Libellé</th><th>Débit attendu</th><th>Débit après</th><th>Écart débit</th><th>Crédit attendu</th><th>Crédit après</th><th>Écart crédit</th><th>Solde attendu</th><th>Solde après</th><th>Écart solde</th><th>Cible absente</th></tr></thead><tbody>' + reportRows + '</tbody></table></div></details>' +
            (report.accountsTruncated ? '<p class="muted">Rapport volumineux : affichage limité aux comptes présentant un écart (' + report.accounts.length + ' sur ' + report.accountRowsTotal + '). Les totaux globaux restent complets.</p>' : '') +
            (report.unmapped.length ? '<p class="errors">Comptes non rapprochés : ' + esc(report.unmapped.map((item) => item.account).join(', ')) + '</p>' : '') +
            (report.entryIssues.length ? '<p class="errors">Écritures déséquilibrées : ' + report.entryIssues.length + '</p>' : '')
          : '<p class="muted">Rapport détaillé indisponible pour cette ancienne migration.</p>';
        return '<article class="card" style="margin-top:10px"><strong>' + esc(record.mappingLabel || 'Migration') + '</strong> — <span>' + esc(record.status) + '</span>' +
          '<p class="muted">' + esc(record.sourcePlanId) + ' → ' + esc(record.targetPlanId) + ' · ' + Number(record.entryCount || 0) + ' écriture(s) · appliquée le ' + esc(record.appliedAt || '') +
          (record.undoneAt ? ' · annulée le ' + esc(record.undoneAt) : '') + '</p>' +
          '<p class="muted">Approbateur : ' + esc(record.approvedBy || 'non renseigné') + ' · ' + (record.approvedAt ? 'approbation : ' + esc(record.approvedAt) : 'date d’approbation non renseignée') + '</p>' +
          '<p class="muted">' + events + '</p>' + reportTable +
          '<div class="actions"><button class="small secondary" data-migration-excel="' + esc(record.id) + '">Exporter Excel</button><button class="small secondary" data-migration-pdf="' + esc(record.id) + '">Imprimer / PDF</button>' +
          (record.status === "applied" ? '<button class="small danger" data-migration-undo="' + esc(record.id) + '">Restaurer cette migration</button>' : '') + '</div></article>';
      }).join('') + '</section>'
    : '<p class="muted" style="margin-top:12px">Aucune migration enregistrée.</p>';
  const conversionCard = '<div class="card" id="accounting-conversion-card"><h2>Assistant de conversion entre référentiels</h2><p class="muted">Préparez un rapprochement entre deux plans. Les suggestions reposent sur le code, le libellé et le type comptable ; elles ne constituent pas une équivalence juridique ou comptable certifiée. Toute règle doit être vérifiée et approuvée explicitement.</p><div class="row"><div><label>Plan source</label><select id="conversion-source">' + conversionOptions + '</select></div><div><label>Plan cible</label><select id="conversion-target">' + conversionPlans.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === defaultConversionTarget ? ' selected' : '') + '>' + esc(p.name) + (p.official === false ? ' — personnalisé/indicatif' : '') + '</option>').join("") + '</select></div><div class="nogrow"><button id="conversion-prepare">Analyser les comptes</button></div></div><div id="conversion-suggestions" style="margin-top:12px"></div><div class="row" style="margin-top:14px"><div><label>Nom du rapprochement</label><input id="conversion-label" maxlength="120" placeholder="Ex. SYSCOHADA vers PCG"></div><div class="nogrow"><button id="conversion-save" disabled>Enregistrer en brouillon</button></div></div><hr><h3>Rapprochements enregistrés</h3><div class="row"><div><label>Rapprochement</label><select id="conversion-mapping">' + conversionMappings + '</select></div><div class="nogrow"><button class="secondary" id="conversion-approve">Approuver les règles</button></div><div class="nogrow"><button id="conversion-preview">Simuler la conversion</button></div></div><div id="conversion-result" style="margin-top:12px"></div>' + migrationHistoryHtml + '</div>';

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
          <select id="s-plan">
            <optgroup label="Référentiels nationaux et régionaux">${Object.values(PLANS).filter((p) => p.category !== "sectoral-template").map((p) => `<option value="${p.id}" ${p.id === s.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>
            <optgroup label="Modèles sectoriels indicatifs">${Object.values(PLANS).filter((p) => p.category === "sectoral-template").map((p) => `<option value="${p.id}" ${p.id === s.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>
            <optgroup label="Mes plans personnalisés">${(s.customPlans || []).map((p) => `<option value="${p.id}" ${p.id === s.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>
          </select>
          <p class="muted" id="plan-description">${esc(plan.description || (plan.category === "sectoral-template" ? "Modèle indicatif à adapter au référentiel légal applicable." : "Référentiel comptable intégré à MIZANE."))}</p>
          <div class="muted" id="country-framework-info" style="margin-top:8px"></div>
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

    <div class="card" id="ai-settings-card">
      <h2>Assistant IA — fournisseurs et clés API</h2>
      <div id="ai-settings-panel"><p class="muted">Vérification des autorisations de votre entreprise…</p></div>
    </div>

    <div class="card">
      <h2>🔐 Confidentialité</h2>
      <p class="muted">Les textes et photos envoyés à l'assistant sont transmis au fournisseur IA sélectionné. La clé API est conservée côté serveur dans Supabase Vault, séparément pour chaque entreprise. Elle n'est pas enregistrée dans le stockage local ni dans les sauvegardes comptables.</p>
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


    ${customPlansCard}
    ${conversionCard}

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


  let conversionSuggestions = [];
  const getConversionPlan = (id) => {
    const item = conversionPlans.find((p) => p.id === id);
    if (!item) return null;
    return { id: item.id, name: item.name, accounts: item.accounts || [] };
  };
  const conversionCatalog = () => ({ ...PLANS, ...Object.fromEntries((s.customPlans || []).map((p) => [p.id, p])) });
  const conversionVersions = () => Array.isArray(s.planVersions) ? s.planVersions : [];
  const prepareConversion = () => {
    const sourceId = document.getElementById("conversion-source").value;
    const targetId = document.getElementById("conversion-target").value;
    try {
      const source = getConversionPlan(sourceId), target = getConversionPlan(targetId);
      conversionSuggestions = suggestAccountMatches(source, target);
      document.getElementById("conversion-suggestions").innerHTML = '<p>' + conversionSuggestions.length + ' compte(s) source analysé(s). Les propositions sont préremplies mais restent à confirmer.</p><div class="table-wrap"><table><thead><tr><th>Compte source</th><th>Suggestion</th><th>Confiance indicative</th><th>Décision</th></tr></thead><tbody>' + conversionSuggestions.map((item) => '<tr><td><strong>' + esc(item.source.code) + '</strong> — ' + esc(item.source.label) + '<br><small>' + esc(ACCOUNT_TYPES[item.source.type] || item.source.type) + '</small></td><td>' + (item.suggestion ? esc(item.suggestion.code + ' — ' + item.suggestion.label) : '<span class="muted">Aucune proposition fiable</span>') + (item.ambiguous ? '<br><span class="warn">Plusieurs candidats proches</span>' : '') + '</td><td>' + (item.suggestion ? item.confidence + ' %' : '—') + '</td><td><select data-conversion-source="' + esc(item.source.code) + '"><option value="">Non rapproché</option>' + item.candidates.map((candidate) => '<option value="' + esc(candidate.code) + '"' + (item.suggestion && item.suggestion.code === candidate.code ? ' selected' : '') + '>' + esc(candidate.code + ' — ' + candidate.label) + '</option>').join("") + '</select></td></tr>').join("") + '</tbody></table></div><p class="muted">Les comptes sans sélection resteront non rapprochés. Les types différents sont exclus des propositions.</p>';
      document.getElementById("conversion-save").disabled = false;
      document.getElementById("conversion-label").value = "Conversion " + source.name + " vers " + target.name;
    } catch (error) {
      conversionSuggestions = [];
      document.getElementById("conversion-suggestions").innerHTML = '<p class="errors">' + esc(error.message) + '</p>';
      document.getElementById("conversion-save").disabled = true;
    }
  };
  document.getElementById("conversion-prepare").addEventListener("click", prepareConversion);
  document.getElementById("conversion-save").addEventListener("click", () => {
    if (!conversionSuggestions.length) return toast("Analysez d'abord les comptes.");
    const sourceId = document.getElementById("conversion-source").value, targetId = document.getElementById("conversion-target").value;
    const selections = Object.fromEntries([...document.querySelectorAll("[data-conversion-source]")].map((select) => [select.dataset.conversionSource, select.value]));
    try {
      const rules = buildConversionRules(conversionSuggestions, selections);
      if (!rules.length) return toast("Aucun rapprochement sélectionné.");
      const groupedRules = rules.filter((rule) => rule.relation === "many-to-one").length;
      if (groupedRules && !confirm(groupedRules + " regroupement(s) plusieurs-vers-un détecté(s). Vérifiez que ces comptes peuvent légalement et comptablement être fusionnés. Continuer en brouillon ?")) return;
      const mapping = validatePlanMapping({ id: "conversion-" + Date.now().toString(36), sourcePlanId: sourceId, targetPlanId: targetId, label: document.getElementById("conversion-label").value.trim() || ("Conversion " + sourceId + " vers " + targetId), status: "draft", rules }, conversionCatalog(), conversionVersions());
      s.planMappings = [...(s.planMappings || []), mapping];
      saveStore(store);
      toast("Rapprochement enregistré en brouillon. Aucune règle n'est encore active.");
      router.render();
    } catch (error) { toast(error.message); }
  });
  document.getElementById("conversion-approve").addEventListener("click", () => {
    const id = document.getElementById("conversion-mapping").value;
    const current = (s.planMappings || []).find((item) => item.id === id);
    if (!current) return toast("Sélectionnez un rapprochement enregistré.");
    if (!confirm("Approuver toutes les règles de ce rapprochement ? Vérifiez les comptes et les équivalences avant de confirmer.")) return;
    try {
      const approvedAt = new Date().toISOString();
      const validated = validatePlanMapping({ ...current, status: "approved", rules: current.rules.map((rule) => ({ ...rule, status: "approved" })), updatedAt: approvedAt }, conversionCatalog(), conversionVersions());
      const updated = { ...validated, approvedAt, approvedBy: current.approvedBy || null, approvalEvents: [...(current.approvalEvents || []), { at: approvedAt, actor: current.approvedBy || null }] };
      s.planMappings = s.planMappings.map((item) => item.id === id ? updated : item);
      saveStore(store); toast("Rapprochement approuvé. Vous pouvez lancer une simulation.");
      router.render();
    } catch (error) { toast(error.message); }
  });
  document.getElementById("conversion-preview").addEventListener("click", () => {
    const id = document.getElementById("conversion-mapping").value;
    const mapping = (s.planMappings || []).find((item) => item.id === id);
    if (!mapping) return toast("Sélectionnez un rapprochement enregistré.");
    try {
      if (String(s.plan) !== String(mapping.sourcePlanId)) throw new Error("Le plan actif doit être le plan source du rapprochement pour simuler les écritures de cette société.");
      const source = getConversionPlan(mapping.sourcePlanId), target = getConversionPlan(mapping.targetPlanId);
      const result = dryRunPlanMigration({ entries: store.entries || [], sourcePlan: source, targetPlan: target, mapping });
      const report = { mapping: mapping.label, generatedAt: new Date().toISOString(), sourceEntries: result.sourceEntryCount, migratedEntries: result.migratedEntryCount, blockedEntries: result.blockedEntryCount, canApply: result.canApply, errors: result.errors, warnings: result.warnings, unmapped: result.unmapped, entries: result.entries };
      document.getElementById("conversion-result").innerHTML = '<p><strong>Résultat de la simulation</strong> — ' + result.migratedEntryCount + ' écriture(s) simulée(s), ' + result.blockedEntryCount + ' bloquée(s), ' + result.unmapped.length + ' compte(s) non rapproché(s).</p>' + (result.canApply ? '<p class="ok-msg">Contrôles réussis : toutes les écritures sont équilibrées. Aucune modification n’a encore été appliquée.</p><button id="conversion-apply">Appliquer la migration en toute sécurité</button>' : '<p class="warn">Conversion incomplète : aucune migration possible. Corrigez les règles et les anomalies ci-dessous.</p>') + (result.errors.length ? '<ul class="errors">' + result.errors.slice(0, 30).map((message) => '<li>' + esc(message) + '</li>').join("") + '</ul>' : '') + (result.warnings.length ? '<ul class="muted">' + result.warnings.slice(0, 20).map((message) => '<li>' + esc(message) + '</li>').join("") + '</ul>' : '') + '<div class="actions"><button class="secondary" id="conversion-export-report">Exporter le rapport JSON</button></div>';
      document.getElementById("conversion-export-report").addEventListener("click", () => downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "mizane-simulation-conversion.json"));
      const applyButton = document.getElementById("conversion-apply");
      if (applyButton) applyButton.addEventListener("click", () => {
        if (!confirm("CONFIRMATION DE MIGRATION\\n\\nLes " + result.sourceEntries + " écritures seront converties vers " + target.name + ". Une sauvegarde de restauration sera conservée dans l'historique. Les écritures cloud seront mises à jour lors de la prochaine synchronisation. Continuer ?")) return;
        const previousEntries = structuredClone(store.entries), previousPlan = s.plan, previousHistory = structuredClone(s.planMigrationHistory || []);
        try {
          const applied = applyPlanMigration(store, { sourcePlan: source, targetPlan: target, mapping });
          if (!saveStore(store)) throw new Error("Sauvegarde locale impossible : la migration a été annulée en mémoire. Libérez de l'espace et exportez vos données.");
          refreshPlan();
          toast("Migration appliquée : " + applied.migratedEntryCount + " écriture(s) convertie(s).");
          router.render();
        } catch (error) {
          store.entries = previousEntries; s.plan = previousPlan; s.planMigrationHistory = previousHistory; refreshPlan();
          document.getElementById("conversion-result").insertAdjacentHTML("beforeend", '<p class="errors">' + esc(error.message) + '</p>');
        }
      });
    } catch (error) { document.getElementById("conversion-result").innerHTML = '<p class="errors">' + esc(error.message) + '</p>'; }
  });

  const undoMigrationButton = document.getElementById("conversion-undo");
  if (undoMigrationButton) undoMigrationButton.addEventListener("click", () => {
    if (!activePlanMigration) return;
    if (!confirm("Annuler la migration " + activePlanMigration.mappingLabel + " et restaurer exactement les écritures d'origine ? Cette action est possible uniquement si les écritures n'ont pas changé depuis la migration.")) return;
    const previousEntries = structuredClone(store.entries), previousPlan = s.plan, previousHistory = structuredClone(s.planMigrationHistory || []);
    try {
      const undone = undoPlanMigration(store, activePlanMigration.id);
      if (!saveStore(store)) throw new Error("Sauvegarde locale impossible : le retour arrière a été annulé.");
      refreshPlan();
      toast("Retour arrière effectué : " + undone.restoredEntryCount + " écriture(s) restaurée(s).");
      router.render();
    } catch (error) {
      store.entries = previousEntries; s.plan = previousPlan; s.planMigrationHistory = previousHistory; refreshPlan();
      toast(error.message);
    }
  });
  document.querySelectorAll("[data-migration-excel]").forEach((button) => button.addEventListener("click", () => {
    const record = migrationRecords.find((item) => item.id === button.dataset.migrationExcel);
    if (!record?.auditReport) return toast("Rapport détaillé indisponible.");
    const rows = migrationAuditRows(record.auditReport);
    const headers = Object.keys(rows[0] || {});
    const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse}th,td{border:1px solid #999;padding:5px}th{background:#eee}</style></head><body><h1>Audit de migration MIZANE</h1><p>' + esc(record.mappingLabel) + ' — ' + esc(record.sourcePlanId) + ' vers ' + esc(record.targetPlanId) + '</p><p>Comparaison technique selon le rapprochement approuvé ; ne vaut pas certification d’équivalence.</p><table><thead><tr>' + headers.map((key) => '<th>' + esc(key) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((key) => '<td>' + esc(row[key]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
    downloadBlob(new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" }), "mizane-audit-migration-" + record.id + ".xls");
  }));
  document.querySelectorAll("[data-migration-pdf]").forEach((button) => button.addEventListener("click", () => {
    const record = migrationRecords.find((item) => item.id === button.dataset.migrationPdf);
    if (!record?.auditReport) return toast("Rapport détaillé indisponible.");
    const report = record.auditReport;
    const rows = migrationAuditRows(report);
    const headers = Object.keys(rows[0] || {});
    const w = window.open("", "_blank");
    if (!w) return toast("Autorisez les fenêtres contextuelles pour imprimer le rapport.");
    const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Audit MIZANE</title><style>body{font:11px Arial;padding:20px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px;text-align:left}th{background:#eee}.note{margin:12px 0;color:#444}@media print{button{display:none}}</style></head><body><h1>Audit de migration MIZANE</h1><p>' + esc(record.mappingLabel) + ' — ' + esc(record.sourcePlanId) + ' vers ' + esc(record.targetPlanId) + '</p><p>Statut : ' + esc(report.status) + ' · Écritures : ' + report.entryCountBefore + ' · Écarts : ' + report.differenceCount + '</p><p>Avant : débit ' + report.beforeTotals.debit + ' / crédit ' + report.beforeTotals.credit + ' — Après : débit ' + report.afterTotals.debit + ' / crédit ' + report.afterTotals.credit + '</p><p class="note">Comparaison technique des soldes selon les règles du rapprochement ; elle ne certifie pas l’équivalence juridique ou comptable des plans.</p><table><thead><tr>' + headers.map((key) => '<th>' + esc(key) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + headers.map((key) => '<td>' + esc(row[key]) + '</td>').join('') + '</tr>').join('') + '</tbody></table><p>Généré le ' + esc(report.generatedAt) + '</p></body></html>';
    w.document.open(); w.document.write(html); w.document.close(); w.focus(); w.print();
  }));
  document.querySelectorAll("[data-migration-undo]").forEach((button) => button.addEventListener("click", () => {
    const record = migrationRecords.find((item) => item.id === button.dataset.migrationUndo);
    if (!record || !confirm("Restaurer les écritures antérieures à la migration « " + record.mappingLabel + " » ? Le retour arrière est refusé si les écritures ont changé depuis cette migration.")) return;
    const previousEntries = structuredClone(store.entries), previousPlan = s.plan, previousHistory = structuredClone(s.planMigrationHistory || []);
    try {
      const undone = undoPlanMigration(store, record.id);
      if (!saveStore(store)) throw new Error("Sauvegarde locale impossible : le retour arrière a été annulé.");
      refreshPlan(); toast("Retour arrière effectué : " + undone.restoredEntryCount + " écriture(s) restaurée(s)."); router.render();
    } catch (error) {
      store.entries = previousEntries; s.plan = previousPlan; s.planMigrationHistory = previousHistory; refreshPlan(); toast(error.message);
    }
  }));
  const updateVat = () => {
    const c = getCountry(document.getElementById("s-country").value);
    document.getElementById("s-vat").textContent = `Taux de TVA ${c.name} : ${c.vatRates.join("%, ")}% — Devise : ${c.currency} — Plan : ${PLANS[c.plan]?.name || c.plan}`;
  };
  updateVat();
  const updateCountryFramework = () => {
    const country = getCountry(document.getElementById("s-country").value);
    const framework = getCountryAccountingFramework(country.code);
    const target = document.getElementById("country-framework-info");
    if (!framework) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = `<strong>Référentiel national identifié :</strong> ${esc(framework.name)}<br>
      <span>${esc(framework.standard)}</span><br>
      <span>Autorité : ${esc(framework.authority)} · Statut : référentiel vérifié, plan de comptes détaillé non intégré</span><br>
      <a href="${esc(framework.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(framework.sourceLabel)}</a>
      <p>Ce cadre de normes ne constitue pas automatiquement un plan de comptes. Le plan actuellement sélectionné reste actif jusqu'à l'intégration d'une nomenclature officielle et testée.</p>`;
  };
  updateCountryFramework();
  const updatePlanDescription = () => {
    const selectedId = document.getElementById("s-plan").value;
    const selectedPlan = getPlan(selectedId, s.customPlans);
    document.getElementById("plan-description").textContent = selectedPlan?.description ||
      (selectedPlan?.category === "sectoral-template" ? "Modèle indicatif à adapter au référentiel légal applicable." : "Référentiel comptable intégré à MIZANE.");
  };
  document.getElementById("s-plan").addEventListener("change", updatePlanDescription);
  document.getElementById("s-country").addEventListener("change", (e) => {
    const c = getCountry(e.target.value);
    if (c.plan && PLANS[c.plan]) document.getElementById("s-plan").value = c.plan;
    document.getElementById("s-currency").value = c.currency;
    updateVat();
    updatePlanDescription();
    updateCountryFramework();
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

  const aiPanel = document.getElementById("ai-settings-panel");
  const providerLinks = {
    groq: "https://console.groq.com/keys",
    gemini: "https://aistudio.google.com/apikey",
    mistral: "https://console.mistral.ai/api-keys",
  };
  const providerNames = { groq: "Groq", gemini: "Google Gemini", mistral: "Mistral AI" };
  const renderAISettings = async () => {
    aiPanel.innerHTML = '<p class="muted">Vérification des autorisations de votre entreprise…</p>';
    let access;
    try { access = await refreshCompanyAIStatus(pid); }
    catch (err) {
      aiPanel.innerHTML = '<p class="errors">' + esc(err.message) + '</p>';
      return;
    }
    if (!["admin", "accountant"].includes(access.role)) {
      aiPanel.innerHTML = '<p class="warn">La gestion des clés IA est réservée aux administrateurs et aux comptables de cette entreprise.</p>';
      return;
    }
    const selected = PROVIDERS[s.aiProvider] ? s.aiProvider : pid;
    const links = Object.entries(providerLinks).map(([id, url]) =>
      '<a class="button secondary" href="' + url + '" target="_blank" rel="noopener noreferrer">Créer une clé ' + providerNames[id] + '</a>'
    ).join(" ");
    aiPanel.innerHTML = `
      <p class="muted">Accès autorisé : ${access.role === "admin" ? "Administrateur" : "Comptable"}. Choisissez un fournisseur, ouvrez son portail officiel pour créer gratuitement une clé selon ses quotas, puis revenez ici pour l'enregistrer.</p>
      <div class="row">
        <div><label>Fournisseur IA</label><select id="s-aiprovider">${Object.entries(PROVIDERS).map(([id,p]) => `<option value="${id}" ${selected===id?"selected":""}>${p.label}</option>`).join("")}</select></div>
        <div><label>Modèle</label><select id="s-aimodel">${PROVIDERS[selected].models.map(m => `<option value="${m}" ${m===(s.aiModel||PROVIDERS[selected].models[0])?"selected":""}>${m}</option>`).join("")}</select></div>
      </div>
      <p class="actions">${links}</p>
      <label for="s-aikey">Clé API fournie par le fournisseur</label>
      <input id="s-aikey" type="password" autocomplete="off" placeholder="Collez ici votre clé API">
      <div class="actions">
        <button id="s-ai-save">Enregistrer la clé dans MIZANE</button>
        <button class="secondary" id="s-ai-test">Tester la connexion</button>
        <button class="danger" id="s-ai-delete">Supprimer la clé</button>
      </div>
      <p id="s-aikey-status" class="muted">${access.providers.includes(selected) ? "Une clé est déjà configurée pour ce fournisseur." : "Aucune clé enregistrée pour ce fournisseur."} La clé ne sera jamais affichée à nouveau.</p>
    `;
    document.getElementById("s-aiprovider").addEventListener("change", e => {
      s.aiProvider=e.target.value;
      s.aiModel=PROVIDERS[s.aiProvider].models[0];
      s.aiEndpoint=PROVIDERS[s.aiProvider].endpoint;
      saveStore(store); renderAISettings();
    });
    document.getElementById("s-aimodel").addEventListener("change", e => { s.aiModel=e.target.value; saveStore(store); });
    document.getElementById("s-ai-save").addEventListener("click", async () => {
      const input=document.getElementById("s-aikey"), value=input.value.trim(), status=document.getElementById("s-aikey-status");
      if(!value) { status.textContent="Collez d'abord la clé API."; return; }
      status.textContent="Enregistrement sécurisé en cours…";
      try {
        await configureCompanyAI(selected,value);
        input.value="";
        status.textContent="Clé enregistrée dans le coffre sécurisé de cette entreprise.";
        toast("Clé IA enregistrée.");
        renderAISettings();
      } catch(err) { status.textContent=err.message; }
    });
    document.getElementById("s-ai-test").addEventListener("click", async () => {
      const status=document.getElementById("s-aikey-status");
      status.textContent="Test de connexion en cours…";
      try {
        const reply=await chat(store,[],"Réponds uniquement par : Connexion MIZANE réussie.");
        status.textContent="Connexion réussie : "+reply.slice(0,160);
      } catch(err) { status.textContent="Échec du test : "+err.message; }
    });
    document.getElementById("s-ai-delete").addEventListener("click", async () => {
      if(!confirm("Supprimer la clé API de "+providerNames[selected]+" pour cette entreprise ?")) return;
      const status=document.getElementById("s-aikey-status");
      try { await deleteCompanyAI(selected); status.textContent="Clé supprimée."; toast("Clé IA supprimée."); renderAISettings(); }
      catch(err) { status.textContent=err.message; }
    });
  };
  renderAISettings();


  const makeCustomPlanId = () => "custom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const exportCustomPlan = (planToExport) => {
    const payload = { format: "mizane-custom-plan", version: 1, plan: planToExport };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "mizane-plan-" + planToExport.id + ".json");
  };
  document.getElementById("cp-create").addEventListener("click", () => {
    const name = document.getElementById("cp-new-name").value.trim();
    if (!name) return toast("Donnez un nom au plan personnalisé.");
    if ((s.customPlans || []).length >= 100) return toast("Limite de 100 plans personnalisés atteinte.");
    const baseId = document.getElementById("cp-new-base").value;
    const base = getPlan(baseId, s.customPlans);
    const rows = base.category === "custom-plan"
      ? base.accounts.map((a) => [...a])
      : allAccounts(baseId).map((a) => [a.code, a.label, a.type]);
    for (const a of s.customAccounts || []) if (!rows.some((row) => row[0] === a.code)) rows.push([a.code, a.label, a.type]);
    try {
      const created = createCustomPlan({ id: makeCustomPlanId(), name, basePlanId: baseId, description: "Copie personnalisable de " + base.name, accounts: rows });
      s.customPlans.push(created); s.plan = created.id; refreshPlan(); saveStore(store);
      toast("✓ Plan personnalisé créé et activé."); router.render();
    } catch (err) { toast(err.message); }
  });
  document.querySelectorAll("[data-cp-activate]").forEach((button) => button.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === button.dataset.cpActivate);
    if (!target) return;
    s.plan = target.id; refreshPlan(); saveStore(store); toast("Plan personnalisé activé."); router.render();
  }));
  document.querySelectorAll("[data-cp-export]").forEach((button) => button.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === button.dataset.cpExport);
    if (target) exportCustomPlan(target);
  }));
  document.querySelectorAll("[data-cp-delete]").forEach((button) => button.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === button.dataset.cpDelete);
    if (!target || !confirm("Supprimer le plan « " + target.name + " » ? Les écritures existantes ne seront pas supprimées.")) return;
    s.customPlans = s.customPlans.filter((p) => p.id !== target.id);
    if (s.plan === target.id) s.plan = PLANS[target.basePlanId] ? target.basePlanId : "syscohada";
    refreshPlan(); saveStore(store); toast("Plan personnalisé supprimé."); router.render();
  }));
  document.getElementById("cp-save-meta")?.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === s.plan);
    if (!target) return;
    try {
      const updated = validateCustomPlan({ ...target, name: document.getElementById("cp-edit-name").value, description: document.getElementById("cp-edit-description").value, updatedAt: new Date().toISOString() });
      s.customPlans = s.customPlans.map((p) => p.id === updated.id ? updated : p);
      saveStore(store); toast("Métadonnées du plan mises à jour."); router.render();
    } catch (err) { toast(err.message); }
  });
  document.getElementById("cp-add-account")?.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === s.plan);
    if (!target) return;
    const code = document.getElementById("cp-account-code").value.trim();
    const label = document.getElementById("cp-account-label").value.trim();
    const type = document.getElementById("cp-account-type").value;
    try {
      const updated = validateCustomPlan({ ...target, accounts: [...target.accounts, [code, label, type]], updatedAt: new Date().toISOString() });
      s.customPlans = s.customPlans.map((p) => p.id === updated.id ? updated : p);
      refreshPlan(); saveStore(store); toast("Compte ajouté au plan personnalisé."); router.render();
    } catch (err) { toast(err.message); }
  });
  document.querySelectorAll("[data-cp-remove-account]").forEach((button) => button.addEventListener("click", () => {
    const target = s.customPlans.find((p) => p.id === s.plan);
    if (!target) return;
    const code = button.dataset.cpRemoveAccount;
    if ((store.entries || []).some((entry) => (entry.lines || []).some((line) => line.account === code))) return toast("Suppression impossible : ce compte est utilisé dans une écriture.");
    if (!confirm("Retirer le compte " + code + " de ce plan ?")) return;
    const updated = validateCustomPlan({ ...target, accounts: target.accounts.filter((row) => row[0] !== code), updatedAt: new Date().toISOString() });
    s.customPlans = s.customPlans.map((p) => p.id === updated.id ? updated : p);
    refreshPlan(); saveStore(store); toast("Compte retiré."); router.render();
  }));
  document.getElementById("cp-import").addEventListener("click", async () => {
    const input = document.getElementById("cp-import-file");
    const file = input.files && input.files[0];
    if (!file) return toast("Sélectionnez un fichier JSON de plan.");
    try {
      if (file.size > 2000000) throw new Error("Fichier trop volumineux (maximum 2 Mo).");
      const raw = JSON.parse(await file.text());
      const source = raw && raw.format === "mizane-custom-plan" ? raw.plan : raw;
      if (raw && raw.version != null && raw.version !== 1) throw new Error("Version de fichier non prise en charge.");
      const imported = validateCustomPlan({ ...source, id: makeCustomPlanId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if ((s.customPlans || []).length >= 100) throw new Error("Limite de 100 plans personnalisés atteinte.");
      s.customPlans.push(imported); s.plan = imported.id; refreshPlan(); saveStore(store);
      toast("Plan importé et activé."); router.render();
    } catch (err) { toast("Import impossible : " + err.message); }
    finally { input.value = ""; }
  });

  document.getElementById("ca-add").addEventListener("click", () => {
    const code = document.getElementById("ca-code").value.trim();
    const label = document.getElementById("ca-label").value.trim();
    if (!code || !label) return toast("Numéro et libellé obligatoires.");
    if (s.customAccounts.some((a) => a.code === code) || planAccounts.some((a) => a.code === code)) return toast("Ce compte existe déjà.");
    const accountType = document.getElementById("ca-type").value;
    const activeCustom = (s.customPlans || []).find((p) => p.id === s.plan);
    if (activeCustom) {
      try {
        const updated = validateCustomPlan({ ...activeCustom, accounts: [...activeCustom.accounts, [code, label, accountType]], updatedAt: new Date().toISOString() });
        s.customPlans = s.customPlans.map((p) => p.id === updated.id ? updated : p);
      } catch (err) { return toast(err.message); }
    } else {
      s.customAccounts.push({ code, label, type: accountType });
    }
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
