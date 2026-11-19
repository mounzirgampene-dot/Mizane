// MIZANE — Socle international de devis et factures.
// Les documents restent dans le store de l'entreprise ; aucune écriture comptable
// n'est générée avant la phase de validation comptable du module.
import { COUNTRIES, formatMoney, currencyOptionLabel, getCountry } from "./countries.js";
import { store, $app, saveNow, esc, toast } from "./state.js";
import { printHTML } from "./print.js";
import { calculateBillingTotals, calculateOutstandingBase, convertBillingAmount, makeBillingNumber, validateBillingDocument } from "./billing-core.js";

const CURRENCIES = [...new Set([
  ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : []),
  ...COUNTRIES.map((country) => country.currency),
  "XXX",
])].sort();
const today = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const getBilling = () => {
  if (!store.billing || typeof store.billing !== "object") {
    store.billing = { documents: [], nextId: 1, settings: { currency: store.settings.currency || "XOF", taxLabel: "TVA", defaultTax: null, prefixQuote: "DEV", prefixInvoice: "FAC", nextQuote: 1, nextInvoice: 1, paymentTerms: "Paiement à réception" } };
  }
  if (!Array.isArray(store.billing.documents)) store.billing.documents = [];
  if (!store.billing.settings) store.billing.settings = {};
  const settings = store.billing.settings;
  settings.currency ||= store.settings.currency || "XOF";
  settings.taxLabel ||= "Taxe";
  settings.prefixQuote ||= "DEV";
  settings.prefixInvoice ||= "FAC";
  settings.nextQuote = Math.max(1, Number(settings.nextQuote) || 1);
  settings.nextInvoice = Math.max(1, Number(settings.nextInvoice) || 1);
  return store.billing;
};
const fmt = (value, currency, locale) => formatMoney(value, currency, locale);
const totals = calculateBillingTotals;
const nextNumber = (kind, settings) => {
  const key = kind === "quote" ? "nextQuote" : "nextInvoice";
  const value = settings[key]++;
  return makeBillingNumber(kind, new Date().getFullYear(), value, settings);
};

function documentHTML(doc) {
  const company = store.settings;
  const currency = doc.currency || company.currency;
  const locale = company.locale || "fr";
  const customerCountryName = getCountry(doc.customerCountry)?.name || "";
  const t = totals(doc.lines || []);
  const rows = (doc.lines || []).map((line) => {
    const lineHT = round(number(line.quantity) * number(line.unitPrice));
    const lineTax = round(lineHT * number(line.taxRate) / 100);
    return `<tr><td>${esc(line.description)}</td><td class="num">${number(line.quantity)}</td><td class="num">${fmt(line.unitPrice,currency,locale)}</td><td class="num">${number(line.taxRate)} %</td><td class="num">${fmt(lineHT+lineTax,currency,locale)}</td></tr>`;
  }).join("");
  const title = doc.type === "quote" ? "DEVIS" : "FACTURE";
  return `<div class="inv-head"><div><h2>${esc(company.companyName)}</h2><p>${esc(company.country || "")}</p><p>${esc(company.address || "")}</p><p>${esc(company.taxId || "")}</p></div><div><h2>${title}</h2><p>N° ${esc(doc.number)}</p><p>Date : ${esc(doc.date)}</p><p>Échéance : ${esc(doc.dueDate || "—")}</p><p>Client : ${esc(doc.customerName)}</p><p>${esc(doc.customerAddress || "")}</p><p>${esc(customerCountryName)}</p></div></div>
  <table><thead><tr><th>Description</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Taxe</th><th class="num">Total TTC</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="inv-totals"><tr><td>Total HT</td><td class="num">${fmt(t.ht,currency,locale)}</td></tr><tr><td>${esc(doc.taxLabel || "Taxes")}</td><td class="num">${fmt(t.tax,currency,locale)}</td></tr><tr class="total"><td>Total TTC</td><td class="num"><strong>${fmt(t.ttc,currency,locale)}</strong></td></tr></table>
  <p>Devise de facturation : ${esc(currencyOptionLabel(currency, locale))}</p><p>Taux de conversion vers ${esc(doc.baseCurrency)} : ${number(doc.exchangeRate) || 1}</p><p>Contre-valeur comptable : ${fmt(convertBillingAmount(t.ttc, number(doc.exchangeRate) || 1),doc.baseCurrency,locale)}</p><p>${esc(doc.paymentTerms || "")}</p><p>${esc(doc.notes || "")}</p>`;
}

function renderList() {
  const billing = getBilling();
  const docs = [...billing.documents].sort((a,b) => String(b.date).localeCompare(String(a.date)) || b.id-a.id);
  const quotes = docs.filter((doc) => doc.type === "quote");
  const invoices = docs.filter((doc) => doc.type === "invoice");
  const openAmount = calculateOutstandingBase(invoices);
  const row = (doc) => `<tr><td>${esc(doc.number)}</td><td>${doc.type === "quote" ? "Devis" : "Facture"}</td><td>${esc(doc.date)}</td><td>${esc(doc.customerName)}</td><td>${esc(currencyOptionLabel(doc.currency,store.settings.locale || "fr"))}</td><td class="num">${fmt(doc.totals?.ttc || 0,doc.currency,store.settings.locale)}</td><td>${doc.status === "accepted" ? "Accepté" : doc.status === "converted" ? "Converti" : doc.status === "cancelled" ? "Annulé" : doc.status === "draft" ? "Brouillon" : "Émis"}</td><td><button class="secondary small" data-bill-print="${doc.id}">Imprimer</button> ${doc.type === "quote" && doc.status !== "converted" && doc.status !== "cancelled" ? `<button class="small" data-bill-convert="${doc.id}">Convertir</button>` : ""}</td></tr>`;
  $app.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center"><div><h1>Facturation</h1><p class="muted">Devis, factures et facturation multi-devises.</p></div><div class="actions"><button id="bill-new-quote" class="secondary">Nouveau devis</button><button id="bill-new-invoice">Nouvelle facture</button><button id="bill-settings" class="secondary">Paramètres</button></div></div>
    <div class="grid cols-3"><section class="card kpi"><div class="label">Devis</div><div class="value">${quotes.length}</div></section><section class="card kpi"><div class="label">Factures émises</div><div class="value">${invoices.length}</div></section><section class="card kpi"><div class="label">Solde à recouvrer</div><div class="value">${fmt(openAmount,store.settings.currency,store.settings.locale)}</div></section></div>
    <section class="card"><h2>Documents</h2><div class="table-wrap"><table><thead><tr><th>Numéro</th><th>Type</th><th>Date</th><th>Client</th><th>Devise</th><th class="num">Total TTC</th><th>État</th><th>Actions</th></tr></thead><tbody>${docs.length ? docs.map(row).join("") : '<tr><td colspan="8" class="muted">Aucun devis ou facture pour le moment.</td></tr>'}</tbody></table></div></section>
    <p class="muted">Les documents sont actuellement enregistrés dans les données locales de l'entreprise. La synchronisation cloud et la génération des écritures comptables seront raccordées dans les étapes suivantes.</p>`;
  document.getElementById("bill-new-quote").addEventListener("click", () => openEditor("quote"));
  document.getElementById("bill-new-invoice").addEventListener("click", () => openEditor("invoice"));
  document.getElementById("bill-settings").addEventListener("click", openSettings);
  $app.querySelectorAll("[data-bill-print]").forEach((button) => button.addEventListener("click", () => {
    const doc = billing.documents.find((item) => item.id === Number(button.dataset.billPrint));
    if (doc) printHTML(doc.number, documentHTML(doc));
  }));
  $app.querySelectorAll("[data-bill-convert]").forEach((button) => button.addEventListener("click", () => convertQuote(Number(button.dataset.billConvert))));
}

function openEditor(type, source = null) {
  const billing = getBilling();
  const settings = billing.settings;
  const customers = (store.thirds || []).filter((third) => ["client","customer","client/fournisseur"].includes(String(third.type || "").toLowerCase()));
  const defaultCountry = COUNTRIES.find((country) => country.code === store.settings.country);
  const defaultTax = settings.defaultTax == null ? (defaultCountry?.vatRates?.[0] || 0) : number(settings.defaultTax);
  const doc = source || { date: today(), dueDate: "", customerName: "", customerAddress: "", customerCountry: store.settings.country || "OTHER", currency: settings.currency || store.settings.currency, baseCurrency: store.settings.currency, exchangeRate: (settings.currency || store.settings.currency) === store.settings.currency ? 1 : "", taxLabel: settings.taxLabel, paymentTerms: settings.paymentTerms || "", notes: "", lines: [{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax }] };
  const initialCustomerCountry = doc.customerCountry || store.settings.country || "OTHER";
  const title = type === "quote" ? "Créer un devis" : "Créer une facture";
  const lineMarkup = (line, index) => `<tr data-bill-line="${index}"><td><input data-line-field="description" value="${esc(line.description)}" placeholder="Produit ou prestation"></td><td><input data-line-field="quantity" type="number" min="0.0001" step="0.01" value="${number(line.quantity)}"></td><td><input data-line-field="unitPrice" type="number" min="0" step="0.01" value="${number(line.unitPrice)}"></td><td><input data-line-field="taxRate" type="number" min="0" step="0.01" value="${number(line.taxRate)}"></td><td class="num" data-line-total>—</td><td><button type="button" class="danger small" data-line-remove="${index}">×</button></td></tr>`;
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = `<h2>${title}</h2>
    <div class="grid cols-2"><div><label>Client</label><input id="bill-customer" list="bill-customer-list" value="${esc(doc.customerName)}" placeholder="Nom du client"><datalist id="bill-customer-list">${customers.map((customer) => `<option value="${esc(customer.name)}">`).join("")}</datalist></div><div><label>Date</label><input id="bill-date" type="date" value="${esc(doc.date)}"></div><div><label>Adresse du client</label><input id="bill-customer-address" value="${esc(doc.customerAddress)}"></div><div><label>Pays du client (propose sa devise)</label><input id="bill-country-search" type="search" placeholder="Rechercher un pays ou une devise"><select id="bill-customer-country">${COUNTRIES.map((country) => `<option value="${country.code}" ${country.code === initialCustomerCountry ? "selected" : ""}>${esc(country.name)} — ${esc(currencyOptionLabel(country.currency, store.settings.locale || "fr"))}</option>`).join("")}</select></div><div><label>Date d'échéance</label><input id="bill-due-date" type="date" value="${esc(doc.dueDate)}"></div>
    <div><label>Devise de facturation</label><select id="bill-currency">${[...new Set([...CURRENCIES, settings.currency, store.settings.currency])].sort().map((currency) => `<option value="${currency}" ${currency === doc.currency ? "selected" : ""}>${esc(currencyOptionLabel(currency, store.settings.locale || "fr"))}</option>`).join("")}</select></div><div><label>Devise comptable de l'entreprise</label><input value="${esc(store.settings.currency)}" readonly></div><div><label>Taux vers devise comptable (1 ${esc(doc.currency)} = ? ${esc(store.settings.currency)})</label><input id="bill-rate" type="number" min="0.00000001" step="0.00000001" value="${doc.exchangeRate == null || doc.exchangeRate === "" ? "" : number(doc.exchangeRate)}"></div><div><label>Libellé de taxe</label><input id="bill-tax-label" value="${esc(doc.taxLabel || settings.taxLabel)}"></div></div>
    <h3>Articles et prestations</h3><div class="table-wrap"><table><thead><tr><th>Description</th><th>Quantité</th><th>Prix unitaire</th><th>Taxe %</th><th>Total</th><th></th></tr></thead><tbody id="bill-lines">${doc.lines.map(lineMarkup).join("")}</tbody></table></div><button type="button" class="secondary small" id="bill-add-line">Ajouter une ligne</button>
    <div id="bill-totals" class="calculator-result"></div><label>Conditions de paiement</label><input id="bill-terms" value="${esc(doc.paymentTerms || settings.paymentTerms || "")}"><label>Notes / mentions</label><textarea id="bill-notes" rows="2">${esc(doc.notes || "")}</textarea>
    <div class="actions"><button type="button" id="bill-save">Enregistrer ${type === "quote" ? "le devis" : "la facture"}</button><button type="button" class="secondary" data-close>Annuler</button></div><div id="bill-error" class="errors" role="alert"></div>`;
  const addLine = (line = { description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax }) => {
    const body = content.querySelector("#bill-lines");
    body.insertAdjacentHTML("beforeend", lineMarkup(line, body.querySelectorAll("tr").length));
    bindRows();
    refreshTotals();
  };
  const readLines = () => [...content.querySelectorAll("#bill-lines tr")].map((tr) => ({
    description: tr.querySelector('[data-line-field="description"]').value.trim(),
    quantity: number(tr.querySelector('[data-line-field="quantity"]').value),
    unitPrice: number(tr.querySelector('[data-line-field="unitPrice"]').value),
    taxRate: number(tr.querySelector('[data-line-field="taxRate"]').value),
  }));
  const refreshTotals = () => {
    const lines = readLines();
    const result = totals(lines);
    content.querySelectorAll("#bill-lines tr").forEach((tr, index) => {
      const line = lines[index];
      const value = number(line.quantity) * number(line.unitPrice) * (1 + number(line.taxRate)/100);
      tr.querySelector("[data-line-total]").textContent = fmt(value,content.querySelector("#bill-currency").value,store.settings.locale);
    });
    content.querySelector("#bill-totals").innerHTML = `HT : <strong>${fmt(result.ht,content.querySelector("#bill-currency").value,store.settings.locale)}</strong> · Taxes : <strong>${fmt(result.tax,content.querySelector("#bill-currency").value,store.settings.locale)}</strong> · TTC : <strong>${fmt(result.ttc,content.querySelector("#bill-currency").value,store.settings.locale)}</strong><br><small>Contre-valeur comptable : ${fmt(number(content.querySelector("#bill-rate").value) > 0 ? convertBillingAmount(result.ttc, number(content.querySelector("#bill-rate").value)) : 0,store.settings.currency,store.settings.locale)}</small>`;
  };
  const bindRows = () => {
    content.querySelectorAll("#bill-lines input").forEach((input) => input.addEventListener("input", refreshTotals));
    content.querySelectorAll("[data-line-remove]").forEach((button) => button.addEventListener("click", () => {
      if (content.querySelectorAll("#bill-lines tr").length <= 1) return;
      button.closest("tr").remove();
      [...content.querySelectorAll("#bill-lines tr")].forEach((tr,index) => { tr.dataset.billLine = index; tr.querySelector("[data-line-remove]").dataset.lineRemove = index; });
      refreshTotals();
    }));
  };
  bindRows();
  content.querySelector("#bill-add-line").addEventListener("click", () => addLine());
  const customerCountrySelect = content.querySelector("#bill-customer-country");
  content.querySelector("#bill-country-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("fr");
    [...customerCountrySelect.options].forEach((option) => {
      option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase("fr").includes(query);
    });
  });
  customerCountrySelect.addEventListener("change", () => {
    content.querySelector("#bill-country-search").value = "";
    [...customerCountrySelect.options].forEach((option) => { option.hidden = false; });
    const selectedCountry = COUNTRIES.find((country) => country.code === customerCountrySelect.value);
    if (!selectedCountry) return;
    content.querySelector("#bill-currency").value = selectedCountry.currency;
    const rateInput = content.querySelector("#bill-rate");
    rateInput.value = selectedCountry.currency === store.settings.currency ? "1" : "";
    refreshTotals();
  });
  content.querySelector("#bill-currency").addEventListener("change", () => {
    const currency = content.querySelector("#bill-currency").value;
    const rateInput = content.querySelector("#bill-rate");
    rateInput.value = currency === store.settings.currency ? "1" : "";
    refreshTotals();
  });
  content.querySelector("#bill-rate").addEventListener("input", refreshTotals);
  content.querySelector("#bill-save").addEventListener("click", () => {
    const lines = readLines();
    const errors = [];
    if (!content.querySelector("#bill-customer").value.trim()) errors.push("Le nom du client est obligatoire.");
    if (!content.querySelector("#bill-date").value) errors.push("La date est obligatoire.");
    if (!lines.length || lines.some((line) => !line.description || line.quantity <= 0 || line.unitPrice < 0 || line.taxRate < 0)) errors.push("Chaque ligne doit avoir une description, une quantité positive, un prix et un taux valides.");
    const rate = number(content.querySelector("#bill-rate").value);
    if (!(rate > 0)) errors.push("Le taux de conversion doit être supérieur à zéro.");
    const draftForValidation = { type, date: content.querySelector("#bill-date").value, customerName: content.querySelector("#bill-customer").value, currency: content.querySelector("#bill-currency").value, exchangeRate: rate, lines };
    errors.push(...validateBillingDocument(draftForValidation).errors);
    if (errors.length) { content.querySelector("#bill-error").textContent = [...new Set(errors)].join(" "); return; }
    const totalsValue = totals(lines);
    const saved = {
      id: billing.nextId++, type, number: nextNumber(type,settings),
      date: content.querySelector("#bill-date").value,
      dueDate: content.querySelector("#bill-due-date").value,
      customerName: content.querySelector("#bill-customer").value.trim(),
      customerAddress: content.querySelector("#bill-customer-address").value.trim(),
      customerCountry: content.querySelector("#bill-customer-country").value,
      currency: content.querySelector("#bill-currency").value,
      baseCurrency: store.settings.currency,
      exchangeRate: rate,
      taxLabel: content.querySelector("#bill-tax-label").value.trim() || settings.taxLabel,
      paymentTerms: content.querySelector("#bill-terms").value.trim(),
      notes: content.querySelector("#bill-notes").value.trim(),
      lines, totals: totalsValue, paidAmount: 0,
      status: "issued", createdAt: new Date().toISOString(),
    };
    billing.documents.push(saved);
    saveNow();
    modal.close();
    renderList();
    toast(type === "quote" ? "Devis enregistré." : "Facture enregistrée.");
  });
  refreshTotals();
  modal.showModal();
}

function convertQuote(id) {
  const billing = getBilling();
  const quote = billing.documents.find((doc) => doc.id === id && doc.type === "quote");
  if (!quote || quote.status === "converted" || quote.status === "cancelled") return;
  const invoice = {
    ...structuredClone(quote),
    id: billing.nextId++,
    type: "invoice",
    number: nextNumber("invoice",billing.settings),
    status: "issued",
    paidAmount: 0,
    sourceQuoteId: quote.id,
    createdAt: new Date().toISOString(),
  };
  quote.status = "converted";
  quote.convertedTo = invoice.id;
  billing.documents.push(invoice);
  saveNow();
  renderList();
  toast("Devis converti en facture.");
}

function openSettings() {
  const billing = getBilling();
  const settings = billing.settings;
  const companySettings = store.settings;
  const initialCountry = getCountry(companySettings.country);
  const initialAccountingCurrency = companySettings.currency || initialCountry.currency;
  let selectedCountryCode = initialCountry.code;
  let accountingCurrency = initialAccountingCurrency;
  let billingCurrency = settings.currency || initialAccountingCurrency;
  const content = document.getElementById("modal-content");

  const countryOptions = () => COUNTRIES.map((item) =>
    `<option value="${item.code}" ${item.code === selectedCountryCode ? "selected" : ""}>${esc(item.name)} — ${esc(currencyOptionLabel(item.currency, companySettings.locale || "fr"))}</option>`
  ).join("");
  const renderTaxRates = (country) => {
    const rates = country.vatRates.length ? country.vatRates : [0];
    const current = settings.defaultTax == null ? rates[0] : number(settings.defaultTax);
    return `<label id="bill-default-tax-label-caption">Taux par défaut suggéré pour ${esc(country.name)}</label><select id="bill-default-tax">${rates.map((rate) => `<option value="${rate}" ${current === rate ? "selected" : ""}>${rate} %</option>`).join("")}<option value="0" ${current === 0 ? "selected" : ""}>0 % / exonéré</option></select>`;
  };
  content.innerHTML = `<h2>Paramètres de facturation</h2>
    <h3>Entreprise</h3>
    <label>Pays de l'entreprise</label>
    <input id="bill-company-country-search" type="search" placeholder="Rechercher un pays ou une devise">
    <select id="bill-company-country">${countryOptions()}</select>
    <label>Devise comptable de l'entreprise</label>
    <div id="bill-accounting-currency" class="calculator-result">${esc(currencyOptionLabel(accountingCurrency, companySettings.locale || "fr"))}</div>
    <p class="muted">Le pays propose automatiquement sa devise locale comme devise comptable. Une devise comptable personnalisée déjà choisie est conservée.</p>
    <h3>Documents de facturation</h3>
    <label>Devise par défaut des documents</label><select id="bill-default-currency">${[...new Set([...CURRENCIES, settings.currency, accountingCurrency])].sort().map((currency) => `<option value="${currency}" ${currency === billingCurrency ? "selected" : ""}>${esc(currencyOptionLabel(currency, companySettings.locale || "fr"))}</option>`).join("")}</select>
    <label>Libellé fiscal (TVA, GST, taxe de vente…)</label><input id="bill-default-tax-label" value="${esc(settings.taxLabel)}">
    <div id="bill-default-tax-container">${renderTaxRates(initialCountry)}</div>
    <div class="grid cols-2"><div><label>Préfixe des devis</label><input id="bill-prefix-quote" value="${esc(settings.prefixQuote)}"></div><div><label>Préfixe des factures</label><input id="bill-prefix-invoice" value="${esc(settings.prefixInvoice)}"></div></div>
    <label>Conditions de paiement par défaut</label><input id="bill-payment-terms" value="${esc(settings.paymentTerms || "")}">
    <p class="muted">Les taux proposés sont des valeurs indicatives du profil pays. Vérifiez les règles fiscales applicables avant émission. Les paramètres n'attestent pas à eux seuls d'une conformité légale nationale.</p>
    <div class="actions"><button id="bill-settings-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;

  const countrySelect = content.querySelector("#bill-company-country");
  const countrySearch = content.querySelector("#bill-company-country-search");
  countrySearch.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("fr");
    [...countrySelect.options].forEach((option) => {
      option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase("fr").includes(query);
    });
  });
  countrySelect.addEventListener("change", () => {
    countrySearch.value = "";
    [...countrySelect.options].forEach((option) => { option.hidden = false; });
    const previousCountry = getCountry(selectedCountryCode);
    const nextCountry = getCountry(countrySelect.value);
    if (accountingCurrency === previousCountry.currency) {
      accountingCurrency = nextCountry.currency;
      content.querySelector("#bill-accounting-currency").textContent =
        currencyOptionLabel(accountingCurrency, companySettings.locale || "fr");
    }
    if (billingCurrency === previousCountry.currency) {
      billingCurrency = nextCountry.currency;
      const currencySelect = content.querySelector("#bill-default-currency");
      if (![...currencySelect.options].some((option) => option.value === billingCurrency)) {
        currencySelect.add(new Option(currencyOptionLabel(billingCurrency, companySettings.locale || "fr"), billingCurrency));
      }
      currencySelect.value = billingCurrency;
    }
    selectedCountryCode = nextCountry.code;
    content.querySelector("#bill-default-tax-container").innerHTML = renderTaxRates(nextCountry);
  });
  content.querySelector("#bill-default-currency").addEventListener("change", (event) => {
    billingCurrency = event.target.value;
  });

  document.getElementById("bill-settings-save").addEventListener("click", () => {
    const chosenCountry = getCountry(selectedCountryCode);
    companySettings.country = chosenCountry.code;
    companySettings.currency = accountingCurrency;
    settings.currency = content.querySelector("#bill-default-currency").value;
    settings.taxLabel = content.querySelector("#bill-default-tax-label").value.trim() || "Taxe";
    settings.defaultTax = number(content.querySelector("#bill-default-tax").value);
    settings.prefixQuote = content.querySelector("#bill-prefix-quote").value.trim() || "DEV";
    settings.prefixInvoice = content.querySelector("#bill-prefix-invoice").value.trim() || "FAC";
    settings.paymentTerms = content.querySelector("#bill-payment-terms").value.trim();
    saveNow();
    document.getElementById("modal").close();
    renderList();
    toast("Paramètres de facturation enregistrés.");
  });
  document.getElementById("modal").showModal();
}

export function viewBilling() {
  getBilling();
  renderList();
}
