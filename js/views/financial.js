// MIZANE — Pilotage financier : échéances, soldes tiers et prévisions de trésorerie.
import { cashBalance } from "../accounting.js";
import { saveStore } from "../db.js";
import { store, $app, toast, esc, money } from "../state.js";
import { chartModeControls, bindChartMode, renderHorizontalBars } from "../charts.js";
import { buildFinancialForecast } from "../financial-forecast-core.js";
import { periodControls, bindPeriodControls, previousYearRange, comparisonTable } from "../report-periods.js";

const today = () => new Date().toISOString().slice(0, 10);
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dayDiff = (date, reference) => Math.floor((Date.parse(reference + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
const invoiceBalance = doc => {
  const paid = Array.isArray(doc.payments) && doc.payments.length ? doc.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) : Number(doc.paidAmount || 0);
  return Math.max(0, round(Number(doc.totals?.ttc || 0) - paid));
};

function receivables(start, end) {
  return (store.billing?.documents || []).filter(doc => {
    const date = doc.date || doc.dueDate || "";
    return doc.type === "invoice" && doc.status !== "cancelled" && invoiceBalance(doc) > 0 && (!start || date >= start) && (!end || date <= end);
  }).map(doc => ({
    number: doc.number || "Facture",
    customer: doc.customerName || "Client non renseigné",
    dueDate: doc.dueDate || doc.date || today(),
    amount: round(invoiceBalance(doc) * (Number(doc.exchangeRate) > 0 ? Number(doc.exchangeRate) : 1)),
    currency: doc.currency || store.settings.currency,
    originalAmount: invoiceBalance(doc),
    days: dayDiff(doc.dueDate || doc.date || today(), today()),
  }));
}

function customerBalances(items) {
  const totals = new Map();
  for (const item of items) totals.set(item.customer, (totals.get(item.customer) || 0) + item.amount);
  return [...totals.entries()].map(([name, amount]) => ({ name, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

function suppliers(start, end) {
  const totals = new Map();
  for (const entry of store.entries || []) {
    if (entry.date > today() || (start && entry.date < start) || (end && entry.date > end)) continue;
    for (const line of entry.lines || []) {
      if (!/^40/.test(String(line.account || "")) || !String(line.third || "").trim()) continue;
      const name = String(line.third).trim();
      const balance = (Number(line.credit) || 0) - (Number(line.debit) || 0);
      totals.set(name, (totals.get(name) || 0) + balance);
    }
  }
  return [...totals.entries()].map(([name, amount]) => ({ name, amount: round(amount) }))
    .filter(item => item.amount > 0.001).sort((a, b) => b.amount - a.amount);
}

function bucket(days) {
  if (days <= 0) return "À échéance / non échue";
  if (days <= 30) return "1 à 30 jours";
  if (days <= 60) return "31 à 60 jours";
  if (days <= 90) return "61 à 90 jours";
  return "Plus de 90 jours";
}

export function viewFinancial(period = null) {
  const exerciceStart = period?.start || store.settings.exerciceStart;
  const exerciceEnd = period?.end || store.settings.exerciceEnd;
  const docs = receivables(exerciceStart, exerciceEnd);
  const vendors = suppliers(exerciceStart, exerciceEnd);
  const priorRange = previousYearRange(exerciceStart, exerciceEnd);
  const priorDocs = period?.compare === false ? [] : receivables(priorRange.start, priorRange.end);
  const priorVendors = period?.compare === false ? [] : suppliers(priorRange.start, priorRange.end);
  const customers = customerBalances(docs);
  const manual = Array.isArray(store.settings.cashForecast) ? store.settings.cashForecast.filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) && String(item.label || "").trim() && Number(item.amount) > 0 && ["in", "out"].includes(item.direction)) : [];
  store.settings.cashForecast = manual;
  const outstanding = round(docs.reduce((sum, item) => sum + item.amount, 0));
  const payable = round(vendors.reduce((sum, item) => sum + item.amount, 0));
  const currentCash = cashBalance(store, "", today());
  const periodCashFlow = cashBalance(store, exerciceStart, exerciceEnd);
  const priorCashFlow = period?.compare === false ? 0 : cashBalance(store, priorRange.start, priorRange.end);
  const comparison = period?.compare === false ? "" : comparisonTable("Comparaison avec N-1", exerciceStart + " → " + exerciceEnd, priorRange.start + " → " + priorRange.end, [
    {label:"Flux net de trésorerie",current:periodCashFlow,previous:priorCashFlow},
    {label:"Créances ouvertes sur factures émises",current:outstanding,previous:round(priorDocs.reduce((sum,item)=>sum+item.amount,0))},
    {label:"Dettes fournisseurs estimées",current:payable,previous:round(priorVendors.reduce((sum,item)=>sum+item.amount,0))},
  ],money);
  const financialForecast = buildFinancialForecast({
    baseCurrency: store.settings.currency,
    openingCash: currentCash,
    receivables: docs.map(item => ({ id: item.number, number: item.number, customer: item.customer, dueDate: item.dueDate, currency: item.currency, originalAmount: item.originalAmount, baseAmount: item.amount })),
    manual,
    asOf: today(),
  });
  const forecast = financialForecast.events;
  const buckets = ["À échéance / non échue", "1 à 30 jours", "31 à 60 jours", "61 à 90 jours", "Plus de 90 jours"];
  const bucketRows = buckets.map(name => {
    const amount = round(docs.filter(item => bucket(item.days) === name).reduce((sum, item) => sum + item.amount, 0));
    return "<tr><td>" + esc(name) + "</td><td class=\"num\">" + money(amount) + "</td></tr>";
  }).join("");
  const forecastTotals = financialForecast.projections.map(item => ({ days: item.days, amount: item.amount }));
  const monthlyForecastRows = financialForecast.monthly.map(item =>
    "<tr><td>" + esc(item.month) + "</td><td class=\\"num\\">" + money(item.inflows) + "</td><td class=\\"num\\">" + money(item.outflows) + "</td><td class=\\"num\\">" + money(item.net) + "</td><td class=\\"num\\">" + money(item.closing) + "</td></tr>"
  ).join("");
  const receivableCurrencyRows = Object.entries(financialForecast.receivablesByCurrency).map(([currency, amount]) =>
    "<tr><td>" + esc(currency) + "</td><td class=\\"num\\">" + amount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) + " " + esc(currency) + "</td></tr>"
  ).join("");
  const agingChart = renderHorizontalBars("Ancienneté des créances",buckets.map(name=>({
    label:name,
    amount:round(docs.filter(item=>bucket(item.days)===name).reduce((sum,item)=>sum+item.amount,0)),
  })),[{key:"amount",label:"Créances"}],money);
  const customerChart = renderHorizontalBars("Principales créances clients",customers.slice(0,10).map(item=>({label:item.name,amount:item.amount})),[{key:"amount",label:"Montant"}],money);
  const forecastChart = renderHorizontalBars("Trésorerie projetée",forecastTotals.map(item=>({label:"À "+item.days+" jours",amount:Math.max(0,item.amount)})),[{key:"amount",label:"Solde projeté"}],money);
  $app.innerHTML = `
    <h1>Pilotage financier</h1>
    ${periodControls("pilotage",exerciceStart,exerciceEnd,period?.compare !== false)}
    ${chartModeControls("pilotage")}
    ${comparison}
    <p class="muted">Les créances et soldes fournisseurs affichés ci-dessous portent sur les factures et écritures de la période sélectionnée. La trésorerie comptabilisée reste le solde actuel.</p>
    <div id="pilotage-table-view">
    <p class="muted">Suivi des créances, des soldes fournisseurs et prévisions de trésorerie à partir des données comptables et de facturation.</p>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Trésorerie comptabilisée</div><div class="value">${money(currentCash)}</div></section>
      <section class="card kpi"><div class="label">Créances clients ouvertes</div><div class="value">${money(outstanding)}</div></section>
      <section class="card kpi"><div class="label">Dettes fournisseurs estimées</div><div class="value">${money(payable)}</div></section>
    </div>
    <div class="grid cols-2">
      <section class="card table-wrap">
        <h2>Ancienneté des créances clients</h2>
        <p class="muted">Calcul fondé sur la date d'échéance des factures et les règlements enregistrés.</p>
        <table><thead><tr><th>Tranche</th><th class="num">Montant</th></tr></thead><tbody>${bucketRows}</tbody></table>
      </section>
      <section class="card table-wrap">
        <h2>Soldes fournisseurs</h2>
        <p class="muted">Soldes créditeurs des comptes de tiers commençant par 40. Les écritures sans tiers ne sont pas ventilées.</p>
        <table><thead><tr><th>Fournisseur</th><th class="num">Solde</th></tr></thead><tbody>${vendors.length ? vendors.map(item => "<tr><td>" + esc(item.name) + "</td><td class=\"num\">" + money(item.amount) + "</td></tr>").join("") : "<tr><td colspan=\"2\" class=\"muted\">Aucun solde fournisseur détecté.</td></tr>"}</tbody></table>
      </section>
    </div>
    <section class="card table-wrap">
      <h2>Soldes clients</h2>
      <table><thead><tr><th>Client</th><th class="num">Créance ouverte</th></tr></thead><tbody>${customers.length ? customers.map(item => "<tr><td>" + esc(item.name) + "</td><td class=\"num\">" + money(item.amount) + "</td></tr>").join("") : "<tr><td colspan=\"2\" class=\"muted\">Aucun solde client.</td></tr>"}</tbody></table>
      <h2>Factures clients à recouvrer</h2>
      <table><thead><tr><th>Facture</th><th>Client</th><th>Échéance</th><th>Retard</th><th class="num">Solde converti</th></tr></thead>
      <tbody>${docs.length ? docs.map(item => "<tr><td>" + esc(item.number) + "</td><td>" + esc(item.customer) + "</td><td>" + esc(item.dueDate) + "</td><td>" + (item.days > 0 ? item.days + " j" : "—") + "</td><td class=\"num\">" + money(item.amount) + "</td></tr>").join("") : "<tr><td colspan=\"5\" class=\"muted\">Aucune créance ouverte.</td></tr>"}</tbody></table>
    </section>
    <section class="card">
      <h2>Prévisions de trésorerie — devise de référence : ${esc(store.settings.currency)}</h2>
      <p class="muted">Les factures clients ouvertes sont intégrées automatiquement à leur échéance après conversion au taux enregistré sur la facture. Les prévisions manuelles sont saisies dans la devise de référence.</p>
      <div class="grid cols-3">${forecastTotals.map(item => "<div class=\"card kpi\"><div class=\"label\">Solde projeté à " + item.days + " jours</div><div class=\"value\">" + money(item.amount) + "</div></div>").join("")}</div>
      <p class="muted">Les projections sont exprimées dans la devise de référence de l’entreprise. Les créances sont aussi ventilées dans leur devise d’origine ; aucune somme de devises différentes n’est additionnée.</p>
      <div class="grid cols-2">
        <section class="table-wrap"><h3>Créances ouvertes par devise d’origine</h3><table><thead><tr><th>Devise</th><th class="num">Montant restant</th></tr></thead><tbody>${receivableCurrencyRows || '<tr><td colspan="2" class="muted">Aucune créance.</td></tr>'}</tbody></table></section>
        <section class="table-wrap"><h3>Flux prévisionnels mensuels — 6 mois</h3><table><thead><tr><th>Mois</th><th class="num">Entrées</th><th class="num">Sorties</th><th class="num">Net</th><th class="num">Solde fin</th></tr></thead><tbody>${monthlyForecastRows}</tbody></table></section>
      </div>
      <form id="forecast-form">
        <div class="row">
          <div><label for="forecast-date">Date prévue</label><input id="forecast-date" type="date" min="${today()}" required></div>
          <div><label for="forecast-direction">Nature</label><select id="forecast-direction"><option value="in">Encaissement</option><option value="out">Décaissement</option></select></div>
          <div><label for="forecast-label">Libellé</label><input id="forecast-label" maxlength="120" required placeholder="Ex. Loyer, salaire, apport…"></div>
          <div><label for="forecast-amount">Montant (${esc(store.settings.currency)})</label><input id="forecast-amount" type="number" min="0.01" step="0.01" required></div>
          <div class="nogrow"><button type="submit">Ajouter</button></div>
        </div>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th>Nature</th><th class="num">Montant</th><th>Action</th></tr></thead>
      <tbody>${forecast.length ? forecast.map(item => "<tr><td>" + esc(item.date) + "</td><td>" + esc(item.label) + (item.automatic ? " <span class=\"tag\">Facture</span>" : "") + "</td><td>" + (item.direction === "in" ? "Encaissement" : "Décaissement") + "</td><td class=\"num\">" + money(item.amount) + "</td><td>" + (item.automatic ? "Automatique" : "<button class=\"danger small\" data-forecast-delete=\"" + esc(item.id) + "\">Supprimer</button>") + "</td></tr>").join("") : "<tr><td colspan=\"5\" class=\"muted\">Aucun flux prévisionnel.</td></tr>"}</tbody></table></div>
      <p class="muted">Les prévisions manuelles sont enregistrées dans les paramètres synchronisés de l'entreprise. Les projections ne constituent pas une écriture comptable.</p>
    </section>
    </div>
    <div id="pilotage-chart-view" hidden>
      <div class="grid cols-3">
        <section class="card kpi"><div class="value">${money(currentCash)}</div><div class="label">Trésorerie comptabilisée</div></section>
        <section class="card kpi"><div class="value">${money(outstanding)}</div><div class="label">Créances ouvertes</div></section>
        <section class="card kpi"><div class="value">${money(payable)}</div><div class="label">Dettes fournisseurs</div></section>
      </div>
      ${agingChart}
      ${customerChart}
      ${forecastChart}
      <p class="muted">Les soldes et projections sont calculés à partir des écritures, factures et prévisions enregistrées. Les projections négatives restent visibles dans les indicateurs et les tableaux détaillés.</p>
    </div>
  `;
  bindChartMode("pilotage");
  bindPeriodControls("pilotage", viewFinancial);
  document.getElementById("forecast-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const date = document.getElementById("forecast-date").value;
    const label = document.getElementById("forecast-label").value.trim();
    const amount = Number(document.getElementById("forecast-amount").value);
    const direction = document.getElementById("forecast-direction").value;
    if (!date || date < today() || !label || !Number.isFinite(amount) || amount <= 0 || !["in", "out"].includes(direction)) return toast("Vérifiez la date, le libellé et le montant de la prévision.");
    const id = globalThis.crypto?.randomUUID?.() || ("forecast-" + Date.now() + "-" + Math.random().toString(16).slice(2));
    store.settings.cashForecast.push({ id, date, label, amount: round(amount), direction });
    saveStore(store);
    toast("Prévision enregistrée et prête à être synchronisée.");
    viewFinancial();
  });
  $app.querySelectorAll("[data-forecast-delete]").forEach(button => button.addEventListener("click", () => {
    store.settings.cashForecast = store.settings.cashForecast.filter(item => String(item.id) !== button.dataset.forecastDelete);
    saveStore(store);
    viewFinancial();
  }));
}
