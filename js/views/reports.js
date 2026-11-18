// MIZANE — Écrans : balance, résultat, bilan, tiers (avec impression).
import { trialBalance, incomeStatement, balanceSheet, toCSV } from "../accounting.js";
import { saveStore, downloadBlob, exportXLS } from "../db.js";
import { printHTML } from "../print.js";
import { store, $app, router, toast, esc, money } from "../state.js";
import { syncCloudIfReady } from "../cloud-sync.js";

export function viewBalance() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  const balanced = Math.abs(tb.totals.debit - tb.totals.credit) < 0.01;
  const table = `
    <p class="muted">Période : ${esc(exerciceStart)} → ${esc(exerciceEnd)}</p>
    <div class="grid cols-2">
      <div class="card kpi"><div class="value">${money(tb.totals.debit)}</div><div class="label">Total débit</div></div>
      <div class="card kpi"><div class="value">${money(tb.totals.credit)}</div><div class="label">Total crédit</div></div>
    </div>
    <p class="${balanced ? "ok-msg" : "errors"}">${balanced ? "✓ Balance équilibrée : total débit égal au total crédit." : "⚠ Balance déséquilibrée — Écart : " + money(Math.abs(tb.totals.debit - tb.totals.credit))}</p>
    <div class="row" style="margin:12px 0">
      <div style="flex:2;min-width:220px"><label for="bal-search">Rechercher un compte</label><input id="bal-search" placeholder="Numéro ou intitulé du compte"></div>
      <div class="nogrow"><button class="secondary" id="bal-reset">Réinitialiser</button></div>
    </div>
    ${tb.rows.length === 0 ? `<p class="muted">Aucune écriture sur cette période.</p>` : `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Total débit</th><th class="num">Total crédit</th><th class="num">Solde débiteur</th><th class="num">Solde créditeur</th></tr></thead>
        <tbody>
          ${tb.rows.map((r) => `<tr data-bal-row data-search="${esc((r.code + " " + r.label).toLocaleLowerCase("fr"))}"><td>${esc(r.code)}</td><td>${esc(r.label)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num">${r.soldeDebit ? money(r.soldeDebit) : ""}</td><td class="num">${r.soldeCredit ? money(r.soldeCredit) : ""}</td></tr>`).join("")}
          <tr class="total" id="bal-filtered-total"><td colspan="2">Totaux des comptes affichés</td><td class="num" id="bal-sum-debit"></td><td class="num" id="bal-sum-credit"></td><td class="num" id="bal-sum-sd"></td><td class="num" id="bal-sum-sc"></td></tr>
        </tbody>
      </table>
      <p id="bal-no-match" class="muted" hidden>Aucun compte ne correspond à cette recherche.</p>
      <p class="muted">Le contrôle d'équilibre ci-dessus porte toujours sur la balance complète, même lorsque la recherche masque certains comptes.</p>
    </div>`}
  `;
  $app.innerHTML = `
    <h1>Balance générale</h1>
    <div class="card table-wrap">${table}
      <div class="actions">
        <button class="secondary" id="bal-print">🖨 Imprimer</button>
        <button class="secondary" id="bal-csv">⬇ Exporter CSV</button>
        <button class="secondary" id="bal-xls">⬇ Excel</button>
      </div>
    </div>
  `;
  const normalize = (value) => String(value || "").toLocaleLowerCase("fr").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim();
  const filteredRows = () => {
    const query = normalize(document.getElementById("bal-search")?.value);
    return tb.rows.filter((row) => !query || normalize(row.code + " " + row.label).includes(query));
  };
  const applySearch = () => {
    const query = normalize(document.getElementById("bal-search")?.value);
    let debit = 0, credit = 0, soldeDebit = 0, soldeCredit = 0, count = 0;
    $app.querySelectorAll("[data-bal-row]").forEach((row) => {
      const show = !query || normalize(row.dataset.search).includes(query);
      row.hidden = !show;
      if (!show) return;
      count++;
      const data = tb.rows.find((item) => item.code === row.cells[0].textContent);
      if (!data) return;
      debit += data.debit; credit += data.credit; soldeDebit += data.soldeDebit; soldeCredit += data.soldeCredit;
    });
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = money(value); };
    set("bal-sum-debit", debit); set("bal-sum-credit", credit); set("bal-sum-sd", soldeDebit); set("bal-sum-sc", soldeCredit);
    const total = document.getElementById("bal-filtered-total");
    if (total) total.hidden = count === 0;
    const empty = document.getElementById("bal-no-match");
    if (empty) empty.hidden = count !== 0;
  };
  document.getElementById("bal-search")?.addEventListener("input", applySearch);
  document.getElementById("bal-reset")?.addEventListener("click", () => {
    const input = document.getElementById("bal-search");
    if (input) input.value = "";
    applySearch();
  });
  applySearch();
  document.getElementById("bal-print").addEventListener("click", () => {
    const printable = $app.querySelector(".card.table-wrap").innerHTML;
    printHTML(`Balance générale — ${store.settings.companyName} (${exerciceStart} → ${exerciceEnd})`, printable);
  });
  document.getElementById("bal-csv").addEventListener("click", () => {
    const rows = filteredRows();
    if (!rows.length) return toast("Aucun compte à exporter.");
    downloadBlob(new Blob(["\\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" }), "mizane-balance.csv");
  });
  document.getElementById("bal-xls").addEventListener("click", () => {
    const rows = filteredRows();
    if (!rows.length) return toast("Aucun compte à exporter.");
    const card = $app.querySelector(".card.table-wrap table");
    if (!card) return toast("Aucune donnée à exporter.");
    const clone = card.cloneNode(true);
    clone.querySelectorAll("[data-bal-row]").forEach((row) => {
      const query = normalize(document.getElementById("bal-search")?.value);
      if (query && !normalize(row.dataset.search).includes(query)) row.remove();
    });
    exportXLS(`Balance générale — ${store.settings.companyName}`, clone.outerHTML, "mizane-balance.xls");
  });
}
export function viewIncome() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const is = incomeStatement(store, exerciceStart, exerciceEnd);
  const body = `
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
    </div>`;
  $app.innerHTML = `
    <h1>Compte de résultat</h1>
    <div class="actions" style="margin-bottom:10px"><button class="secondary" id="inc-print">🖨 Imprimer</button></div>
    ${body}`;
  document.getElementById("inc-print").addEventListener("click", () =>
    printHTML(`Compte de résultat — ${store.settings.companyName} (${exerciceStart} → ${exerciceEnd})`, body));
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
  const body = `
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
    </div>`;
  $app.innerHTML = `
    <h1>Bilan</h1>
    <div class="actions" style="margin-bottom:10px"><button class="secondary" id="sheet-print">🖨 Imprimer</button></div>
    ${body}`;
  document.getElementById("sheet-print").addEventListener("click", () =>
    printHTML(`Bilan — ${store.settings.companyName} au ${exerciceEnd}`, body));
}

async function syncThirdsChange(action) {
  try {
    const result = await syncCloudIfReady();
    if (result.skipped) {
      toast(`Tiers ${action} localement. Effectuez la première synchronisation depuis l’espace SaaS pour activer le cloud.`, 5500);
      return;
    }
    toast(`✓ Tiers ${action} et synchronisé avec le cloud.`);
  } catch (error) {
    toast(`Tiers ${action} localement, mais synchronisation cloud impossible : ${error?.message || "erreur inconnue"}`, 6000);
  }
}

export function viewThirds() {
  const rows = store.thirds.map((t) => {
    let solde = 0;
    for (const e of store.entries) for (const l of e.lines) if (l.third === t.name) solde += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    return { t, solde };
  });
  const table = store.thirds.length === 0 ? `<p class="muted">Aucun tiers enregistré.</p>` : `
    <table><thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th class="num">Solde</th><th>Actions</th></tr></thead>
    <tbody>${rows.map(({ t, solde }, i) => `<tr><td>${esc(t.name)}</td><td><span class="tag">${esc(t.type)}</span></td><td>${esc(t.phone || "")}</td><td>${esc(t.email || "")}</td><td class="num">${money(solde)}</td>
    <td><button class="danger small" data-del-third="${i}" aria-label="Supprimer le tiers ${esc(t.name)}">Supprimer</button></td></tr>`).join("")}</tbody></table>`;
  $app.innerHTML = `
    <h1>Tiers (clients & fournisseurs)</h1>
    <div class="card">
      <div class="row">
        <div><label>Nom</label><input id="t-name" placeholder="Nom du tiers"></div>
        <div><label>Type</label><select id="t-type"><option value="client">Client</option><option value="fournisseur">Fournisseur</option><option value="autre">Autre</option></select></div>
        <div><label>Téléphone</label><input id="t-phone"></div>
        <div><label>Email</label><input id="t-email"></div>
        <div class="nogrow"><button id="t-add">Ajouter le tiers</button></div>
      </div>
    </div>
    <div class="card table-wrap">${table}
      ${store.thirds.length ? `<div class="actions"><button class="secondary" id="t-print">🖨 Imprimer</button></div>` : ""}
    </div>
  `;
  document.getElementById("t-add").addEventListener("click", async () => {
    const name = document.getElementById("t-name").value.trim();
    if (!name) return toast("Le nom est obligatoire.");
    store.thirds.push({ name, type: document.getElementById("t-type").value, phone: document.getElementById("t-phone").value, email: document.getElementById("t-email").value });
    saveStore(store);
    await syncThirdsChange("ajouté");
    router.render();
  });
  $app.querySelectorAll("[data-del-third]").forEach((b) => {
    b.addEventListener("click", async () => {
      const index = Number(b.dataset.delThird);
      const third = store.thirds[index];
      if (!third) return;
      const usedInEntries = (store.entries || []).some((entry) =>
        (entry.lines || []).some((line) => String(line.third || "").trim() === String(third.name || "").trim())
      );
      if (usedInEntries) {
        return toast("Suppression impossible : ce tiers est déjà utilisé dans une ou plusieurs écritures comptables.");
      }
      if (!window.confirm(`Confirmer la suppression du tiers « ${third.name} » ?`)) return;
      store.thirds.splice(index, 1);
      saveStore(store);
      await syncThirdsChange("supprimé");
      router.render();
    });
  });
  document.getElementById("t-print")?.addEventListener("click", () =>
    printHTML(`Tiers — ${store.settings.companyName}`, table));
}
