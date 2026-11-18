// MIZANE — Écrans : tableau de bord, saisie, écritures, grand livre.
import { JOURNALS, postEntry, reverseEntry, trialBalance, ledger, incomeStatement, checkAnomalies, cashBalance, toCSV, accountType, validDate } from "../accounting.js";
import { aiConfigured, suggestEntry, parseEntryFromTextLocal, imageFileToDataUrl } from "../ai.js";
import { printHTML, invoiceHTML } from "../print.js";
import { saveStore, downloadBlob, exportXLS } from "../db.js";
import { attachAccountAutocomplete } from "../account-autocomplete.js";
import {
  store, planAccounts, $app, router, toast, esc, money, planLabel,
  getDraftLines, setDraftLines, getDraftHeader, setDraftHeader, resetDraft, openModal, closeModal,
} from "../state.js";

export function viewDashboard() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const is = incomeStatement(store, exerciceStart, exerciceEnd);
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  const anomalies = checkAnomalies(store);
  const cash = cashBalance(store, exerciceStart, exerciceEnd);
  const balanced = tb.totals.debit === tb.totals.credit;
  $app.innerHTML = `
    <h1>Tableau de bord</h1>
    <div class="grid cols-3">
      <div class="card kpi"><div class="value">${money(is.totProduits)}</div><div class="label">Produits (exercice)</div></div>
      <div class="card kpi"><div class="value">${money(is.totCharges)}</div><div class="label">Charges (exercice)</div></div>
      <div class="card kpi"><div class="value">${money(is.resultat)}</div><div class="label">Résultat (${is.resultat >= 0 ? "bénéfice" : "perte"})</div></div>
      <div class="card kpi"><div class="value">${money(cash)}</div><div class="label">Trésorerie (classe 5)</div></div>
      <div class="card kpi"><div class="value">${store.entries.length}</div><div class="label">Écritures</div></div>
      <div class="card kpi"><div class="value">${anomalies.length === 0 ? "✓" : anomalies.length}</div><div class="label">${anomalies.length === 0 ? "Aucune anomalie" : "Anomalies détectées"}</div></div>
    </div>
    <div class="card">
      <h2>État de la comptabilité</h2>
      <p class="${balanced ? "ok-msg" : "errors"}">${balanced ? "✓ Balance équilibrée" : "⚠ Balance déséquilibrée : " + money(tb.totals.debit) + " / " + money(tb.totals.credit)}</p>
      <p class="muted">Exercice du ${esc(exerciceStart)} au ${esc(exerciceEnd)} — Plan ${esc(store.settings.plan)}</p>
      <div class="actions">
        <button class="secondary" data-act="go-entry">➕ Nouvelle écriture</button>
        <button class="secondary" data-act="go-assistant">🤖 Ouvrir l'assistant IA</button>
        ${store.entries.length === 0 ? `<button data-act="demo">Charger des données de démonstration</button>` : ""}
      </div>
    </div>
    ${anomalies.length ? `<div class="card"><h2>Anomalies</h2><ul class="errors">${anomalies.slice(0, 8).map((a) => `<li>${esc(a.message)}</li>`).join("")}</ul></div>` : ""}
  `;
}

function lineRowHTML(l, i) {
  return `
    <tr>
      <td style="min-width:160px"><input data-i="${i}" data-f="account" value="${esc(l.account)}" placeholder="N° ou nom du compte" autocomplete="off"></td>
      <td style="min-width:180px"><input data-i="${i}" data-f="label" value="${esc(l.label)}" placeholder="Ex. achat de fournitures"></td>
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
    <div class="card">
      <div class="row">
        <div><label for="e-date">Date</label>
          <div class="row" style="gap:6px">
            <input type="text" id="e-date" value="${esc(formatEntryDate(currentHeader.date, "DMY"))}" placeholder="JJ/MM/AAAA" inputmode="numeric" autocomplete="off" style="flex:1;min-width:125px">
            <select id="e-date-format" aria-label="Format de date" style="max-width:145px">
              <option value="DMY" selected>JJ/MM/AAAA</option>
              <option value="YMD">AAAA-MM-JJ</option>
            </select>
          </div>
        </div>
        <div><label>Journal</label>
          <select id="e-journal">${JOURNALS.map((j) => `<option value="${j.id}" ${currentHeader.journal === j.id ? "selected" : ""}>${j.id} — ${esc(j.name)}</option>`).join("")}</select>
        </div>
        <div><label>Pièce / référence</label><input id="e-ref" value="${esc(currentHeader.reference)}" placeholder="FCT-001, TCK-014…"></div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead><tr><th>Compte (numéro ou nom)</th><th>Libellé de l’opération</th><th class="num">Débit</th><th class="num">Crédit</th><th>Tiers</th><th></th></tr></thead>
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

  const searchableAccounts = [...planAccounts, ...(store.settings.customAccounts || [])]
    .filter((account, index, all) => all.findIndex((item) => String(item.code) === String(account.code)) === index);
  $app.querySelectorAll("[data-i]").forEach((inp) => {
    const lineIndex = Number(inp.dataset.i);
    inp.addEventListener("input", () => {
      draftLines[lineIndex][inp.dataset.f] = inp.value;
      if (inp.dataset.f === "debit" || inp.dataset.f === "credit") updateEntryTotals();
    });
    if (inp.dataset.f === "account" || inp.dataset.f === "label") {
      const isDescription = inp.dataset.f === "label";
      attachAccountAutocomplete(inp, searchableAccounts, (account) => {
        draftLines[lineIndex].account = String(account.code);
        const accountInput = $app.querySelector(`[data-i="${lineIndex}"][data-f="account"]`);
        const labelInput = $app.querySelector(`[data-i="${lineIndex}"][data-f="label"]`);
        if (accountInput) accountInput.value = account.code;
        // Le libellé de l'opération reste intact : seule la référence du compte est choisie.
        if (labelInput) labelInput.value = draftLines[lineIndex].label;
      }, isDescription ? "label" : "code", isDescription ? "description" : "account");
    }
  });
  const dateInput = document.getElementById("e-date");
  const dateFormat = document.getElementById("e-date-format");
  const readEntryDate = () => parseEntryDate(dateInput.value, dateFormat.value);
  const syncEntryDate = () => {
    const iso = readEntryDate();
    if (iso) setDraftHeader({ date: iso });
  };
  dateInput.addEventListener("input", syncEntryDate);
  dateInput.addEventListener("change", syncEntryDate);
  dateFormat.addEventListener("change", () => {
    const iso = parseEntryDate(dateInput.value, dateFormat.value === "DMY" ? "YMD" : "DMY");
    if (iso) dateInput.value = formatEntryDate(iso, dateFormat.value);
    dateInput.placeholder = dateFormat.value === "DMY" ? "JJ/MM/AAAA" : "AAAA-MM-JJ";
    syncEntryDate();
  });
  ["e-journal", "e-ref"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (e) => {
      setDraftHeader({ [id === "e-journal" ? "journal" : "reference"]: e.target.value });
    });
    document.getElementById(id).addEventListener("change", (e) => {
      setDraftHeader({ [id === "e-journal" ? "journal" : "reference"]: e.target.value });
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
    const entryDate = readEntryDate();
    if (!entryDate) {
      document.getElementById("entry-errors").innerHTML = '<ul class="errors"><li>Date invalide. Utilisez le format sélectionné et une date réelle.</li></ul>';
      toast("Date invalide : vérifiez le format et le calendrier.");
      return;
    }
    setDraftHeader({ date: entryDate });
    const entry = {
      date: entryDate,
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

function parseEntryDate(value, format) {
  const raw = String(value || "").trim();
  let match;
  if (format === "DMY") {
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "";
    const [, day, month, year] = match;
    const iso = `${year}-${month}-${day}`;
    return isRealEntryDate(iso) ? iso : "";
  }
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match && isRealEntryDate(raw) ? raw : "";
}

function isRealEntryDate(iso) {
  return validDate(iso);
}

function formatEntryDate(iso, format) {
  if (!isRealEntryDate(iso)) return "";
  const [year, month, day] = iso.split("-");
  return format === "DMY" ? `${day}/${month}/${year}` : iso;
}

export function viewEntries() {
  const rows = [...store.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  $app.innerHTML = `
    <h1>Écritures (<span id="entries-count">${rows.length}</span> / ${rows.length})</h1>
    <div class="card">
      <div class="row">
        <div style="flex:2;min-width:220px"><label for="entries-search">Rechercher</label><input id="entries-search" placeholder="Référence, libellé, compte, tiers…"></div>
        <div><label for="entries-journal">Journal</label><select id="entries-journal"><option value="">Tous les journaux</option>${JOURNALS.map((j) => `<option value="${esc(j.id)}">${esc(j.id)} — ${esc(j.name)}</option>`).join("")}</select></div>
        <div><label for="entries-start">Du</label><input type="date" id="entries-start"></div>
        <div><label for="entries-end">Au</label><input type="date" id="entries-end"></div>
        <div class="nogrow"><button class="secondary" id="entries-reset">Réinitialiser</button></div>
      </div>
    </div>
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
              <td><button class="secondary small" data-invoice="${e.id}" title="Facture / pièce à imprimer">🧾</button> <button class="danger small" data-reverse="${e.id}" ${e.reversed || e.reverseOf ? "disabled" : ""}>${e.reversed ? "Déjà contrepassée" : e.reverseOf ? "Contrepassation" : "Contrepasser"}</button></td>
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
  const applyEntryFilters = () => {
    const query = String(document.getElementById("entries-search")?.value || "").toLocaleLowerCase("fr").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim();
    const journal = document.getElementById("entries-journal")?.value || "";
    const start = document.getElementById("entries-start")?.value || "";
    const end = document.getElementById("entries-end")?.value || "";
    let visible = 0;
    $app.querySelectorAll(".card.table-wrap tbody tr").forEach((row) => {
      const date = row.cells[1]?.textContent.trim() || "";
      const rowJournal = row.cells[2]?.textContent.trim() || "";
      const text = row.textContent.toLocaleLowerCase("fr").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
      const show = (!query || text.includes(query)) && (!journal || rowJournal === journal) && (!start || date >= start) && (!end || date <= end);
      row.hidden = !show;
      if (show) visible++;
    });
    const count = document.getElementById("entries-count");
    if (count) count.textContent = String(visible);
  };
  ["entries-search", "entries-journal", "entries-start", "entries-end"].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener(id === "entries-search" ? "input" : "change", applyEntryFilters);
  });
  document.getElementById("entries-reset")?.addEventListener("click", () => {
    ["entries-search", "entries-journal", "entries-start", "entries-end"].forEach((id) => { const input = document.getElementById(id); if (input) input.value = ""; });
    applyEntryFilters();
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
        <div>
          <label for="gl-account">Compte</label>
          <input id="gl-account" placeholder="Tapez le numéro ou le nom du compte" autocomplete="off" aria-describedby="gl-account-help">
          <p id="gl-account-help" class="muted">Choisissez un compte dans les suggestions pour afficher immédiatement ses mouvements.</p>
          <div id="gl-account-selected" class="muted" aria-live="polite"></div>
        </div>
        <div><label for="gl-start">Du</label><input type="date" id="gl-start" value="${exerciceStart}"></div>
        <div><label for="gl-end">Au</label><input type="date" id="gl-end" value="${exerciceEnd}"></div>
        <div class="nogrow"><button id="gl-run">Afficher</button></div>
        <div class="nogrow"><button class="secondary" id="gl-csv">⬇ CSV</button></div>
        <div class="nogrow"><button class="secondary" id="gl-print">🖨 Imprimer</button></div>
      </div>
      <div id="gl-result" aria-live="polite"></div>
    </div>
  `;
  const ledgerAccounts = [...planAccounts, ...(store.settings.customAccounts || [])]
    .filter((account, index, all) => all.findIndex((item) => String(item.code) === String(account.code)) === index);
  const accountInput = document.getElementById("gl-account");
  const resultBox = document.getElementById("gl-result");
  const selectedLabel = document.getElementById("gl-account-selected");

  const run = () => {
    const code = accountInput.value.trim();
    const start = document.getElementById("gl-start").value;
    const end = document.getElementById("gl-end").value;
    if (!code) {
      resultBox.innerHTML = `<p class="muted">Choisissez un compte pour afficher son grand livre.</p>`;
      selectedLabel.textContent = "";
      return false;
    }
    const account = ledgerAccounts.find((item) => String(item.code) === code);
    if (!account) {
      resultBox.innerHTML = `<p class="warn">Compte introuvable dans le plan comptable actif. Choisissez un compte proposé dans la liste.</p>`;
      selectedLabel.textContent = "";
      return false;
    }
    selectedLabel.textContent = account.code + " — " + account.label;
    const { rows, totals } = ledger(store, code, start, end);
    if (!rows.length) {
      resultBox.innerHTML = `<p class="muted">Aucun mouvement pour ce compte sur la période sélectionnée.</p>`;
      return true;
    }
    resultBox.innerHTML = `
      <h2>${esc(account.code)} — ${esc(account.label)}</h2>
      <table>
        <thead><tr><th>Date</th><th>Journal</th><th>Réf.</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.journal)}</td><td>${esc(r.reference)}</td><td>${esc(r.label)}</td><td class="num">${r.debit ? money(r.debit) : ""}</td><td class="num">${r.credit ? money(r.credit) : ""}</td></tr>`).join("")}
        <tr class="total"><td colspan="4">Totaux — Solde : ${money(totals.solde)}</td><td class="num">${money(totals.debit)}</td><td class="num">${money(totals.credit)}</td></tr></tbody>
      </table>`;
    return true;
  };

  attachAccountAutocomplete(accountInput, ledgerAccounts, (account) => {
    accountInput.value = String(account.code);
    run();
  });
  document.getElementById("gl-run").addEventListener("click", run);
  accountInput.addEventListener("change", () => {
    if (ledgerAccounts.some((account) => String(account.code) === accountInput.value.trim())) run();
  });
  ["gl-start", "gl-end"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (ledgerAccounts.some((account) => String(account.code) === accountInput.value.trim())) run();
    });
  });
  accountInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.defaultPrevented) {
      event.preventDefault();
      run();
    }
  });
  document.getElementById("gl-print").addEventListener("click", () => {
    if (!resultBox.querySelector("table")) return toast("Affichez d'abord les mouvements d'un compte.");
    printHTML(`Grand livre ${accountInput.value.trim()} — ${store.settings.companyName}`, resultBox.innerHTML);
  });
  document.getElementById("gl-csv").addEventListener("click", () => {
    const code = accountInput.value.trim();
    if (!ledgerAccounts.some((account) => String(account.code) === code)) return toast("Sélectionnez d'abord un compte valide.");
    const { rows } = ledger(store, code, document.getElementById("gl-start").value, document.getElementById("gl-end").value);
    if (!rows.length) return toast("Aucun mouvement à exporter pour cette période.");
    downloadBlob(new Blob(["\\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" }), `mizane-grandlivre-${code}.csv`);
  });
}
