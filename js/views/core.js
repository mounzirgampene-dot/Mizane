// MIZANE — Écrans : tableau de bord, saisie, écritures, grand livre.
import { JOURNALS, postEntry, reverseEntry, trialBalance, ledger, incomeStatement, checkAnomalies, cashBalance, toCSV, accountType } from "../accounting.js";
import { aiConfigured, suggestEntry, parseEntryFromTextLocal, imageFileToDataUrl } from "../ai.js";
import { printHTML, invoiceHTML } from "../print.js";
import { saveStore, downloadBlob, exportXLS } from "../db.js";
import {
  store, planAccounts, $app, router, toast, esc, money, planLabel,
  getDraftLines, setDraftLines, openModal, closeModal,
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
        <div><label>Date</label><input type="date" id="e-date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label>Journal</label>
          <select id="e-journal">${JOURNALS.map((j) => `<option value="${j.id}">${j.id} — ${esc(j.name)}</option>`).join("")}</select>
        </div>
        <div><label>Pièce / référence</label><input id="e-ref" placeholder="FCT-001, TCK-014…"></div>
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
      if (inp.dataset.f === "debit" || inp.dataset.f === "credit") viewEntry();
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
    setDraftLines([{ account: "", label: "", debit: "", credit: "" }, { account: "", label: "", debit: "", credit: "" }]);
    router.go("entries");
  });
  document.getElementById("ai-suggest-btn").addEventListener("click", aiSuggestModal);
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
  while (getDraftLines().length < 2) getDraftLines().push({ account: "", label: "", debit: "", credit: "" });
  router.go("entry");
  setTimeout(() => {
    if (s.date) document.getElementById("e-date").value = s.date;
    if (s.journal) document.getElementById("e-journal").value = s.journal;
    if (s.reference) document.getElementById("e-ref").value = s.reference;
  }, 0);
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
              <td>${e.id}${e.reverseOf ? ' <span class="tag amber">contrepassation</span>' : ""}</td>
              <td>${esc(e.date)}</td><td>${esc(e.journal)}</td><td>${esc(e.reference)}</td>
              <td class="muted">${esc(e.lines.map((l) => l.account + " " + (l.label || "")).join(" · ").slice(0, 80))}</td>
              <td class="num">${money(t.d)}</td><td class="num">${money(t.c)}</td>
              <td><button class="secondary small" data-invoice="${e.id}" title="Facture / pièce à imprimer">🧾</button> <button class="danger small" data-reverse="${e.id}">Contrepasser</button></td>
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
  $app.querySelectorAll("[data-reverse]").forEach((b) => {
    b.addEventListener("click", () => {
      const res = reverseEntry(store, Number(b.dataset.reverse));
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
