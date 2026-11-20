// MIZANE — Pilotage financier : échéances, soldes tiers et prévisions de trésorerie.
import { cashBalance } from "../accounting.js";
import { saveStore } from "../db.js";
import { store, $app, toast, esc, money } from "../state.js";

const today = () => new Date().toISOString().slice(0, 10);
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dayDiff = (date, reference) => Math.floor((Date.parse(reference + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
const invoiceBalance = doc => {
  const paid = Array.isArray(doc.payments) && doc.payments.length ? doc.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) : Number(doc.paidAmount || 0);
  return Math.max(0, round(Number(doc.totals?.ttc || 0) - paid));
};

function receivables() {
  return (store.billing?.documents || []).filter(doc =>
    doc.type === "invoice" && doc.status !== "cancelled" && invoiceBalance(doc) > 0
  ).map(doc => ({
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

function suppliers() {
  const totals = new Map();
  for (const entry of store.entries || []) {
    if (entry.date > today()) continue;
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

function forecastRows(receivablesList, manual) {
  return [
    ...receivablesList.map(item => ({
      id: "invoice:" + item.number, date: item.dueDate, label: "Encaissement client — " + item.customer + " (" + item.number + ")",
      direction: "in", amount: item.amount, automatic: true,
    })),
    ...manual.filter(item => item.date >= today()).map(item => ({ ...item, automatic: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function viewFinancial() {
  const docs = receivables();
  const vendors = suppliers();
  const customers = customerBalances(docs);
  const manual = Array.isArray(store.settings.cashForecast) ? store.settings.cashForecast.filter(item => item && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) && String(item.label || "").trim() && Number(item.amount) > 0 && ["in", "out"].includes(item.direction)) : [];
  store.settings.cashForecast = manual;
  const outstanding = round(docs.reduce((sum, item) => sum + item.amount, 0));
  const payable = round(vendors.reduce((sum, item) => sum + item.amount, 0));
  const currentCash = cashBalance(store, "", today());
  const forecast = forecastRows(docs, manual);
  const buckets = ["À échéance / non échue", "1 à 30 jours", "31 à 60 jours", "61 à 90 jours", "Plus de 90 jours"];
  const bucketRows = buckets.map(name => {
    const amount = round(docs.filter(item => bucket(item.days) === name).reduce((sum, item) => sum + item.amount, 0));
    return "<tr><td>" + esc(name) + "</td><td class=\"num\">" + money(amount) + "</td></tr>";
  }).join("");
  const forecastTotals = [30, 60, 90].map(days => {
    const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const amount = forecast.filter(item => item.date <= limit).reduce((sum, item) => sum + (item.direction === "in" ? item.amount : -item.amount), 0);
    return { days, amount: round(currentCash + amount) };
  });
  $app.innerHTML = `
    <h1>Pilotage financier</h1>
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
      <h2>Prévisions de trésorerie</h2>
      <p class="muted">Les factures clients ouvertes sont intégrées automatiquement à leur échéance. Ajoutez les autres encaissements et décaissements prévus pour compléter la projection.</p>
      <div class="grid cols-3">${forecastTotals.map(item => "<div class=\"card kpi\"><div class=\"label\">Solde projeté à " + item.days + " jours</div><div class=\"value\">" + money(item.amount) + "</div></div>").join("")}</div>
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
  `;
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
