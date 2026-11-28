// MIZANE — Écrans : balance, résultat, bilan, tiers (avec impression).
import { trialBalance, incomeStatement, balanceSheet, toCSV } from "../accounting.js";
import { saveStore, downloadBlob, exportXLS } from "../db.js";
import { printHTML } from "../print.js";
import { store, $app, router, toast, esc, money } from "../state.js";
import { chartModeControls, bindChartMode, renderHorizontalBars } from "../charts.js";
import { periodControls, bindPeriodControls, previousYearRange, comparisonTable } from "../report-periods.js";

export function viewBalance(period = null) {
  const exerciceStart = period?.start || store.settings.exerciceStart;
  const exerciceEnd = period?.end || store.settings.exerciceEnd;
  const tb = trialBalance(store, exerciceStart, exerciceEnd);
  const priorRange = previousYearRange(exerciceStart, exerciceEnd);
  const prior = period?.compare === false ? null : trialBalance(store, priorRange.start, priorRange.end);
  const comparison = prior ? comparisonTable("Comparaison avec N-1", exerciceStart + " → " + exerciceEnd, priorRange.start + " → " + priorRange.end, [
    {label:"Total débit",current:tb.totals.debit,previous:prior.totals.debit},
    {label:"Total crédit",current:tb.totals.credit,previous:prior.totals.credit},
    {label:"Soldes débiteurs",current:tb.totals.soldeDebit,previous:prior.totals.soldeDebit},
    {label:"Soldes créditeurs",current:tb.totals.soldeCredit,previous:prior.totals.soldeCredit},
  ],money) : "";
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
  const chartRows = [...tb.rows].sort((a,b)=>(b.debit+b.credit)-(a.debit+a.credit)).slice(0,12).map(r=>({label:r.code+" — "+r.label,debit:r.debit,credit:r.credit}));
  const charts = renderHorizontalBars("Comptes les plus mouvementés",chartRows,[{key:"debit",label:"Débit"},{key:"credit",label:"Crédit"}],money);
  $app.innerHTML = `
    <h1>Balance générale</h1>
    ${periodControls("balance",exerciceStart,exerciceEnd,period?.compare !== false)}
    ${chartModeControls("balance")}
    ${comparison}
    <div id="balance-table-view"><div class="card table-wrap">${table}
      <div class="actions">
        <button class="secondary" id="bal-print">🖨 Imprimer</button>
        <button class="secondary" id="bal-csv">⬇ Exporter CSV</button>
        <button class="secondary" id="bal-xls">⬇ Excel</button>
      </div>
    </div></div>
    <div id="balance-chart-view" hidden>
      <div class="grid cols-3">
        <section class="card kpi"><div class="value">${money(tb.totals.debit)}</div><div class="label">Total débit</div></section>
        <section class="card kpi"><div class="value">${money(tb.totals.credit)}</div><div class="label">Total crédit</div></section>
        <section class="card kpi"><div class="value">${money(tb.totals.soldeDebit)}</div><div class="label">Soldes débiteurs</div></section>
      </div>
      ${charts}
    </div>
  `;
  bindChartMode("balance");
  bindPeriodControls("balance", viewBalance);
  document.getElementById("bal-print").addEventListener("click", () =>
    printHTML(`Balance générale — ${store.settings.companyName} (${exerciceStart} → ${exerciceEnd})`, table));
  document.getElementById("bal-csv").addEventListener("click", () => {
    downloadBlob(new Blob(["\ufeff" + toCSV(tb.rows)], { type: "text/csv;charset=utf-8" }), "mizane-balance.csv");
  });
  document.getElementById("bal-xls").addEventListener("click", () => {
    const card = $app.querySelector(".card.table-wrap table");
    if (!card) return toast("Aucune donnée à exporter.");
    exportXLS(`Balance générale — ${store.settings.companyName}`, card.outerHTML, "mizane-balance.xls");
  });
}

export function viewIncome(period = null) {
  const exerciceStart = period?.start || store.settings.exerciceStart;
  const exerciceEnd = period?.end || store.settings.exerciceEnd;
  const is = incomeStatement(store, exerciceStart, exerciceEnd);
  const priorRange = previousYearRange(exerciceStart, exerciceEnd);
  const prior = period?.compare === false ? null : incomeStatement(store, priorRange.start, priorRange.end);
  const comparison = prior ? comparisonTable("Comparaison avec N-1", exerciceStart + " → " + exerciceEnd, priorRange.start + " → " + priorRange.end, [
    {label:"Total charges",current:is.totCharges,previous:prior.totCharges},
    {label:"Total produits",current:is.totProduits,previous:prior.totProduits},
    {label:"Résultat",current:is.resultat,previous:prior.resultat},
  ],money) : "";
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
  const incomeRows = [
    ...is.charges.map(r=>({label:r.code+" — "+r.label,charges:r.solde,produits:0})),
    ...is.produits.map(r=>({label:r.code+" — "+r.label,charges:0,produits:r.solde})),
  ].sort((a,b)=>(b.charges+b.produits)-(a.charges+a.produits)).slice(0,14);
  const incomeCharts = renderHorizontalBars("Répartition des charges et des produits",incomeRows,[{key:"charges",label:"Charges"},{key:"produits",label:"Produits"}],money);
  $app.innerHTML = `
    <h1>Compte de résultat</h1>
    ${periodControls("income",exerciceStart,exerciceEnd,period?.compare !== false)}
    ${chartModeControls("income")}
    ${comparison}
    <div id="income-table-view">
      <div class="actions" style="margin-bottom:10px"><button class="secondary" id="inc-print">🖨 Imprimer</button></div>
      ${body}
    </div>
    <div id="income-chart-view" hidden>
      <div class="grid cols-3">
        <section class="card kpi"><div class="value">${money(is.totProduits)}</div><div class="label">Total produits</div></section>
        <section class="card kpi"><div class="value">${money(is.totCharges)}</div><div class="label">Total charges</div></section>
        <section class="card kpi"><div class="value" style="color:${is.resultat>=0?"var(--ok)":"var(--danger)"}">${money(is.resultat)}</div><div class="label">${is.resultat>=0?"Bénéfice":"Perte"}</div></section>
      </div>
      ${incomeCharts}
    </div>`;
  bindChartMode("income");
  bindPeriodControls("income", viewIncome);
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

export function viewSheet(period = null) {
  const exerciceStart = period?.start || store.settings.exerciceStart;
  const exerciceEnd = period?.end || store.settings.exerciceEnd;
  const b = balanceSheet(store, exerciceStart, exerciceEnd);
  const priorRange = previousYearRange(exerciceStart, exerciceEnd);
  const prior = period?.compare === false ? null : balanceSheet(store, priorRange.start, priorRange.end);
  const comparison = prior ? comparisonTable("Comparaison avec N-1", exerciceStart + " → " + exerciceEnd, priorRange.start + " → " + priorRange.end, [
    {label:"Total actif",current:b.totActif,previous:prior.totActif},
    {label:"Total passif",current:b.totPassif,previous:prior.totPassif},
    {label:"Résultat de l’exercice",current:b.resultat,previous:prior.resultat},
    {label:"Écart actif / passif",current:b.ecart,previous:prior.ecart},
  ],money) : "";
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
  const assetRows = [
    {label:"Immobilisations",amount:b.actif.immobilisations.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
    {label:"Stocks",amount:b.actif.stocks.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
    {label:"Créances",amount:b.actif.creances.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
    {label:"Trésorerie actif",amount:b.actif.tresorerie.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
  ];
  const liabilityRows = [
    {label:"Capitaux propres",amount:b.passif.capitaux.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
    {label:"Dettes",amount:b.passif.dettes.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
    {label:"Trésorerie passif",amount:b.passif.tresorerie.reduce((sum,r)=>sum+Math.max(0,r.solde),0)},
  ];
  const sheetCharts = renderHorizontalBars("Composition de l’actif",assetRows,[{key:"amount",label:"Actif"}],money)
    + renderHorizontalBars("Composition du passif",liabilityRows,[{key:"amount",label:"Passif"}],money);
  $app.innerHTML = `
    <h1>Bilan</h1>
    ${periodControls("sheet",exerciceStart,exerciceEnd,period?.compare !== false)}
    ${chartModeControls("sheet")}
    ${comparison}
    <div id="sheet-table-view">
      <div class="actions" style="margin-bottom:10px"><button class="secondary" id="sheet-print">🖨 Imprimer</button></div>
      ${body}
    </div>
    <div id="sheet-chart-view" hidden>
      <div class="grid cols-3">
        <section class="card kpi"><div class="value">${money(b.totActif)}</div><div class="label">Total actif</div></section>
        <section class="card kpi"><div class="value">${money(b.totPassif)}</div><div class="label">Total passif</div></section>
        <section class="card kpi"><div class="value" style="color:${Math.abs(b.ecart)<0.001?"var(--ok)":"var(--danger)"}">${money(b.ecart)}</div><div class="label">Écart actif / passif</div></section>
      </div>
      ${sheetCharts}
    </div>`;
  bindChartMode("sheet");
  bindPeriodControls("sheet", viewSheet);
  document.getElementById("sheet-print").addEventListener("click", () =>
    printHTML(`Bilan — ${store.settings.companyName} au ${exerciceEnd}`, body));
}

export function viewThirds(readOnly = false) {
  const rows = store.thirds.map((t) => {
    let solde = 0;
    for (const e of store.entries) for (const l of e.lines) if (l.third === t.name) solde += (Number(l.debit) || 0) - (Number(l.credit) || 0);
    return { t, solde };
  });
  const table = store.thirds.length === 0 ? `<p class="muted">Aucun tiers enregistré.</p>` : `
    <table><thead><tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>Email</th><th class="num">Solde</th>${readOnly ? "" : "<th></th>"}</tr></thead>
    <tbody>${rows.map(({ t, solde }, i) => `<tr><td>${esc(t.name)}</td><td><span class="tag">${esc(t.type)}</span></td><td>${esc(t.phone || "")}</td><td>${esc(t.email || "")}</td><td class="num">${money(solde)}</td>
    ${readOnly ? "" : `<td><button class="danger small" data-del-third="${i}">✕</button></td>`}</tr>`).join("")}</tbody></table>`;
  $app.innerHTML = `
    <h1>Tiers (clients & fournisseurs)</h1>
    ${readOnly ? `<p class="muted">Mode lecture seule : vous pouvez consulter les tiers, sans les ajouter, modifier ni supprimer.</p>` : `<div class="card">
      <div class="row">
        <div><label>Nom</label><input id="t-name" placeholder="Nom du tiers"></div>
        <div><label>Type</label><select id="t-type"><option value="client">Client</option><option value="fournisseur">Fournisseur</option><option value="autre">Autre</option></select></div>
        <div><label>Téléphone</label><input id="t-phone"></div>
        <div><label>Email</label><input id="t-email"></div>
        <div class="nogrow"><button id="t-add">Ajouter</button></div>
      </div>
    </div>`}
    <div class="card table-wrap">${table}
      ${store.thirds.length ? `<div class="actions"><button class="secondary" id="t-print">🖨 Imprimer</button></div>` : ""}
    </div>
  `;
  if (!readOnly) document.getElementById("t-add").addEventListener("click", () => {
    const name = document.getElementById("t-name").value.trim();
    if (!name) return toast("Le nom est obligatoire.");
    store.thirds.push({ name, type: document.getElementById("t-type").value, phone: document.getElementById("t-phone").value, email: document.getElementById("t-email").value });
    saveStore(store);
    toast("✓ Tiers ajouté.");
    router.render();
  });
  if (!readOnly) $app.querySelectorAll("[data-del-third]").forEach((b) => {
    b.addEventListener("click", () => {
      store.thirds.splice(Number(b.dataset.delThird), 1);
      saveStore(store);
      router.render();
    });
  });
  document.getElementById("t-print")?.addEventListener("click", () =>
    printHTML(`Tiers — ${store.settings.companyName}`, table));
}
