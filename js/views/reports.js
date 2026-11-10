// MIZANE — Écrans : balance, résultat, bilan, tiers, assistant IA, paramètres.
import { trialBalance, incomeStatement, balanceSheet, checkAnomalies, toCSV } from "../accounting.js";
import { PLANS, getPlan, ACCOUNT_TYPES } from "../plans.js";
import { COUNTRIES, getCountry } from "../countries.js";
import { aiConfigured, chat, aiAudit, localAssist, localAuditSummary } from "../ai.js";
import { saveStore, exportJSON, importJSON, downloadBlob, resetStore, demoData } from "../db.js";
import { store, planAccounts, aiHistory, $app, router, toast, esc, money, refreshPlan, initStore } from "../state.js";

export function viewBalance() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  $app.innerHTML = `
    <h1>Balance générale</h1>
    <div class="card table-wrap">
      <p class="muted">Période : ${esc(exerciceStart)} → ${esc(exerciceEnd)}</p>
      ${tb.rows.length === 0 ? `<p class="muted">Aucune écriture.</p>` : `
      <table>
        <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Total débit</th><th class="num">Total crédit</th><th class="num">Solde débiteur</th><th class="num">Solde créditeur</th></tr></thead>
        <tbody>
          ${tb.rows.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.label)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num">${r.soldeDebit ? money(r.soldeDebit) : ""}</td><td class="num">${r.soldeCredit ? money(r.soldeCredit) : ""}</td></tr>`).join("")}
          <tr class="total"><td colspan="2">Totaux</td><td class="num">${money(tb.totals.debit)}</td><td class="num">${money(tb.totals.credit)}</td><td class="num">${money(tb.totals.soldeDebit)}</td><td class="num">${money(tb.totals.soldeCredit)}</td></tr>
        </tbody>
      </table>
      <p class="${tb.totals.debit === tb.totals.credit ? "ok-msg" : "errors"}">${tb.totals.debit === tb.totals.credit ? "✓ Balance équilibrée." : "⚠ Balance déséquilibrée !"}</p>`}
      <div class="actions"><button class="secondary" id="bal-csv">⬇ Exporter CSV</button></div>
    </div>
  `;
  document.getElementById("bal-csv")?.addEventListener("click", () => {
    downloadBlob(new Blob(["\ufeff" + toCSV(tb.rows)], { type: "text/csv;charset=utf-8" }), "mizane-balance.csv");
  });
}

export function viewIncome() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const is = incomeStatement(store, exerciceStart, exerciceEnd);
  $app.innerHTML = `
    <h1>Compte de résultat</h1>
    <div class="grid cols-2">
      <div class="card table-wrap">
        <h2>Charges</h2>
        <table><tbody>${is.charges.map((r) => `<tr><td>${esc(r.code)} ${esc(r.label)}</td><td class="num">${money(r.solde)}</td></tr>`).join("") || `<tr><td class="muted">Aucune charge</td></tr>`}
        <tr class="total"><td>Total charges</td><td class="num">${money(is.totCharges)}</td></tr></tbody></table>
      </div>
      <div class="card table-wrap">
        <h2>Produits</h2>
        <table><tbody>${is.produits.map((r) => `<tr><td>${esc(r.code)} ${esc(r.label)}</td><td class="num">${money(r.solde)}</td></tr>`).join("") || `<tr><td class="muted">Aucun produit</td></tr>`}
        <tr class="total"><td>Total produits</td><td class="num">${money(is.totProduits)}</td></tr></tbody></table>
      </div>
    </div>
    <div class="card kpi">
      <div class="value" style="color:${is.resultat >= 0 ? "var(--ok)" : "var(--danger)"}">${money(is.resultat)}</div>
      <div class="label">${is.resultat >= 0 ? "Bénéfice" : "Perte"} de l'exercice</div>
    </div>
  `;
}

function groupTable(title, rows) {
  return `
    <h2>${title}</h2>
    <table><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.code)} ${esc(r.label)}</td><td class="num">${money(r.solde)}</td></tr>`).join("") || `<tr><td class="muted">—</td></tr>`}
    </tbody></table>`;
}

export function viewSheet() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const b = balanceSheet(store, exerciceStart, exerciceEnd);
  $app.innerHTML = `
    <h1>Bilan</h1>
    <div class="grid cols-2">
      <div class="card table-wrap">
        <h2>Actif</h2>
        ${groupTable("Immobilisations", b.actif.immobilisations)}
        ${groupTable("Stocks", b.actif.stocks)}
        ${groupTable("Créances", b.actif.creances)}
        ${groupTable("Trésorerie actif", b.actif.tresorerie)}
        <table><tbody><tr class="total"><td>Total actif</td><td class="num">${money(b.totActif)}</td></tr></tbody></table>
      </div>
      <div class="card table-wrap">
        <h2>Passif</h2>
        ${groupTable("Capitaux propres et financement permanent", b.passif.capitaux)}
        ${groupTable("Dettes", b.passif.dettes)}
        ${groupTable("Trésorerie passif", b.passif.tresorerie)}
        <table><tbody><tr class="total"><td>Total passif</td><td class="num">${money(b.totPassif)}</td></tr></tbody></table>
      </div>
    </div>
    <div class="card kpi">
      <div class="value" style="color:${Math.abs(b.ecart) < 0.001 ? "var(--ok)" : "var(--danger)"}">${Math.abs(b.ecart) < 0.001 ? "✓ Équilibre Actif = Passif" : "⚠ Écart : " + money(b.ecart)}</div>
      <div class="label">Contrôle d'équilibre du bilan</div>
    </div>
  `;
}

export function viewThirds() {
  $app.innerHTML = `
    <h1>Tiers (clients & fournisseurs)</h1>
    <div class="card">
      <div class="row">
        <div><label>Nom</label><input id="t-name" placeholder="Nom du tiers"></div>
        <div><label>Type</label><select id="t-type"><option value="client">Client</option><option value="fournisseur">Fournisseur</option><option value="autre">Autre</option></select></div>
        <div><label>Téléphone</label><input id="t-phone"></div>
        <div><label>Email</label><input id="t-email"></div>
        <div class="nogrow"><button id="t-add">Ajouter</button></div>
      </div>
    </div>
    <div class="card table-wrap">
      ${store.thirds.length === 0 ? `<p class="muted">Aucun tiers enregistré.</p>` : `
      <table><thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th>Solde</th><th></th></tr></thead>
      <tbody>${store.thirds.map((t, i) => {
        let solde = 0;
        for (const e of store.entries) for (const l of e.lines) if (l.third === t.name) solde += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        return `<tr><td>${esc(t.name)}</td><td><span class="tag">${esc(t.type)}</span></td><td>${esc(t.phone || "")}</td><td>${esc(t.email || "")}</td><td class="num">${money(solde)}</td>
        <td><button class="danger small" data-del-third="${i}">✕</button></td></tr>`;
      }).join("")}</tbody></table>`}
    </div>
  `;
  document.getElementById("t-add").addEventListener("click", () => {
    const name = document.getElementById("t-name").value.trim();
    if (!name) return toast("Le nom est obligatoire.");
    store.thirds.push({ name, type: document.getElementById("t-type").value, phone: document.getElementById("t-phone").value, email: document.getElementById("t-email").value });
    saveStore(store);
    toast("✓ Tiers ajouté.");
    router.render();
  });
  $app.querySelectorAll("[data-del-third]").forEach((b) => {
    b.addEventListener("click", () => {
      store.thirds.splice(Number(b.dataset.delThird), 1);
      saveStore(store);
      router.render();
    });
  });
}

export function viewAssistant() {
  const audit = localAuditSummary(store);
  $app.innerHTML = `
    <h1>Assistant IA</h1>
    ${aiConfigured(store)
      ? `<p class="ok-msg">✓ Mistral AI connecté (modèle ${esc(store.settings.aiModel)}).</p>`
      : `<p class="warn">⚠ Aucune clé API Mistral. L'assistant local basique est actif. Ajoutez votre clé dans <a href="#settings">Paramètres</a>.</p>`}
    <div class="grid cols-3">
      <div class="card kpi"><div class="value">${audit.total}</div><div class="label">Anomalies (moteur local)</div></div>
      <div class="card kpi"><div class="value">${audit.desequilibres}</div><div class="label">Déséquilibres</div></div>
      <div class="card kpi"><div class="value">${audit.comptesInconnus}</div><div class="label">Comptes inconnus</div></div>
    </div>
    <div class="card">
      <h2>💬 Conversation</h2>
      <div class="chat-box" id="chat-box">
        <div class="chat-msg ai">Bonjour ! Je suis l'assistant comptable MIZANE${aiConfigured(store) ? " (Mistral AI)" : " (mode local)"}. Posez vos questions sur vos comptes, ou demandez-moi d'expliquer une écriture, la TVA, le résultat…</div>
        ${aiHistory.map((m) => `<div class="chat-msg ${m.role === "user" ? "user" : "ai"}">${esc(m.content)}</div>`).join("")}
      </div>
      <div class="row">
        <input id="chat-input" placeholder="Ex. : Quel est mon résultat ? Explique la TVA sur mes ventes…">
        <div class="nogrow"><button id="chat-send">Envoyer</button></div>
      </div>
    </div>
    <div class="card">
      <h2>🔎 Audit intelligent</h2>
      <p class="muted">Analyse complète des écritures : erreurs, TVA oubliée, comptes suspects, recommandations.</p>
      <button id="audit-run">${aiConfigured(store) ? "Lancer l'audit IA" : "Lancer le contrôle local"}</button>
      <div id="audit-result" style="margin-top:10px"></div>
    </div>
  `;
  const send = async () => {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (!msg) return;
    aiHistory.push({ role: "user", content: msg });
    input.value = "";
    const box = document.getElementById("chat-box");
    box.insertAdjacentHTML("beforeend", `<div class="chat-msg user">${esc(msg)}</div><div class="chat-msg ai">⏳ …</div>`);
    box.scrollTop = box.scrollHeight;
    let reply;
    try {
      reply = aiConfigured(store) ? await chat(store, aiHistory.slice(0, -1), msg) : localAssist(store, msg);
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
  $app.innerHTML = `
    <h1>Paramètres</h1>
    <div class="card">
      <h2>🏢 Société & internationalisation</h2>
      <div class="row">
        <div><label>Nom de la société</label><input id="s-company" value="${esc(s.companyName)}"></div>
        <div><label>Pays (détermine le plan, la devise, la TVA)</label>
          <select id="s-country">${COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === s.country ? "selected" : ""}>${esc(c.name)} — ${c.currency} (${esc(c.zone)})</option>`).join("")}</select>
        </div>
      </div>
      <div class="row">
        <div><label>Plan comptable</label>
          <select id="s-plan">${Object.values(PLANS).map((p) => `<option value="${p.id}" ${p.id === s.plan ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        </div>
        <div><label>Devise</label><input id="s-currency" value="${esc(s.currency)}" maxlength="3"></div>
      </div>
      <div class="row">
        <div><label>Début d'exercice</label><input type="date" id="s-start" value="${esc(s.exerciceStart)}"></div>
        <div><label>Fin d'exercice</label><input type="date" id="s-end" value="${esc(s.exerciceEnd)}"></div>
        <div class="nogrow"><button id="s-save">Enregistrer</button></div>
      </div>
      <p class="muted" id="s-vat"></p>
    </div>

    <div class="card">
      <h2>🤖 Assistant IA (Mistral)</h2>
      <div class="row">
        <div><label>Clé API Mistral</label><input id="s-aikey" type="password" placeholder="Collez votre clé API Mistral" value="${esc(s.aiKey)}"></div>
        <div><label>Modèle</label>
          <select id="s-aimodel">
            ${["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest", "open-mistral-nemo", "ministral-8b-latest"].map((m) => `<option ${m === s.aiModel ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
      </div>
      <p class="muted">Obtenez une clé gratuite sur console.mistral.ai. La clé reste stockée uniquement sur votre appareil.</p>
    </div>

    <div class="card">
      <h2>📒 Plan de comptes — ${esc(plan.name)} (${planAccounts.length} comptes)</h2>
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
    document.getElementById("s-vat").textContent = `Taux de TVA ${c.name} : ${c.vatRates.join("%, ")}% — Devise : ${c.currency}`;
  };
  updateVat();
  document.getElementById("s-country").addEventListener("change", updateVat);

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

  document.getElementById("s-aikey").addEventListener("change", (e) => { s.aiKey = e.target.value.trim(); saveStore(store); toast(s.aiKey ? "✓ Clé Mistral enregistrée." : "Clé supprimée."); });
  document.getElementById("s-aimodel").addEventListener("change", (e) => { s.aiModel = e.target.value; saveStore(store); });

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
      initStore(data);
      toast("✓ Sauvegarde importée.");
      router.go("dashboard");
    } catch (err) { toast("Import impossible : " + err.message); }
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
