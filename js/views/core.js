// MIZANE — Écrans : tableau de bord, saisie, écritures, grand livre.
import { JOURNALS, postEntry, reverseEntry, trialBalance, ledger, incomeStatement, checkAnomalies, cashBalance, toCSV, accountType } from "../accounting.js";
import { aiConfigured, suggestEntry, parseEntryFromTextLocal, imageFileToDataUrl } from "../ai.js";
import { printHTML, invoiceHTML } from "../print.js";
import { saveStore, downloadBlob, exportXLS } from "../db.js";
import { notifyDetectedAnomalies } from "../notifications.js";
import { buildStrategicDashboardSnapshot } from "../strategic-dashboard-core.js";
import { buildAccountingControlReport, accountingControlRows } from "../accounting-controls.js";
import { listLocalAccountingDocuments, getLocalAccountingDocument, deleteLocalAccountingDocument } from "../accounting-documents.js";
import { listCloudAccountingDocumentsForEntry, downloadCloudAccountingDocument, deleteCloudAccountingDocument } from "../accounting-documents-cloud.js";
import {
  store, planAccounts, $app, router, toast, esc, money, planLabel,
  getDraftLines, setDraftLines, getDraftHeader, setDraftHeader, resetDraft, openModal, closeModal,
} from "../state.js";

export function viewDashboard(readOnly = false) {
  const { exerciceStart, exerciceEnd } = store.settings;
  const is = incomeStatement(store, exerciceStart, exerciceEnd);
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  const anomalies = checkAnomalies(store);
  const controlReport = buildAccountingControlReport(store, { start: exerciceStart, end: exerciceEnd });
  const controlRows = accountingControlRows(controlReport);
  if (anomalies.length) notifyDetectedAnomalies(anomalies).catch(error => console.warn("Signalement des anomalies comptables impossible :", error?.message || error));
  const cash = cashBalance(store, "", new Date().toISOString().slice(0, 10));
  const balanced = Math.abs(tb.totals.debit - tb.totals.credit) < 0.001;
  const overview = buildStrategicDashboardSnapshot(store);
  const currencyRows = values => Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => `<div class="dashboard-currency"><strong>${esc(code)}</strong><span>${new Intl.NumberFormat(store.settings.locale || "fr-FR", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount)}</span></div>`).join("") || '<p class="muted">Aucune donnée disponible.</p>';
  const profitabilityRows = Object.entries(overview.profitability).sort(([a], [b]) => a.localeCompare(b))
    .map(([code, item]) => `<div class="dashboard-currency"><strong>${esc(code)}</strong><span>Marge brute : ${new Intl.NumberFormat(store.settings.locale || "fr-FR", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(item.margin)} · Taux : ${item.marginRate == null ? "indisponible" : item.marginRate + " %"} · Coûts incomplets : ${item.incompleteLines}</span></div>`).join("") || '<p class="muted">Aucune marge calculable sur les ventes avec mouvements de stock disponibles.</p>';
  const alertItems = [
    ...overview.receivables.overdue.map(item => `<li>Facture client ${esc(item.number)} — ${esc(item.customer)} : ${new Intl.NumberFormat(store.settings.locale || "fr-FR", { style: "currency", currency: item.currency, maximumFractionDigits: 2 }).format(item.balance)} (échéance ${esc(item.dueDate)})</li>`),
    ...overview.inventory.lowStock.map(item => `<li>Stock bas : ${esc(item.name)} — ${item.quantity} ${esc(item.unit)} (seuil : ${item.threshold})</li>`),
    ...anomalies.slice(0, 8).map(item => `<li>${esc(item.message)}</li>`),
  ];
  $app.innerHTML = `
    <h1>Tableau de bord stratégique</h1>
    <p class="muted">Vue de synthèse au ${esc(overview.asOf)} · Exercice du ${esc(exerciceStart)} au ${esc(exerciceEnd)}</p>
    <div class="grid cols-3">
      <div class="card kpi"><div class="value">${money(is.totProduits)}</div><div class="label">Produits comptabilisés (exercice)</div></div>
      <div class="card kpi"><div class="value">${money(is.totCharges)}</div><div class="label">Charges comptabilisées (exercice)</div></div>
      <div class="card kpi"><div class="value">${money(is.resultat)}</div><div class="label">Résultat comptable</div></div>
      <div class="card kpi"><div class="value">${money(cash)}</div><div class="label">Trésorerie comptabilisée</div></div>
      <div class="card kpi"><div class="value">${store.entries.length}</div><div class="label">Écritures comptables</div></div>
      <div class="card kpi"><div class="value">${anomalies.length === 0 ? "✓" : anomalies.length}</div><div class="label">${anomalies.length === 0 ? "Aucune anomalie comptable" : "Anomalies comptables"}</div></div>
    </div>
    <div class="grid cols-2">
      <section class="card">
        <h2>Activité commerciale</h2>
        <p class="muted">${overview.sales.invoices} facture(s) de vente · Montants par devise</p>
        ${currencyRows(overview.sales.amountByCurrency)}
        <p class="muted">${overview.purchases.invoices} facture(s) fournisseur(s) · Montants par devise</p>
        ${currencyRows(overview.purchases.amountByCurrency)}
        <h3>Rentabilité commerciale</h3>
        ${profitabilityRows}
        <div class="actions"><button class="secondary" data-route="billing">Facturation</button><button class="secondary" data-route="purchases">Achats</button><button class="secondary" data-route="commercial-margins">Marges commerciales</button></div>
      </section>
      <section class="card">
        <h2>Stocks et alertes</h2>
        <div class="grid cols-2">
          <div class="kpi"><div class="value">${overview.inventory.products}</div><div class="label">Articles actifs stockables</div></div>
          <div class="kpi"><div class="value">${overview.inventory.lowStock.length}</div><div class="label">Alertes de seuil de stock</div></div>
          <div class="kpi"><div class="value">${overview.receivables.overdueCount}</div><div class="label">Factures clients en retard</div></div>
        </div>
        <div class="actions"><button class="secondary" data-route="stock">Gestion de stock</button><button class="secondary" data-route="financial">Pilotage financier</button></div>
      </section>
    </div>
    <section class="card">
      <h2>Alertes de gestion</h2>
      ${alertItems.length ? `<ul class="errors">${alertItems.slice(0, 12).join("")}</ul>` : '<p class="ok-msg">Aucune alerte détectée dans les données disponibles.</p>'}
      <p class="muted">Les montants commerciaux restent séparés par devise. Les alertes de stock ne sont calculées que pour les articles disposant d’un seuil minimum renseigné.</p>
    </section>
    <div class="card">
          <section class="card" id="accounting-control-panel">
      <h2>Contrôle comptable automatisé</h2>
      <p class="muted">Analyse en lecture seule de l’exercice ${esc(exerciceStart)} → ${esc(exerciceEnd)}. Les alertes sont des signaux de contrôle à examiner ; elles ne modifient aucune écriture.</p>
      <div class="grid cols-3">
        <div class="kpi"><div class="value">${controlReport.bySeverity.critical}</div><div class="label">Anomalies critiques</div></div>
        <div class="kpi"><div class="value">${controlReport.bySeverity.warning}</div><div class="label">Points à vérifier</div></div>
        <div class="kpi"><div class="value">${controlReport.bySeverity.info}</div><div class="label">Informations / vigilance</div></div>
      </div>
      <p class="${controlReport.totals.balanced ? "ok-msg" : "errors"}">${controlReport.totals.balanced ? "✓ Totaux débit/crédit équilibrés sur la période." : "⚠ Écart de balance : " + money(controlReport.totals.debit) + " / " + money(controlReport.totals.credit)}</p>
      <p class="muted">${controlReport.totals.periodEntries} écriture(s) sur la période · ${controlReport.totals.accounts} compte(s) mouvementé(s) · ${controlReport.totals.journals} journal(aux) · ${controlReport.totals.outOfPeriodCount} écriture(s) hors période détectée(s).</p>
      ${controlReport.warnings.length ? '<div class="table-wrap"><table><thead><tr><th>Gravité</th><th>Date</th><th>Journal</th><th>Écriture</th><th>Anomalie</th></tr></thead><tbody>' + controlReport.warnings.slice(0, 20).map(item => '<tr><td>' + esc(item.severity === "critical" ? "Critique" : item.severity === "warning" ? "À vérifier" : "Information") + '</td><td>' + esc(item.date || "—") + '</td><td>' + esc(item.journal || "—") + '</td><td>' + esc(item.entryId ?? "—") + '</td><td>' + esc(item.message) + '</td></tr>').join("") + '</tbody></table></div>' : '<p class="ok-msg">Aucune anomalie détectée par les contrôles activés.</p>'}
      <h3>Contrôle par journal</h3>
      <div class="table-wrap"><table><thead><tr><th>Journal</th><th>Écritures</th><th class="num">Débit</th><th class="num">Crédit</th><th>État</th></tr></thead><tbody>${controlReport.journals.map(row => '<tr><td>' + esc(row.journal) + '</td><td>' + row.entries + '</td><td class="num">' + money(row.debit) + '</td><td class="num">' + money(row.credit) + '</td><td>' + (row.balanced ? "Équilibré" : "Écart : " + money(row.difference)) + '</td></tr>').join("") || '<tr><td colspan="5" class="muted">Aucun mouvement sur la période.</td></tr>'}</tbody></table></div>
      <details style="margin-top:12px"><summary>Soldes et mouvements par compte (${controlReport.balances.length})</summary><div class="table-wrap"><table><thead><tr><th>Compte</th><th>Type</th><th class="num">Débit</th><th class="num">Crédit</th><th class="num">Solde</th><th>Contrôle</th></tr></thead><tbody>${controlReport.balances.map(row => '<tr><td>' + esc(row.code) + '</td><td>' + esc(row.type) + '</td><td class="num">' + money(row.debit) + '</td><td class="num">' + money(row.credit) + '</td><td class="num">' + money(row.balance) + '</td><td>' + (row.abnormalSide ? "Sens inhabituel — à examiner" : "—") + '</td></tr>').join("")}</tbody></table></div></details>
      <div class="actions">
        <button class="secondary" id="accounting-controls-csv">Exporter les alertes CSV</button>
        <button class="secondary" id="accounting-controls-xls">Exporter le rapport Excel</button>
        <button class="secondary" id="accounting-controls-print">Imprimer le rapport / PDF</button>
      </div>
      <p class="muted">Les soldes de sens inhabituel sont signalés à titre indicatif : les comptes correcteurs et situations particulières nécessitent une appréciation comptable. Le contrôle ne remplace pas la révision par un professionnel.</p>
    </section>
    <div class="card">
      <h2>État de la comptabilité</h2>
      <p class="${balanced ? "ok-msg" : "errors"}">${balanced ? "✓ Balance équilibrée" : "⚠ Balance déséquilibrée : " + money(tb.totals.debit) + " / " + money(tb.totals.credit)}</p>
      <p class="muted">Plan comptable : ${esc(store.settings.plan)} · La trésorerie affichée correspond au solde des comptes de classe 5 à la date du jour.</p>
      <div class="actions">
        ${readOnly ? "" : '<button class="secondary" data-act="go-entry">➕ Nouvelle écriture</button>'}
        <button class="secondary" data-act="go-assistant">Ouvrir l’assistant IA</button>
        ${!readOnly && store.entries.length === 0 ? '<button data-act="demo">Charger des données de démonstration</button>' : ""}
      </div>
    </div>
  `;
  document.getElementById("accounting-controls-csv")?.addEventListener("click", () => {
    const rows = controlRows.length ? controlRows : [{ gravite: "—", type: "aucune_anomalie", date: "", journal: "", ecriture: "", compte: "", anomalie: "Aucune anomalie détectée." }];
    downloadBlob(new Blob(["\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" }), "mizane-controle-comptable.csv");
  });
  document.getElementById("accounting-controls-xls")?.addEventListener("click", () => {
    const panel = $app.querySelector("#accounting-control-panel");
    if (!panel) return toast("Aucun rapport de contrôle à exporter.");
    exportXLS("Contrôle comptable — " + store.settings.companyName, panel.outerHTML, "mizane-controle-comptable.xls");
  });
  document.getElementById("accounting-controls-print")?.addEventListener("click", () => {
    const panel = $app.querySelector("#accounting-control-panel");
    if (!panel) return;
    printHTML("Contrôle comptable — " + store.settings.companyName, panel.innerHTML);
  });
}
function lineRowHTML(l, i) {
  return `
    <tr>
      <td style="min-width:140px"><input list="accounts-list" data-i="${i}" data-f="account" value="${esc(l.account)}" placeholder="Compte" autocomplete="off"></td>
      <td><input data-i="${i}" data-f="label" value="${esc(l.label)}" placeholder="Libellé"></td>
      <td style="min-width:110px"><input type="number" step="0.01" min="0" data-i="${i}" data-f="debit" value="${l.debit}" placeholder="Débit"></td>
      <td style="min-width:110px"><input type="number" step="0.01" min="0" data-i="${i}" data-f="credit" value="${l.credit}" placeholder="Crédit"></td>
      <td><input data-i="${i}" data-f="third" value="${esc(l.third || "")}" placeholder="Tiers (opt.)"></td>
      <td class="nogrow"><button class="danger small" data-del-line="${i}" title="Supprimer la ligne">✕</button></td>
    </tr>`;
}

export function viewEntry() {
  const draftLines = getDraftLines();
  const header = getDraftHeader();
  if (!header.date) setDraftHeader({ date: new Date().toISOString().slice(0, 10) });
  if (!header.journal) setDraftHeader({ journal: "ACH" });
  const currentHeader = getDraftHeader();
  const totals = draftLines.reduce((acc, l) => ({ debit: acc.debit + (Number(l.debit) || 0), credit: acc.credit + (Number(l.credit) || 0) }), { debit: 0, credit: 0 });
  const diff = Math.round((totals.debit - totals.credit) * 100) / 100;
  const balanced = Math.abs(diff) < 0.001 && totals.debit > 0;
  $app.innerHTML = `
    <h1>Saisie d'écriture</h1>
    <datalist id="accounts-list">
      ${planAccounts.map((a) => `<option value="${a.code}">${esc(a.code)} — ${esc(a.label)}</option>`).join("")}
    </datalist>
    <div class="card">
      <div class="row">
        <div><label>Date</label><input type="date" id="e-date" value="${esc(currentHeader.date)}"></div>
        <div><label>Journal</label>
          <select id="e-journal">${JOURNALS.map((j) => `<option value="${j.id}" ${currentHeader.journal === j.id ? "selected" : ""}>${j.id} — ${esc(j.name)}</option>`).join("")}</select>
        </div>
        <div><label>Pièce / référence</label><input id="e-ref" value="${esc(currentHeader.reference)}" placeholder="FCT-001, TCK-014…"></div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th><th>Tiers</th><th></th></tr></thead>
          <tbody id="lines-body">${draftLines.map(lineRowHTML).join("")}</tbody>
        </table>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="nogrow"><button class="secondary" id="add-line">＋ Ligne</button></div>
        <div class="nogrow"><button class="secondary" id="ai-suggest-btn">🤖 Proposer avec l'IA</button></div>
        <div class="kpi" style="flex:1">
          <div class="value" id="tot-debit">${money(totals.debit)}</div><div class="label">Total débit</div>
        </div>
        <div class="kpi" style="flex:1">
          <div class="value" id="tot-credit">${money(totals.credit)}</div><div class="label">Total crédit</div>
        </div>
        <div class="kpi" style="flex:1">
          <div class="value" style="color:${balanced ? "var(--ok)" : "var(--danger)"}">${balanced ? "✓" : money(diff)}</div><div class="label">${balanced ? "Équilibrée" : "Écart"}</div>
        </div>
        <div class="nogrow"><button id="post-entry">Valider l'écriture</button></div>
      </div>
      <div id="entry-errors"></div>
    </div>
    <details class="help card">
      <summary>❓ Aide — journaux et comptes</summary>
      <p class="muted"><strong>Journaux :</strong> ACH (achats/fournisseurs), VTE (ventes/clients), BAN (banque), CAI (caisse), OD (opérations diverses : salaires, loyers, à-nouveaux…).</p>
      <p class="muted"><strong>Comptes :</strong> tapez un numéro (ex. 411) ou un mot-clé (ex. « client ») pour l'autocomplétion. Classes usuelles : 1 capitaux, 2 immobilisations, 3 stocks, 4 tiers, 5 trésorerie, 6 charges, 7 produits.</p>
      <p class="muted"><strong>Équilibre :</strong> une écriture n'est validable que si total débit = total crédit. Utilisez « Proposer avec l'IA » avec une phrase ou une photo de facture pour préremplir les lignes.</p>
    </details>
  `;

  $app.querySelectorAll("[data-i]").forEach((inp) => {
    inp.addEventListener("input", () => {
      draftLines[Number(inp.dataset.i)][inp.dataset.f] = inp.value;
      if (inp.dataset.f === "debit" || inp.dataset.f === "credit") updateEntryTotals();
    });
  });
  ["e-date", "e-journal", "e-ref"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      const field = id === "e-date" ? "date" : id === "e-journal" ? "journal" : "reference";
      setDraftHeader({ [field]: e.target.value });
    });
    document.getElementById(id).addEventListener("change", (e) => {
      const field = id === "e-date" ? "date" : id === "e-journal" ? "journal" : "reference";
      setDraftHeader({ [field]: e.target.value });
    });
  });
  $app.querySelectorAll("[data-del-line]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draftLines.splice(Number(btn.dataset.delLine), 1);
      if (draftLines.length < 2) draftLines.push({ account: "", label: "", debit: "", credit: "" });
      viewEntry();
    });
  });
  document.getElementById("add-line").addEventListener("click", () => {
    draftLines.push({ account: "", label: "", debit: "", credit: "" });
    viewEntry();
  });
  document.getElementById("post-entry").addEventListener("click", () => {
    const entry = {
      date: document.getElementById("e-date").value,
      journal: document.getElementById("e-journal").value,
      reference: document.getElementById("e-ref").value,
      lines: draftLines.map((l) => ({ account: l.account, label: l.label, third: l.third, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
    };
    const res = postEntry(store, entry);
    if (!res.ok) {
      document.getElementById("entry-errors").innerHTML = `<ul class="errors">${res.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
      toast("Écriture refusée : corrigez les erreurs.");
      return;
    }
    saveStore(store);
    toast(`✓ Écriture #${res.entry.id} enregistrée.`);
    resetDraft();
    router.go("entries");
  });
  document.getElementById("ai-suggest-btn").addEventListener("click", aiSuggestModal);
}

function updateEntryTotals() {
  const lines = getDraftLines();
  const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const diff = Math.round((debit - credit) * 100) / 100;
  const balanced = Math.abs(diff) < 0.001 && debit > 0;
  const debitEl = document.getElementById("tot-debit");
  const creditEl = document.getElementById("tot-credit");
  const statusEl = document.querySelectorAll("#app .kpi .value")[2];
  if (debitEl) debitEl.textContent = money(debit);
  if (creditEl) creditEl.textContent = money(credit);
  if (statusEl) {
    statusEl.textContent = balanced ? "✓" : money(diff);
    statusEl.style.color = balanced ? "var(--ok)" : "var(--danger)";
    const label = statusEl.nextElementSibling;
    if (label) label.textContent = balanced ? "Équilibrée" : "Écart";
  }
}

function aiSuggestModal() {
  if (!aiConfigured(store)) {
    const local = prompt("Aucune clé IA configurée.\nAssistant local : décrivez l'opération (ex. « achat matériel 50000 en espèces ») :");
    if (!local) return;
    const e = parseEntryFromTextLocal(store, local);
    if (!e) { toast("Opération non comprise par l'assistant local."); return; }
    loadDraftFromSuggestion(e, "(assistant local — vérifiez les comptes)");
    return;
  }
  openModal(`
    <h2>🤖 Saisie intelligente</h2>
    <p class="muted">Décrivez l'opération en langage naturel, ou joignez la photo d'une facture/reçu : l'IA proposera une écriture à vérifier avant validation.</p>
    <textarea id="ai-text" rows="4" placeholder="Ex. : Achat de fournitures de bureau 35 000 FCFA payé en espèces, TVA 18%"></textarea>
    <div class="row">
      <div class="nogrow"><button class="secondary" id="ai-photo-btn">📷 Joindre une photo</button></div>
      <input type="file" id="ai-photo-file" accept="image/*" class="hidden">
      <span class="muted" id="ai-photo-name">Aucune photo (optionnel)</span>
    </div>
    <div class="actions"><button id="ai-go">Proposer l'écriture</button><button class="secondary" data-close>Annuler</button></div>
    <div id="ai-result" style="margin-top:10px"></div>
  `);
  let photoData = null;
  document.getElementById("ai-photo-btn").addEventListener("click", () => document.getElementById("ai-photo-file").click());
  document.getElementById("ai-photo-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photoData = await imageFileToDataUrl(file);
      document.getElementById("ai-photo-name").textContent = "✓ " + file.name;
    } catch (err) { toast(err.message); }
  });
  document.getElementById("ai-go").addEventListener("click", async () => {
    const text = document.getElementById("ai-text").value.trim();
    if (!text && !photoData) return;
    if (photoData && !aiConfigured(store)) { toast("La lecture de photo nécessite une clé IA (Paramètres)."); return; }
    const out = document.getElementById("ai-result");
    out.innerHTML = `<p class="muted">⏳ Interrogation de l'IA…</p>`;
    try {
      const suggestion = await suggestEntry(store, text || "Lis ce justificatif et propose l'écriture.", photoData);
      out.innerHTML = `<p class="ok-msg">✓ Proposition reçue. Fermez cette fenêtre pour la charger dans le formulaire.</p>
        <div class="actions"><button id="ai-load">Charger dans le formulaire</button></div>`;
      document.getElementById("ai-load").addEventListener("click", () => {
        closeModal();
        loadDraftFromSuggestion(suggestion, "Proposée par l'IA — à vérifier");
      });
    } catch (err) {
      out.innerHTML = `<p class="errors">${esc(err.message)}</p>`;
    }
  });
}

function loadDraftFromSuggestion(s, note) {
  setDraftLines((s.lines || []).map((l) => ({ account: String(l.account || ""), label: l.label || "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", third: l.third || "" })));
  while (getDraftLines().length < 2) getDraftLines().push({ account: "", label: "", debit: "", credit: "", third: "" });
  setDraftHeader({ date: s.date || new Date().toISOString().slice(0, 10), journal: s.journal || "ACH", reference: s.reference || "" });
  router.go("entry");
  toast(note);
}

export function viewEntries() {
  const rows = [...store.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  $app.innerHTML = `
    <h1>Écritures (${rows.length})</h1>
    <div class="card table-wrap">
      ${rows.length === 0 ? `<p class="muted">Aucune écriture. <button class="small" data-act="demo">Charger la démo</button></p>` : `
      <table>
        <thead><tr><th>#</th><th>Date</th><th>Journal</th><th>Référence</th><th>Détail</th><th class="num">Débit</th><th class="num">Crédit</th><th></th></tr></thead>
        <tbody>
          ${rows.map((e) => {
            const t = e.lines.reduce((a, l) => ({ d: a.d + (Number(l.debit) || 0), c: a.c + (Number(l.credit) || 0) }), { d: 0, c: 0 });
            return `<tr>
              <td>${e.id}${e.reverseOf ? ' <span class="tag amber">contrepassation</span>' : e.reversed ? ' <span class="tag amber">contrepassée</span>' : ""}</td>
              <td>${esc(e.date)}</td><td>${esc(e.journal)}</td><td>${esc(e.reference)}</td>
              <td class="muted">${esc(e.lines.map((l) => l.account + " " + (l.label || "")).join(" · ").slice(0, 80))}</td>
              <td class="num">${money(t.d)}</td><td class="num">${money(t.c)}</td>
              <td><button class="secondary small" data-invoice="${e.id}" title="Facture / pièce à imprimer">🧾</button> <button class="secondary small" data-accounting-documents="${e.id}" title="Pièces justificatives">📎 Pièces</button> <button class="danger small" data-reverse="${e.id}" ${e.reversed || e.reverseOf ? "disabled" : ""}>${e.reversed ? "Déjà contrepassée" : e.reverseOf ? "Contrepassation" : "Contrepasser"}</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`}
    </div>
    <div class="actions">
      <button class="secondary" id="export-entries">⬇ Exporter CSV</button>
      <button class="secondary" id="xls-entries">⬇ Excel</button>
      <button class="secondary" id="print-entries">🖨 Imprimer le journal</button>
    </div>
  `;
  $app.querySelectorAll("[data-accounting-documents]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entryId=Number(button.dataset.accountingDocuments),entry=store.entries.find(item=>Number(item.id)===entryId);
      if(!entry)return;
      let localDocuments=[],cloudDocuments=[],warning="";
      try{localDocuments=await listLocalAccountingDocuments(entryId);}catch(error){warning="Lecture locale indisponible : "+(error?.message||"erreur")+". ";}
      try{cloudDocuments=await listCloudAccountingDocumentsForEntry(entryId)||[];}catch(error){warning+="Coffre partagé : "+(error?.message||"indisponible")+". ";}
      const rows=[...cloudDocuments.map(doc=>({...doc,kind:"cloud"})),...localDocuments.map(doc=>({...doc,kind:"local"}))];
      openModal('<h2>Pièces justificatives — écriture #'+entryId+'</h2>'+(warning?'<p class="warn">'+esc(warning)+'</p>':'')+
       (rows.length?'<div class="table-wrap"><table><thead><tr><th>Fichier</th><th>Stockage</th><th>Taille</th><th>Ajouté le</th><th>Actions</th></tr></thead><tbody>'+
       rows.map(doc=>'<tr><td>'+esc(doc.fileName)+'</td><td>'+(doc.kind==="cloud"?'Coffre privé entreprise':'Cet appareil uniquement')+'</td><td>'+(Number(doc.size)/1024/1024).toFixed(2)+' Mo</td><td>'+esc(String(doc.uploadedAt||"").slice(0,10)||"—")+'</td><td><button class="small secondary" data-accounting-doc-download="'+esc(doc.id)+'" data-kind="'+doc.kind+'">Télécharger</button> <button class="small danger" data-accounting-doc-delete="'+esc(doc.id)+'" data-kind="'+doc.kind+'">Supprimer</button></td></tr>').join("")+
       '</tbody></table></div>':'<p class="muted">Aucune pièce justificative associée à cette écriture.</p>')+'<div class="actions"><button class="secondary" data-close>Fermer</button></div>');
      document.querySelectorAll("[data-accounting-doc-download]").forEach(action=>action.addEventListener("click",async()=>{
       try{const result=action.dataset.kind==="cloud"?await downloadCloudAccountingDocument(action.dataset.accountingDocDownload):await getLocalAccountingDocument(action.dataset.accountingDocDownload);if(!result?.blob)throw new Error("Fichier introuvable.");downloadBlob(result.blob,result.fileName||"justificatif");}
       catch(error){toast(error?.message||"Téléchargement impossible.");}
      }));
      document.querySelectorAll("[data-accounting-doc-delete]").forEach(action=>action.addEventListener("click",async()=>{
       try{const id=action.dataset.accountingDocDelete;if(action.dataset.kind==="cloud")await deleteCloudAccountingDocument(id);else await deleteLocalAccountingDocument(id);toast("Pièce justificative supprimée.");closeModal();button.click();}
       catch(error){toast(error?.message||"Suppression impossible.");}
      }));
    });
  });
  $app.querySelectorAll("[data-reverse]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = Number(b.dataset.reverse);
      const defaultDate = new Date().toISOString().slice(0, 10);
      const date = prompt("Date de la contrepassation (AAAA-MM-JJ) :", defaultDate);
      if (date === null) return;
      const res = reverseEntry(store, id, date.trim());
      if (res.ok) { saveStore(store); toast("✓ Écriture contrepassée."); router.render(); }
      else toast(res.errors.join(" "));
    });
  });
  $app.querySelectorAll("[data-invoice]").forEach((b) => {
    b.addEventListener("click", () => {
      const entry = store.entries.find((e) => e.id === Number(b.dataset.invoice));
      if (!entry) return;
      openModal(`
        <h2>Aperçu — ${entry.lines.some((l) => (Number(l.credit) || 0) > 0 && String(l.account).startsWith("7")) ? "facture" : "pièce comptable"} #${entry.id}</h2>
        ${invoiceHTML(store, entry)}
        <div class="actions"><button id="inv-print">🖨 Imprimer</button><button class="secondary" data-close>Fermer</button></div>
      `);
      document.getElementById("inv-print").addEventListener("click", () =>
        printHTML(`${entry.reference || "Pièce #" + entry.id} — ${store.settings.companyName}`, invoiceHTML(store, entry)));
    });
  });
  const pj = document.getElementById("print-entries");
  if (pj) pj.addEventListener("click", () => {
    const card = $app.querySelector(".card.table-wrap");
    if (!card) return toast("Aucune écriture à imprimer.");
    printHTML(`Journal des écritures — ${store.settings.companyName}`, card.innerHTML);
  });
  const ex = document.getElementById("export-entries");
  if (ex) ex.addEventListener("click", () => {
    const rowsCSV = store.entries.flatMap((e) => e.lines.map((l) => ({
      id: e.id, date: e.date, journal: e.journal, reference: e.reference,
      compte: l.account, libelle: l.label, tiers: l.third, debit: l.debit, credit: l.credit,
    })));
    downloadBlob(new Blob(["\ufeff" + toCSV(rowsCSV)], { type: "text/csv;charset=utf-8" }), "mizane-ecritures.csv");
  });
  const xl = document.getElementById("xls-entries");
  if (xl) xl.addEventListener("click", () => {
    const table = $app.querySelector(".card.table-wrap table");
    if (!table) return toast("Aucune écriture à exporter.");
    exportXLS(`Journal des écritures — ${store.settings.companyName}`, table.outerHTML, "mizane-ecritures.xls");
  });
}

export function viewLedger() {
  const { exerciceStart, exerciceEnd } = store.settings;
  $app.innerHTML = `
    <h1>Grand livre</h1>
    <div class="card">
      <div class="row">
        <div><label>Compte</label><input id="gl-account" list="gl-accounts" placeholder="Ex. 411" value=""></div>
        <datalist id="gl-accounts">${planAccounts.map((a) => `<option value="${a.code}">${esc(a.label)}</option>`).join("")}</datalist>
        <div><label>Du</label><input type="date" id="gl-start" value="${exerciceStart}"></div>
        <div><label>Au</label><input type="date" id="gl-end" value="${exerciceEnd}"></div>
        <div class="nogrow"><button id="gl-run">Afficher</button></div>
        <div class="nogrow"><button class="secondary" id="gl-csv">⬇ CSV</button></div>
        <div class="nogrow"><button class="secondary" id="gl-print">🖨 Imprimer</button></div>
      </div>
      <div id="gl-result"></div>
    </div>
  `;
  const run = () => {
    const code = document.getElementById("gl-account").value.trim();
    const start = document.getElementById("gl-start").value;
    const end = document.getElementById("gl-end").value;
    const box = document.getElementById("gl-result");
    if (!code) { box.innerHTML = `<p class="muted">Saisissez un numéro de compte.</p>`; return; }
    const { rows, totals } = ledger(store, code, start, end);
    if (!rows.length) { box.innerHTML = `<p class="muted">Aucun mouvement pour ce compte sur la période.</p>`; return; }
    box.innerHTML = `
      <h2>${esc(code)} — ${esc(accountType(store, code) ? planLabel(code) : "Compte inconnu")}</h2>
      <table>
        <thead><tr><th>Date</th><th>Journal</th><th>Réf.</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.journal)}</td><td>${esc(r.reference)}</td><td>${esc(r.label)}</td><td class="num">${r.debit ? money(r.debit) : ""}</td><td class="num">${r.credit ? money(r.credit) : ""}</td></tr>`).join("")}
        <tr class="total"><td colspan="4">Totaux — Solde : ${money(totals.solde)}</td><td class="num">${money(totals.debit)}</td><td class="num">${money(totals.credit)}</td></tr></tbody>
      </table>`;
    box.dataset.code = code;
  };
  document.getElementById("gl-run").addEventListener("click", run);
  document.getElementById("gl-print").addEventListener("click", () => {
    const box = document.getElementById("gl-result");
    const code = document.getElementById("gl-account").value.trim();
    if (!code || !box.innerHTML.trim()) return toast("Affichez d'abord un compte.");
    printHTML(`Grand livre ${code} — ${store.settings.companyName}`, box.innerHTML);
  });
  document.getElementById("gl-csv").addEventListener("click", () => {
    const code = document.getElementById("gl-account").value.trim();
    if (!code) return toast("Saisissez d'abord un compte.");
    const { rows } = ledger(store, code, document.getElementById("gl-start").value, document.getElementById("gl-end").value);
    downloadBlob(new Blob(["\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" }), `mizane-grandlivre-${code}.csv`);
  });
}
