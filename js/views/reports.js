// MIZANE — Écrans : balance, résultat, bilan, tiers (avec impression).
import { trialBalance, incomeStatement, balanceSheet, toCSV } from "../accounting.js";
import { saveStore, downloadBlob } from "../db.js";
import { printHTML } from "../print.js";
import { store, $app, router, toast, esc, money } from "../state.js";

export function viewBalance() {
  const { exerciceStart, exerciceEnd } = store.settings;
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  const table = `
    <p class="muted">Période : ${esc(exerciceStart)} → ${esc(exerciceEnd)}</p>
    ${tb.rows.length === 0 ? `<p class="muted">Aucune écriture.</p>` : `
    <table>
      <thead><tr><th>Compte</th><th>Libellé</th><th class="num">Total débit</th><th class="num">Total crédit</th><th class="num">Solde débiteur</th><th class="num">Solde créditeur</th></tr></thead>
      <tbody>
        ${tb.rows.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.label)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num">${r.soldeDebit ? money(r.soldeDebit) : ""}</td><td class="num">${r.soldeCredit ? money(r.soldeCredit) : ""}</td></tr>`).join("")}
        <tr class="total"><td colspan="2">Totaux</td><td class="num">${money(tb.totals.debit)}</td><td class="num">${money(tb.totals.credit)}</td><td class="num">${money(tb.totals.soldeDebit)}</td><td class="num">${money(tb.totals.soldeCredit)}</td></tr>
      </tbody>
    </table>
    <p class="${tb.totals.debit === tb.totals.credit ? "ok-msg" : "errors"}">${tb.totals.debit === tb.totals.credit ? "✓ Balance équilibrée." : "⚠ Balance déséquilibrée !"}</p>`}`;
  $app.innerHTML = `
    <h1>Balance générale</h1>
    <div class="card table-wrap">${table}
      <div class="actions">
        <button class="secondary" id="bal-print">🖨 Imprimer</button>
        <button class="secondary" id="bal-csv">⬇ Exporter CSV</button>
      </div>
    </div>
  `;
  document.getElementById("bal-print").addEventListener("click", () =>
    printHTML(`Balance générale — ${store.settings.companyName} (${exerciceStart} → ${exerciceEnd})`, table));
  document.getElementById("bal-csv").addEventListener("click", () => {
    downloadBlob(new Blob(["\ufeff" + toCSV(tb.rows)], { type: "text/csv;charset=utf-8" }), "mizane-balance.csv");
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

export function viewThirds() {
  const rows = store.thirds.map((t) => {
    let solde = 0;
    for (const e of store.entries) for (const l of e.lines) if (l.third === t.name) solde += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    return { t, solde };
  });
  const table = store.thirds.length === 0 ? `<p class="muted">Aucun tiers enregistré.</p>` : `
    <table><thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th class="num">Solde</th><th></th></tr></thead>
    <tbody>${rows.map(({ t, solde }, i) => `<tr><td>${esc(t.name)}</td><td><span class="tag">${esc(t.type)}</span></td><td>${esc(t.phone || "")}</td><td>${esc(t.email || "")}</td><td class="num">${money(solde)}</td>
    <td><button class="danger small" data-del-third="${i}">✕</button></td></tr>`).join("")}</tbody></table>`;
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
    <div class="card table-wrap">${table}
      ${store.thirds.length ? `<div class="actions"><button class="secondary" id="t-print">🖨 Imprimer</button></div>` : ""}
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
  document.getElementById("t-print")?.addEventListener("click", () =>
    printHTML(`Tiers — ${store.settings.companyName}`, table));
}
