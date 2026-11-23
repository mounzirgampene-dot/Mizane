// MIZANE — Socle international de devis et factures.
// Les documents restent dans le store local ; les factures et règlements génèrent
// des écritures comptables selon les comptes configurés par l'entreprise.
import { COUNTRIES, formatMoney, currencyOptionLabel, getCountry } from "./countries.js";
import { store, planAccounts, $app, saveNow, esc, toast } from "./state.js";
import { postEntry, reverseEntry } from "./accounting.js";
import { buildBillingJournalEntries, suggestBillingAccounts } from "./billing-accounting.js";
import { printHTML } from "./print.js";
import { calculateBillingTotals, calculateOutstandingBase, calculatePaymentBalance, convertBillingAmount, makeBillingNumber, migrateLegacyInvoicePayment, validateBillingDocument, validateBillingPayment } from "./billing-core.js";
import { hasActiveStockCompany, readCloudStock, postCloudStockDocument } from "./cloud-sync.js";

const CURRENCIES = [...new Set([
  ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : []),
  ...COUNTRIES.map((country) => country.currency),
  "XXX",
])].sort();
const today = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
function bindBillingModalClose(content) {
  content.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => document.getElementById("modal").close());
  });
}

function saveBilling() {
  saveNow();
  window.dispatchEvent(new Event("mizane:billing-changed"));
}

const getBilling = () => {
  if (!store.billing || typeof store.billing !== "object") {
    store.billing = { documents: [], nextId: 1, settings: { currency: store.settings.currency || "XOF", taxLabel: "TVA", defaultTax: null, prefixQuote: "DEV", prefixInvoice: "FAC", nextQuote: 1, nextInvoice: 1, paymentTerms: "Paiement à réception" } };
  }
  if (!Array.isArray(store.billing.documents)) store.billing.documents = [];
  if (!store.billing.settings) store.billing.settings = {};
  store.billing.nextPaymentId = Math.max(1, Number(store.billing.nextPaymentId) || 1);
  for (const doc of store.billing.documents) {
    if (doc.type !== "invoice") continue;
    const migrated = migrateLegacyInvoicePayment(doc, store.billing.nextPaymentId);
    doc.payments = migrated.payments;
    store.billing.nextPaymentId = migrated.nextPaymentId;
    doc.paidAmount = round(doc.payments.reduce((sum, payment) => sum + number(payment.amount), 0));
    for (const payment of doc.payments) store.billing.nextPaymentId = Math.max(store.billing.nextPaymentId, number(payment.id) + 1);
  }
  const settings = store.billing.settings;
  const availableAccounts = [...planAccounts, ...(store.settings.customAccounts || [])];
  const suggestedAccounts = suggestBillingAccounts(store.settings.plan, availableAccounts);
  if (!settings.accountingAccounts) settings.accountingAccounts = suggestedAccounts;
  else for (const key of ["customer", "revenue", "tax", "bank", "cash", "fxGain", "fxLoss"]) {
    const code = settings.accountingAccounts[key];
    const type = key === "revenue" || key === "fxGain" ? "income" : key === "tax" ? "liability" : key === "fxLoss" ? "expense" : "asset";
    if (!code || !availableAccounts.some(account => String(account.code) === String(code) && account.type === type)) settings.accountingAccounts[key] = suggestedAccounts[key];
  }
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
function postInvoiceAccounting(invoice) {
  const mapping = getBilling().settings.accountingAccounts || {};
  const proposal = buildBillingJournalEntries(store, invoice, mapping);
  if (!proposal.ok) return proposal;
  let created = 0;
  for (const entry of proposal.entries) {
    const result = postEntry(store, entry);
    if (!result.ok) return { ok: false, errors: result.errors, created };
    created++;
  }
  return { ok: true, errors: [], created };
}

function invoiceHasStockLines(invoice) {
  return (invoice?.lines || []).some(line => line.stockProductId && line.stockWarehouseId);
}
function stockSerials(value) {
  return String(value || "").split(/[\\n,;]+/).map(value => value.trim()).filter(Boolean);
}
function stockOperationUid() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Ce navigateur ne permet pas de sécuriser l'identifiant de mouvement de stock.");
  return globalThis.crypto.randomUUID();
}
function invoiceStockLines(invoice, stockState, rows = null) {
  const products = new Map((stockState?.products || []).map(product => [product.id, product]));
  const lines = [];
  const fulfilled = [];
  for (let index=0; index<(invoice.lines || []).length; index++) {
    const line=invoice.lines[index];
    if (!line.stockProductId) continue;
    const product=products.get(line.stockProductId);
    if (!product || product.product_type==="service" || !line.stockWarehouseId) throw new Error("Chaque ligne liée au stock doit désigner un article physique et un entrepôt.");
    const row=rows?.[index] || {};
    const quantity=Number(row.quantity ?? line.quantity);
    if (!(quantity>0) || !Number.isFinite(quantity)) continue;
    const lotCode=String(row.lotCode ?? line.stockLotCode ?? "").trim();
    const serialNumbers=stockSerials(row.serialNumbers ?? line.stockSerialNumbers);
    if (product.tracking==="lot" && !lotCode) throw new Error("Le code de lot est obligatoire pour l’article "+product.name+".");
    if (product.tracking==="serial" && (quantity!==Math.trunc(quantity) || serialNumbers.length!==quantity)) throw new Error("Saisissez un numéro de série pour chaque unité de "+product.name+".");
    lines.push({
      product_id:product.id, warehouse_id:line.stockWarehouseId, quantity,
      unit:String(row.unit || line.stockUnit || product.base_unit || "unité"),
      unit_cost:0, lot_code:lotCode || null, serial_numbers:serialNumbers,
    });
    fulfilled.push({lineIndex:index,quantity});
  }
  return {lines,fulfilled};
}
async function submitInvoiceStockOperation(invoice, stockState, operation) {
  if (!operation) return {ok:true,skipped:true};
  invoice.stockPendingOperation=operation;
  saveBilling();
  try {
    const result=await postCloudStockDocument({
      operationUid:operation.operationUid, documentType:"issue", documentDate:operation.documentDate,
      reference:invoice.number, note:operation.note, lines:operation.lines,
      sourceType:operation.sourceType, sourceId:operation.sourceId,
    });
    for (const item of operation.fulfilled) {
      const line=invoice.lines[item.lineIndex];
      if (line) line.stockFulfilledQuantity=round(number(line.stockFulfilledQuantity)+item.quantity);
    }
    invoice.stockDocuments ||= [];
    invoice.stockDocuments.push({documentId:result?.document_id || null,operationUid:operation.operationUid,kind:operation.kind,date:operation.documentDate,createdAt:new Date().toISOString()});
    delete invoice.stockPendingOperation;
    saveBilling();
    return {ok:true,result};
  } catch(error) {
    saveBilling();
    return {ok:false,error};
  }
}
async function retryInvoiceStock(invoice) {
  if (!invoice?.stockPendingOperation) return {ok:false,error:new Error("Aucun mouvement de stock en attente.")};
  return submitInvoiceStockOperation(invoice,null,invoice.stockPendingOperation);
}

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
  const paid = doc.type === "invoice"
    ? round(Array.isArray(doc.payments)
      ? doc.payments.reduce((sum, payment) => sum + number(payment.amount), 0)
      : number(doc.paidAmount))
    : 0;
  const balance = Math.max(0, round(t.ttc - paid));
  const requestedAdvance = number(doc.advanceRequested);
  const paymentSummary = doc.type === "invoice" && paid > 0
    ? `<table class="inv-totals payment-summary"><tr><td>Avance déjà payée</td><td class="num">${fmt(paid,currency,locale)}</td></tr><tr class="total"><td>Reste à payer</td><td class="num"><strong>${fmt(balance,currency,locale)}</strong></td></tr></table>`
    : doc.type === "quote" && requestedAdvance > 0
      ? `<table class="inv-totals payment-summary"><tr><td>Avance demandée</td><td class="num">${fmt(requestedAdvance,currency,locale)}</td></tr><tr class="total"><td>Solde après avance</td><td class="num"><strong>${fmt(Math.max(0,round(t.ttc-requestedAdvance)),currency,locale)}</strong></td></tr></table>`
      : doc.type === "invoice" && requestedAdvance > 0 && paid === 0
        ? `<table class="inv-totals payment-summary"><tr><td>Avance demandée</td><td class="num">${fmt(requestedAdvance,currency,locale)}</td></tr><tr class="total"><td>Solde après avance demandée</td><td class="num"><strong>${fmt(Math.max(0,round(t.ttc-requestedAdvance)),currency,locale)}</strong></td></tr></table>`
        : "";
  const rows = (doc.lines || []).map((line) => {
    const lineHT = round(number(line.quantity) * number(line.unitPrice));
    const lineTax = round(lineHT * number(line.taxRate) / 100);
    return `<tr><td>${esc(line.description)}</td><td class="num">${number(line.quantity)}</td><td class="num">${fmt(line.unitPrice,currency,locale)}</td><td class="num">${number(line.taxRate)} %</td><td class="num">${fmt(lineHT+lineTax,currency,locale)}</td></tr>`;
  }).join("");
  const title = doc.type === "quote" ? "DEVIS" : "FACTURE";
  return `<div class="inv-head"><div><h2>${esc(company.companyName)}</h2><p>${esc(company.country || "")}</p><p>${esc(company.address || "")}</p><p>${esc(company.taxId || "")}</p></div><div><h2>${title}</h2><p>N° ${esc(doc.number)}</p><p>Date : ${esc(doc.date)}</p><p>Échéance : ${esc(doc.dueDate || "—")}</p><p>Client : ${esc(doc.customerName)}</p><p>${esc(doc.customerAddress || "")}</p><p>${esc(customerCountryName)}</p></div></div>
  <table><thead><tr><th>Description</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Taxe</th><th class="num">Total TTC</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="inv-totals"><tr><td>Total HT</td><td class="num">${fmt(t.ht,currency,locale)}</td></tr><tr><td>${esc(doc.taxLabel || "Taxes")}</td><td class="num">${fmt(t.tax,currency,locale)}</td></tr><tr class="total"><td>Total TTC</td><td class="num"><strong>${fmt(t.ttc,currency,locale)}</strong></td></tr></table>
  ${paymentSummary}
  <p>Devise de facturation : ${esc(currencyOptionLabel(currency, locale))}</p><p>Taux de conversion vers ${esc(doc.baseCurrency)} : ${number(doc.exchangeRate) || 1}</p><p>Contre-valeur comptable : ${fmt(convertBillingAmount(t.ttc, number(doc.exchangeRate) || 1),doc.baseCurrency,locale)}</p><p>${esc(doc.paymentTerms || "")}</p><p>${esc(doc.notes || "")}</p>`;
}

function renderList() {
  const billing = getBilling();
  const docs = [...billing.documents].sort((a,b) => String(b.date).localeCompare(String(a.date)) || b.id-a.id);
  const quotes = docs.filter((doc) => doc.type === "quote");
  const invoices = docs.filter((doc) => doc.type === "invoice");
  const openAmount = calculateOutstandingBase(invoices);
  const row = (doc) => {
    const paid = number(doc.paidAmount);
    const balance = Math.max(0, number(doc.totals?.ttc) - paid);
    const status = doc.type === "invoice" && doc.status !== "cancelled"
      ? balance <= 0 ? "Payée" : paid > 0 ? "Partiellement payée" : doc.dueDate && doc.dueDate < today() ? "En retard" : "À payer"
      : doc.status === "accepted" ? "Accepté" : doc.status === "converted" ? "Converti" : doc.status === "cancelled" ? "Annulé" : doc.status === "draft" ? "Brouillon" : "Émis";
    return "<tr><td>" + esc(doc.number) + "</td><td>" + (doc.type === "quote" ? "Devis" : "Facture") + "</td><td>" + esc(doc.date) + "</td><td>" + esc(doc.customerName) + "</td><td>" + esc(currencyOptionLabel(doc.currency,store.settings.locale || "fr")) + "</td><td class=\"num\">" + fmt(doc.totals?.ttc || 0,doc.currency,store.settings.locale) + "</td><td>" + status + "</td><td>" +
      '<button class="secondary small" data-bill-print="' + doc.id + '">Imprimer</button>' +
      (doc.status !== "cancelled" && !(doc.type === "quote" && doc.status === "converted") ? '<button class="secondary small" data-bill-edit="' + doc.id + '">Modifier</button>' : "") +
      (doc.type === "quote" && doc.status !== "converted" && doc.status !== "cancelled" ? '<button class="small" data-bill-convert="' + doc.id + '">Convertir</button>' : "") +
      (doc.type === "invoice" && doc.status !== "cancelled" ? '<button class="secondary small" data-bill-post="' + doc.id + '">Comptabiliser</button><button class="secondary small" data-bill-payments="' + doc.id + '">Paiements (' + (doc.payments || []).length + ')</button>' : "") +
      (doc.type === "invoice" && doc.stockPendingOperation ? '<button class="danger small" data-bill-stock-retry="' + doc.id + '">Réessayer le stock</button>' : "") +
      (doc.type === "invoice" && invoiceHasStockLines(doc) && !doc.stockPendingOperation && !["invoice_validation"].includes(doc.stockTrigger || "") && (doc.lines || []).some(line => number(line.stockFulfilledQuantity) + 0.000001 < number(line.quantity)) ? '<button class="small" data-bill-deliver="' + doc.id + '">Livrer</button>' : "") +
      "</td></tr>";
  };
  $app.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center"><div><h1>Facturation</h1><p class="muted">Devis, factures et facturation multi-devises.</p></div><div class="actions"><button id="bill-new-quote" class="secondary">Nouveau devis</button><button id="bill-new-invoice">Nouvelle facture</button><button id="bill-settings" class="secondary">Paramètres</button></div></div>
    <div class="grid cols-3"><section class="card kpi"><div class="label">Devis</div><div class="value">${quotes.length}</div></section><section class="card kpi"><div class="label">Factures émises</div><div class="value">${invoices.length}</div></section><section class="card kpi"><div class="label">Solde à recouvrer</div><div class="value">${fmt(openAmount,store.settings.currency,store.settings.locale)}</div></section></div>
    <section class="card"><h2>Documents</h2><div class="table-wrap"><table><thead><tr><th>Numéro</th><th>Type</th><th>Date</th><th>Client</th><th>Devise</th><th class="num">Total TTC</th><th>État</th><th>Actions</th></tr></thead><tbody>${docs.length ? docs.map(row).join("") : '<tr><td colspan="8" class="muted">Aucun devis ou facture pour le moment.</td></tr>'}</tbody></table></div></section>
    <p class="muted">Les devis et factures sont enregistrés localement. Les écritures comptables générées sont ajoutées au journal et suivent la synchronisation comptable existante.</p>`;
  document.getElementById("bill-new-quote").addEventListener("click", () => openEditor("quote"));
  document.getElementById("bill-new-invoice").addEventListener("click", () => openEditor("invoice"));
  document.getElementById("bill-settings").addEventListener("click", openSettings);
  $app.querySelectorAll("[data-bill-edit]").forEach((button) => button.addEventListener("click", () => {
    const doc = billing.documents.find((item) => item.id === Number(button.dataset.billEdit));
    if (doc) openEditor(doc.type, doc);
  }));
  $app.querySelectorAll("[data-bill-print]").forEach((button) => button.addEventListener("click", () => {
    const doc = billing.documents.find((item) => item.id === Number(button.dataset.billPrint));
    if (doc) printHTML(doc.number, documentHTML(doc));
  }));
  $app.querySelectorAll("[data-bill-convert]").forEach((button) => button.addEventListener("click", () => convertQuote(Number(button.dataset.billConvert))));
  $app.querySelectorAll("[data-bill-payments]").forEach((button) => button.addEventListener("click", () => openPaymentManager(Number(button.dataset.billPayments))));
  $app.querySelectorAll("[data-bill-post]").forEach((button) => button.addEventListener("click", () => {
    const invoice = billing.documents.find(item => item.id === Number(button.dataset.billPost) && item.type === "invoice");
    if (!invoice) return;
    const result = postInvoiceAccounting(invoice);
    if (!result.ok) return toast("Comptabilisation impossible : " + result.errors[0], 5000);
    saveBilling();
    toast(result.created ? result.created + " écriture(s) comptable(s) générée(s)." : "Toutes les écritures de cette facture existent déjà.");
  }));

  $app.querySelectorAll("[data-bill-stock-retry]").forEach(button => button.addEventListener("click", async () => {
    const invoice=billing.documents.find(item=>item.id===Number(button.dataset.billStockRetry));
    if(!invoice) return;
    button.disabled=true;
    const result=await retryInvoiceStock(invoice);
    if(!result.ok) toast("Mouvement de stock toujours en attente : "+(result.error?.message||"erreur inconnue"),6000);
    else { renderList(); toast("Mouvement de stock confirmé."); }
    button.disabled=false;
  }));
  $app.querySelectorAll("[data-bill-deliver]").forEach(button => button.addEventListener("click", () => openInvoiceDelivery(Number(button.dataset.billDeliver))));
}


async function openInvoiceDelivery(invoiceId) {
  const invoice=getBilling().documents.find(doc=>doc.id===invoiceId && doc.type==="invoice");
  if(!invoice) return;
  if(invoice.stockPendingOperation) return toast("Terminez d’abord le mouvement de stock en attente.");
  let stockState;
  try { stockState=await readCloudStock(); }
  catch(error) { return toast("Lecture du stock impossible : "+error.message,6000); }
  const modal=document.getElementById("modal"),content=document.getElementById("modal-content");
  const eligible=(invoice.lines||[]).map((line,index)=>({line,index,remaining:Math.max(0,number(line.quantity)-number(line.stockFulfilledQuantity))}))
    .filter(item=>item.line.stockProductId && item.remaining>0.000001);
  if(!eligible.length) return toast("Aucune quantité liée au stock ne reste à livrer.");
  const productMap=new Map((stockState.products||[]).map(p=>[p.id,p]));
  content.innerHTML=`<h2>Livraison — ${esc(invoice.number)}</h2>
    <p class="muted">Saisissez les quantités livrées. Les quantités restantes seront conservées pour une livraison ultérieure.</p>
    <div class="table-wrap"><table><thead><tr><th>Article</th><th>Reste</th><th>À livrer</th><th>Lot</th><th>Numéros de série</th></tr></thead><tbody>
    ${eligible.map(({line,index,remaining})=>{const product=productMap.get(line.stockProductId);return `<tr data-delivery-index="${index}"><td>${esc(product?.name||line.description)}<small class="muted"> — ${esc(line.stockUnit||product?.base_unit||"unité")}</small></td><td>${remaining}</td><td><input data-delivery-quantity type="number" min="0" max="${remaining}" step="0.0001" value="${remaining}"></td><td><input data-delivery-lot value="${esc(line.stockLotCode||"")}" placeholder="Code lot" ${product?.tracking==="lot"?"required":""}></td><td><input data-delivery-serials value="${esc(line.stockSerialNumbers||"")}" placeholder="SN1, SN2…" ${product?.tracking==="serial"?"required":""}></td></tr>`;}).join("")}
    </tbody></table></div>
    <div class="actions"><button type="button" id="bill-delivery-submit">Confirmer la livraison</button><button type="button" class="secondary" data-close>Annuler</button></div><div id="bill-delivery-error" class="errors" role="alert"></div>`;
  bindBillingModalClose(content);
  content.querySelector("#bill-delivery-submit").addEventListener("click",async()=>{
    const rows={}; const fulfilled=[]; const stockLines=[];
    for(const tr of content.querySelectorAll("[data-delivery-index]")){
      const index=Number(tr.dataset.deliveryIndex),line=invoice.lines[index],quantity=number(tr.querySelector("[data-delivery-quantity]").value);
      if(quantity<=0) continue;
      const product=productMap.get(line.stockProductId);
      if(quantity>Math.max(0,number(line.quantity)-number(line.stockFulfilledQuantity))+0.000001){content.querySelector("#bill-delivery-error").textContent="La quantité livrée dépasse le reste à livrer.";return;}
      const lotCode=tr.querySelector("[data-delivery-lot]").value.trim();
      const serialNumbers=stockSerials(tr.querySelector("[data-delivery-serials]").value);
      if(product?.tracking==="lot"&&!lotCode){content.querySelector("#bill-delivery-error").textContent="Le code de lot est obligatoire pour "+product.name+".";return;}
      if(product?.tracking==="serial"&&(quantity!==Math.trunc(quantity)||serialNumbers.length!==quantity)){content.querySelector("#bill-delivery-error").textContent="Un numéro de série par unité entière est requis pour "+product.name+".";return;}
      rows[index]={quantity,lotCode,serialNumbers:serialNumbers.join(","),unit:line.stockUnit||product?.base_unit||"unité"};
      fulfilled.push({lineIndex:index,quantity});
    }
    if(!fulfilled.length){content.querySelector("#bill-delivery-error").textContent="Saisissez au moins une quantité à livrer.";return;}
    try {
      const built=invoiceStockLines(invoice,stockState,rows);
      const operation={operationUid:stockOperationUid(),documentDate:today(),note:"Livraison partielle ou totale de la facture "+invoice.number,lines:built.lines,fulfilled,kind:"delivery",sourceType:"sales_delivery",sourceId:String(invoice.id)+":"+((invoice.stockDocuments||[]).length+1)};
      const button=content.querySelector("#bill-delivery-submit");button.disabled=true;
      const result=await submitInvoiceStockOperation(invoice,stockState,operation);
      if(!result.ok){content.querySelector("#bill-delivery-error").textContent="Livraison non confirmée : "+(result.error?.message||"erreur inconnue")+". Vous pourrez réessayer sans créer de doublon.";button.disabled=false;return;}
      modal.close();renderList();toast("Livraison enregistrée dans le stock.");
    } catch(error) { content.querySelector("#bill-delivery-error").textContent=error.message; }
  });
  modal.showModal();
}

async function openEditor(type, source = null) {
  const billing = getBilling();
  let stockState = null;
  const stockEnabled = type === "invoice" && hasActiveStockCompany();
  if (stockEnabled) {
    try { stockState = await readCloudStock(); }
    catch (error) { toast("Impossible de charger les articles du stock : " + error.message, 6000); return; }
  }
  if (source?.stockPendingOperation || (source?.lines || []).some(line => number(line.stockFulfilledQuantity)>0)) {
    toast("Cette facture possède déjà des mouvements de stock. Sa modification est bloquée pour préserver l’historique.");
    return;
  }
  const settings = billing.settings;
  const customers = (store.thirds || []).filter((third) => ["client","customer","client/fournisseur"].includes(String(third.type || "").toLowerCase()));
  const defaultCountry = COUNTRIES.find((country) => country.code === store.settings.country);
  const defaultTax = settings.defaultTax == null ? (defaultCountry?.vatRates?.[0] || 0) : number(settings.defaultTax);
  const doc = source || { date: today(), dueDate: "", customerName: "", customerAddress: "", customerCountry: store.settings.country || "OTHER", currency: settings.currency || store.settings.currency, baseCurrency: store.settings.currency, exchangeRate: (settings.currency || store.settings.currency) === store.settings.currency ? 1 : "", taxLabel: settings.taxLabel, paymentTerms: settings.paymentTerms || "", notes: "", advanceRequested: 0, lines: [{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTax }] };
  const initialCustomerCountry = doc.customerCountry || store.settings.country || "OTHER";
  const title = source ? (type === "quote" ? "Modifier le devis" : "Modifier la facture") : (type === "quote" ? "Créer un devis" : "Créer une facture");
  const stockProducts = (stockState?.products || []).filter(product => product.active !== false && product.product_type !== "service");
  const stockWarehouses = (stockState?.warehouses || []).filter(warehouse => warehouse.active !== false);
  const stockOptions = (selected, items, label) => `<option value="">— ${label} —</option>` + items.map(item => `<option value="${esc(item.id)}" ${String(selected||"")===String(item.id)?"selected":""}>${esc(item.sku ? item.sku+" — "+item.name : item.name)}</option>`).join("");
  const lineMarkup = (line, index) => `<tr data-bill-line="${index}"><td><input data-line-field="description" value="${esc(line.description)}" placeholder="Produit ou prestation"></td><td><input data-line-field="quantity" type="number" min="0.0001" step="0.01" value="${number(line.quantity)}"></td><td><input data-line-field="unitPrice" type="number" min="0" step="0.01" value="${number(line.unitPrice)}"></td><td><input data-line-field="taxRate" type="number" min="0" step="0.01" value="${number(line.taxRate)}"></td><td class="num" data-line-total>—</td>${stockEnabled ? `<td><select data-line-field="stockProductId">${stockOptions(line.stockProductId,stockProducts,"Sans stock")}</select><select data-line-field="stockWarehouseId">${stockOptions(line.stockWarehouseId,stockWarehouses,"Entrepôt")}</select><select data-line-field="stockUnit"><option value="">Unité</option></select><input data-line-field="stockLotCode" value="${esc(line.stockLotCode||"")}" placeholder="Lot (si suivi)"><input data-line-field="stockSerialNumbers" value="${esc(line.stockSerialNumbers||"")}" placeholder="Séries : SN1, SN2"></td>` : ""}<td><button type="button" class="danger small" data-line-remove="${index}">×</button></td></tr>`;
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  content.innerHTML = `<h2>${title}</h2>
    <div class="grid cols-2"><div><label>Client</label><input id="bill-customer" list="bill-customer-list" value="${esc(doc.customerName)}" placeholder="Nom du client"><datalist id="bill-customer-list">${customers.map((customer) => `<option value="${esc(customer.name)}">`).join("")}</datalist></div><div><label>Date</label><input id="bill-date" type="date" value="${esc(doc.date)}"></div><div><label>Adresse du client</label><input id="bill-customer-address" value="${esc(doc.customerAddress)}"></div><div><label>Pays du client (propose sa devise)</label><input id="bill-country-search" type="search" placeholder="Rechercher un pays ou une devise"><select id="bill-customer-country">${COUNTRIES.map((country) => `<option value="${country.code}" ${country.code === initialCustomerCountry ? "selected" : ""}>${esc(country.name)} — ${esc(currencyOptionLabel(country.currency, store.settings.locale || "fr"))}</option>`).join("")}</select></div><div><label>Date d'échéance</label><input id="bill-due-date" type="date" value="${esc(doc.dueDate)}"></div>
    <div><label>Devise de facturation</label><select id="bill-currency">${[...new Set([...CURRENCIES, settings.currency, store.settings.currency])].sort().map((currency) => `<option value="${currency}" ${currency === doc.currency ? "selected" : ""}>${esc(currencyOptionLabel(currency, store.settings.locale || "fr"))}</option>`).join("")}</select></div><div><label>Devise comptable de l'entreprise</label><input value="${esc(store.settings.currency)}" readonly></div><div><label>Taux vers devise comptable (1 ${esc(doc.currency)} = ? ${esc(store.settings.currency)})</label><input id="bill-rate" type="number" min="0.00000001" step="0.00000001" value="${doc.exchangeRate == null || doc.exchangeRate === "" ? "" : number(doc.exchangeRate)}"></div><div><label>Libellé de taxe</label><input id="bill-tax-label" value="${esc(doc.taxLabel || settings.taxLabel)}"></div></div>
    <h3>Articles et prestations</h3>${stockEnabled ? '<p class="muted">Liez chaque ligne physique à un article et à un entrepôt. Les lignes non liées restent des prestations ou des lignes sans mouvement de stock.</p>' : ""}<div class="table-wrap"><table><thead><tr><th>Description</th><th>Quantité</th><th>Prix unitaire</th><th>Taxe %</th><th>Total</th>${stockEnabled ? "<th>Liaison stock / traçabilité</th>" : ""}<th></th></tr></thead><tbody id="bill-lines">${doc.lines.map(lineMarkup).join("")}</tbody></table></div><button type="button" class="secondary small" id="bill-add-line">Ajouter une ligne</button>
    <div id="bill-totals" class="calculator-result"></div>
    <div><label>${type === "quote" ? "Avance demandée" : source ? "Avance déjà encaissée" : "Avance reçue à la création"} (${esc(doc.currency)})</label><input id="bill-advance" type="number" min="0" step="0.01" value="${type === "quote" ? number(doc.advanceRequested) : source ? number(doc.paidAmount) : 0}" ${source && type === "invoice" ? "readonly" : ""}><small class="muted">${type === "quote" ? "Montant d'avance à demander au client ; ce n'est pas un paiement encaissé." : source ? "Les paiements déjà enregistrés sont conservés dans leur historique." : "Cette avance sera enregistrée comme un premier paiement de la facture."}</small></div>
    ${type === "invoice" && !source ? '<div><label>Mode d’encaissement de l’avance</label><select id="bill-advance-method"><option value="bank">Virement bancaire</option><option value="cash">Espèces</option><option value="mobile">Paiement mobile</option><option value="cheque">Chèque</option><option value="card">Carte bancaire</option><option value="other">Autre</option></select></div>' : ""}
    <label>Conditions de paiement</label><input id="bill-terms" value="${esc(doc.paymentTerms || settings.paymentTerms || "")}"><label>Notes / mentions</label><textarea id="bill-notes" rows="2">${esc(doc.notes || "")}</textarea>
    <div class="actions"><button type="button" id="bill-save">Enregistrer ${type === "quote" ? "le devis" : "la facture"}</button><button type="button" class="secondary" data-close>Annuler</button></div><div id="bill-error" class="errors" role="alert"></div>`;
  bindBillingModalClose(content);
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
    ...(stockEnabled ? {
      stockProductId:tr.querySelector('[data-line-field="stockProductId"]').value || null,
      stockWarehouseId:tr.querySelector('[data-line-field="stockWarehouseId"]').value || null,
      stockUnit:tr.querySelector('[data-line-field="stockUnit"]').value || "",
      stockLotCode:tr.querySelector('[data-line-field="stockLotCode"]').value.trim(),
      stockSerialNumbers:tr.querySelector('[data-line-field="stockSerialNumbers"]').value.trim(),
      stockFulfilledQuantity:number(doc.lines[Number(tr.dataset.billLine)]?.stockFulfilledQuantity),
    } : {}),
  }));
  const refreshTotals = () => {
    const lines = readLines();
    const result = totals(lines);
    content.querySelectorAll("#bill-lines tr").forEach((tr, index) => {
      const line = lines[index];
      const value = number(line.quantity) * number(line.unitPrice) * (1 + number(line.taxRate)/100);
      tr.querySelector("[data-line-total]").textContent = fmt(value,content.querySelector("#bill-currency").value,store.settings.locale);
    });
    const advance = number(content.querySelector("#bill-advance").value);
    const advanceLabel = type === "quote" ? "Avance demandée" : "Avance reçue";
    const remaining = Math.max(0, round(result.ttc - advance));
    content.querySelector("#bill-totals").innerHTML = `HT : <strong>${fmt(result.ht,content.querySelector("#bill-currency").value,store.settings.locale)}</strong> · Taxes : <strong>${fmt(result.tax,content.querySelector("#bill-currency").value,store.settings.locale)}</strong> · TTC : <strong>${fmt(result.ttc,content.querySelector("#bill-currency").value,store.settings.locale)}</strong><br>${advance > 0 ? `<small>${advanceLabel} : ${fmt(advance,content.querySelector("#bill-currency").value,store.settings.locale)} · Solde : ${fmt(remaining,content.querySelector("#bill-currency").value,store.settings.locale)}</small><br>` : ""}<small>Contre-valeur comptable : ${fmt(number(content.querySelector("#bill-rate").value) > 0 ? convertBillingAmount(result.ttc, number(content.querySelector("#bill-rate").value)) : 0,store.settings.currency,store.settings.locale)}</small>`;
  };
  const configureStockUnit = (tr, preferred = "") => {
    if (!stockEnabled) return;
    const productId=tr.querySelector('[data-line-field="stockProductId"]').value;
    const product=stockProducts.find(item=>item.id===productId);
    const select=tr.querySelector('[data-line-field="stockUnit"]');
    if(!select) return;
    const units=product ? [product.base_unit || "unité",...(stockState.unit_conversions||[]).filter(item=>item.product_id===product.id).map(item=>item.unit_code)] : [];
    select.innerHTML=units.map(unit=>`<option value="${esc(unit)}">${esc(unit)}</option>`).join("");
    select.disabled=!product;
    if(units.includes(preferred)) select.value=preferred;
    if(product?.tracking==="lot") tr.querySelector('[data-line-field="stockLotCode"]').placeholder="Lot obligatoire";
    else tr.querySelector('[data-line-field="stockLotCode"]').placeholder="Lot (facultatif)";
    if(product?.tracking==="serial") tr.querySelector('[data-line-field="stockSerialNumbers"]').placeholder="Un numéro par unité";
    else tr.querySelector('[data-line-field="stockSerialNumbers"]').placeholder="Séries (facultatif)";
  };
  const bindRows = () => {
    content.querySelectorAll("#bill-lines input").forEach((input) => input.addEventListener("input", refreshTotals));
    if(stockEnabled) content.querySelectorAll('[data-line-field="stockProductId"]').forEach(select=>{
      configureStockUnit(select.closest("tr"),doc.lines[Number(select.closest("tr").dataset.billLine)]?.stockUnit || "");
      select.addEventListener("change",()=>configureStockUnit(select.closest("tr")));
    });
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
  content.querySelector("#bill-advance").addEventListener("input", refreshTotals);
  content.querySelector("#bill-save").addEventListener("click", () => {
    const lines = readLines();
    const errors = [];
    if (source && type === "invoice" && store.entries.some(entry => entry.reference === "FACTURE " + String(source.number || source.id))) {
      content.querySelector("#bill-error").textContent = "Cette facture est déjà comptabilisée. Sa modification est bloquée pour préserver la cohérence entre le document et les journaux. Une procédure de rectification ou d'avoir sera nécessaire.";
      return;
    }
    if (!content.querySelector("#bill-customer").value.trim()) errors.push("Le nom du client est obligatoire.");
    if (!content.querySelector("#bill-date").value) errors.push("La date est obligatoire.");
    if (!lines.length || lines.some((line) => !line.description || line.quantity <= 0 || line.unitPrice < 0 || line.taxRate < 0)) errors.push("Chaque ligne doit avoir une description, une quantité positive, un prix et un taux valides.");
    const rate = number(content.querySelector("#bill-rate").value);
    if (!(rate > 0)) errors.push("Le taux de conversion doit être supérieur à zéro.");
    const draftForValidation = { type, date: content.querySelector("#bill-date").value, customerName: content.querySelector("#bill-customer").value, currency: content.querySelector("#bill-currency").value, exchangeRate: rate, lines };
    errors.push(...validateBillingDocument(draftForValidation).errors);
    if (errors.length) { content.querySelector("#bill-error").textContent = [...new Set(errors)].join(" "); return; }
    const totalsValue = totals(lines);
    const advance = number(content.querySelector("#bill-advance").value);
    if (!Number.isFinite(advance) || advance < 0) {
      content.querySelector("#bill-error").textContent = "Le montant de l'avance ne peut pas être négatif.";
      return;
    }
    if (advance > totalsValue.ttc + 0.001) {
      content.querySelector("#bill-error").textContent = "L'avance ne peut pas dépasser le total TTC du document.";
      return;
    }
    const saved = {
      ...(source || {}),
      id: source ? source.id : billing.nextId++,
      type,
      number: source ? source.number : nextNumber(type,settings),
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
      lines,
      totals: totalsValue,
      advanceRequested: type === "quote" ? advance : (source ? number(source.advanceRequested) : 0),
      paidAmount: source ? number(source.paidAmount) : 0,
      payments: source && Array.isArray(source.payments) ? source.payments : [],
      status: source ? source.status : "issued",
      createdAt: source ? source.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!source && type === "invoice" && advance > 0) {
      saved.payments = [{
        id: billing.nextPaymentId++,
        date: saved.date,
        amount: advance,
        method: content.querySelector("#bill-advance-method").value,
        reference: "",
        notes: "Avance reçue lors de la création de la facture.",
        currency: saved.currency,
        exchangeRate: saved.exchangeRate,
        createdAt: new Date().toISOString(),
      }];
      saved.paidAmount = advance;
      saved.status = advance + 0.001 >= saved.totals.ttc ? "paid" : "partially_paid";
    }
    if (source && type === "invoice" && saved.totals.ttc + 0.001 < saved.paidAmount) {
      content.querySelector("#bill-error").textContent = "Le total de la facture ne peut pas être inférieur aux paiements déjà enregistrés.";
      return;
    }
    if (source) {
      const index = billing.documents.findIndex((item) => item.id === source.id);
      if (index < 0) {
        content.querySelector("#bill-error").textContent = "Ce document n'existe plus. Fermez puis actualisez la liste.";
        return;
      }
      billing.documents[index] = saved;
    } else {
      billing.documents.push(saved);
    }
    const accountingResult = type === "invoice" ? postInvoiceAccounting(saved) : null;
    saveBilling();
    modal.close();
    renderList();
    if (accountingResult && !accountingResult.ok) toast("Document enregistré, mais comptabilisation à configurer : " + accountingResult.errors[0], 5500);
    else toast(source ? (type === "quote" ? "Devis modifié." : "Facture modifiée et comptabilisée.") : (type === "quote" ? "Devis enregistré." : "Facture enregistrée et comptabilisée."));
  });
  refreshTotals();
  modal.showModal();
}


function openPaymentManager(invoiceId) {
  const billing = getBilling();
  const invoice = billing.documents.find((doc) => doc.id === invoiceId && doc.type === "invoice");
  if (!invoice) return;
  if (!Array.isArray(invoice.payments)) invoice.payments = [];
  const content = document.getElementById("modal-content");
  const modal = document.getElementById("modal");
  const total = number(invoice.totals?.ttc);
  const paid = round(invoice.payments.reduce((sum, payment) => sum + number(payment.amount), 0));
  const balance = calculatePaymentBalance(total, invoice.payments);
  const methods = [["bank", "Virement bancaire"], ["cash", "Espèces"], ["mobile", "Paiement mobile"], ["cheque", "Chèque"], ["card", "Carte bancaire"], ["other", "Autre"]];
  const methodLabel = (value) => methods.find(([key]) => key === value)?.[1] || (value === "legacy" ? "Ancien règlement" : value || "—");
  const paymentRows = invoice.payments.map((payment) => "<tr><td>" + esc(payment.date || "—") + "</td><td>" + esc(methodLabel(payment.method)) + "</td><td>" + esc(payment.reference || "—") + "</td><td class=\"num\">" + fmt(payment.amount, invoice.currency, store.settings.locale) + "</td><td>" + esc(payment.notes || "") + "</td><td><button type=\"button\" class=\"secondary small\" data-bill-payment-edit=\"" + Number(payment.id) + "\">Modifier</button> <button type=\"button\" class=\"danger small\" data-bill-payment-cancel=\"" + Number(payment.id) + "\">Annuler le règlement</button></td></tr>").join("");
  const auditRows = (invoice.paymentHistory || []).slice().reverse().map((event) => {
    const previous = event.previous || {};
    const updated = event.updated || {};
    const amount = event.action === "modification" ? fmt(previous.amount, invoice.currency, store.settings.locale) + " → " + fmt(updated.amount, invoice.currency, store.settings.locale) : fmt(previous.amount, invoice.currency, store.settings.locale);
    return "<tr><td>" + esc(event.date || "—") + "</td><td>" + (event.action === "modification" ? "Modification" : "Annulation") + "</td><td>" + esc(previous.date || "—") + "</td><td class=\"num\">" + amount + "</td><td>" + esc(event.note || "") + "</td></tr>";
  }).join("");
  content.innerHTML = "<h2>Règlements — " + esc(invoice.number) + "</h2><p><strong>Client :</strong> " + esc(invoice.customerName) + "</p>" +
    "<div class=\"grid cols-3\"><section class=\"card kpi\"><div class=\"label\">Total facture</div><div class=\"value\">" + fmt(total, invoice.currency, store.settings.locale) + "</div></section><section class=\"card kpi\"><div class=\"label\">Déjà réglé</div><div class=\"value\">" + fmt(paid, invoice.currency, store.settings.locale) + "</div></section><section class=\"card kpi\"><div class=\"label\">Reste à payer</div><div class=\"value\">" + fmt(balance, invoice.currency, store.settings.locale) + "</div></section></div>" +
    "<h3>Historique des paiements actifs</h3><div class=\"table-wrap\"><table><thead><tr><th>Date</th><th>Mode</th><th>Référence</th><th class=\"num\">Montant</th><th>Note</th><th>Actions</th></tr></thead><tbody>" + (paymentRows || "<tr><td colspan=\"6\" class=\"muted\">Aucun paiement enregistré.</td></tr>") + "</tbody></table></div>" +
     "<h3>Historique des corrections et annulations</h3><div class=\"table-wrap\"><table><thead><tr><th>Date opération</th><th>Action</th><th>Date du règlement</th><th class=\"num\">Montant concerné</th><th>Détail</th></tr></thead><tbody>" + (auditRows || "<tr><td colspan=\"5\" class=\"muted\">Aucune correction ni annulation.</td></tr>") + "</tbody></table></div>" +
    (balance > 0 ? "<h3>Enregistrer un paiement</h3><div class=\"grid cols-2\"><div><label>Date du paiement</label><input id=\"bill-payment-date\" type=\"date\" value=\"" + today() + "\"></div><div><label>Montant (" + esc(invoice.currency) + ")</label><input id=\"bill-payment-amount\" type=\"number\" min=\"0.01\" max=\"" + balance + "\" step=\"0.01\" value=\"" + balance + "\"></div><div><label>Mode de paiement</label><select id=\"bill-payment-method\">" + methods.map(([key, label]) => "<option value=\"" + key + "\">" + label + "</option>").join("") + "</select></div><div><label>Taux de change vers " + esc(invoice.baseCurrency || store.settings.currency) + " (1 " + esc(invoice.currency) + " = ?)</label><input id=\"bill-payment-rate\" type=\"number\" min=\"0.00000001\" step=\"0.00000001\" value=\"" + number(invoice.exchangeRate) + "\"></div><div><label>Référence / numéro de transaction</label><input id=\"bill-payment-reference\" maxlength=\"120\"></div></div><label>Note (facultatif)</label><textarea id=\"bill-payment-notes\" rows=\"2\"></textarea><div id=\"bill-payment-error\" class=\"errors\" role=\"alert\"></div><div class=\"actions\"><button id=\"bill-payment-save\">Enregistrer le paiement</button></div>" : "<p class=\"ok-msg\">Cette facture est entièrement réglée.</p>") +
    "<div class=\"actions\"><button class=\"secondary\" data-close>Fermer</button></div>";
  bindBillingModalClose(content);
  content.querySelectorAll("[data-bill-payment-edit]").forEach((button) => button.addEventListener("click", () => {
    const paymentId = Number(button.dataset.billPaymentEdit);
    const original = invoice.payments.find((item) => Number(item.id) === paymentId);
    if (!original) return;
    const editable = { ...original };
    content.innerHTML = "<h2>Modifier l'avance / le règlement</h2>" +
      "<p><strong>Facture :</strong> " + esc(invoice.number) + " — " + esc(invoice.customerName) + "</p>" +
      "<div class=\"grid cols-2\"><div><label>Date du paiement</label><input id=\"bill-edit-payment-date\" type=\"date\" value=\"" + esc(editable.date || today()) + "\"></div>" +
      "<div><label>Montant (" + esc(invoice.currency) + ")</label><input id=\"bill-edit-payment-amount\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"" + number(editable.amount) + "\"></div>" +
      "<div><label>Mode de paiement</label><select id=\"bill-edit-payment-method\">" + methods.map(([key,label]) => "<option value=\"" + key + "\" " + (editable.method === key ? "selected" : "") + ">" + label + "</option>").join("") + (editable.method === "legacy" ? "<option value=\"bank\" selected>Virement bancaire</option>" : "") + "</select></div>" +
      "<div><label>Taux de change vers " + esc(invoice.baseCurrency || store.settings.currency) + "</label><input id=\"bill-edit-payment-rate\" type=\"number\" min=\"0.00000001\" step=\"0.00000001\" value=\"" + number(editable.exchangeRate == null ? invoice.exchangeRate : editable.exchangeRate) + "\"></div>" +
      "<div><label>Référence / numéro de transaction</label><input id=\"bill-edit-payment-reference\" maxlength=\"120\" value=\"" + esc(editable.reference || "") + "\"></div></div>" +
      "<label>Note</label><textarea id=\"bill-edit-payment-notes\" rows=\"2\">" + esc(editable.notes || "") + "</textarea>" +
      "<div id=\"bill-edit-payment-error\" class=\"errors\" role=\"alert\"></div><div class=\"actions\"><button type=\"button\" id=\"bill-edit-payment-save\">Enregistrer les modifications</button><button type=\"button\" class=\"secondary\" id=\"bill-edit-payment-cancel\">Retour</button></div>";
    content.querySelector("#bill-edit-payment-cancel").addEventListener("click", () => { modal.close(); openPaymentManager(invoiceId); });
    content.querySelector("#bill-edit-payment-save").addEventListener("click", () => {
      const updated = {
        ...editable,
        date: content.querySelector("#bill-edit-payment-date").value,
        amount: number(content.querySelector("#bill-edit-payment-amount").value),
        method: content.querySelector("#bill-edit-payment-method").value,
        exchangeRate: number(content.querySelector("#bill-edit-payment-rate").value),
        reference: content.querySelector("#bill-edit-payment-reference").value.trim(),
        notes: content.querySelector("#bill-edit-payment-notes").value.trim(),
        currency: invoice.currency,
      };
      const otherPayments = invoice.payments.filter((item) => Number(item.id) !== paymentId);
      const validation = validateBillingPayment(updated, invoice, otherPayments);
      if (!(updated.exchangeRate > 0) || !Number.isFinite(updated.exchangeRate)) validation.errors.push("Le taux de change du règlement doit être supérieur à zéro.");
      if (!validation.ok) { content.querySelector("#bill-edit-payment-error").textContent = [...new Set(validation.errors)].join(" "); return; }

      const oldReference = "REGLEMENT " + String(invoice.number || invoice.id) + " #" + String(original.id);
      const oldEntry = (store.entries || []).find((entry) => entry.reference === oldReference && !entry.reversed);
      const nextId = billing.nextPaymentId++;
      const replacement = { ...updated, id: nextId, updatedAt: new Date().toISOString() };
      const index = invoice.payments.findIndex((item) => Number(item.id) === paymentId);
      invoice.payments[index] = replacement;
      const proposal = buildBillingJournalEntries(store, invoice, getBilling().settings.accountingAccounts || {});
      if (!proposal.ok) {
        invoice.payments[index] = original;
        billing.nextPaymentId = Math.max(1, billing.nextPaymentId - 1);
        content.querySelector("#bill-edit-payment-error").textContent = "Modification impossible : " + proposal.errors[0];
        return;
      }
      if (oldEntry) {
        const reversed = reverseEntry(store, oldEntry.id, today());
        if (!reversed.ok) {
          invoice.payments[index] = original;
          billing.nextPaymentId = Math.max(1, billing.nextPaymentId - 1);
          content.querySelector("#bill-edit-payment-error").textContent = "L'ancienne écriture n'a pas pu être contrepassée : " + reversed.errors[0];
          return;
        }
      }
      const accountingResult = postInvoiceAccounting(invoice);
      if (!accountingResult.ok) {
        invoice.payments[index] = original;
        content.querySelector("#bill-edit-payment-error").textContent = "L'écriture corrigée n'a pas pu être générée : " + accountingResult.errors[0] + ". L'ancienne écriture a été contrepassée ; demandez une vérification comptable avant toute nouvelle correction.";
        saveBilling();
        return;
      }
      invoice.paymentHistory ||= [];
      invoice.paymentHistory.push({
        eventId: globalThis.crypto?.randomUUID?.() || ("payment-event-" + Date.now() + "-" + Math.random().toString(36).slice(2)),
        action: "modification",
        date: today(),
        paymentId,
        previous: { ...original },
        updated: { ...replacement },
        note: "Règlement modifié ; ancienne écriture contrepassée et nouvelle écriture comptabilisée.",
        createdAt: new Date().toISOString(),
      });
      invoice.paidAmount = round(invoice.payments.reduce((sum, item) => sum + number(item.amount), 0));
      invoice.status = calculatePaymentBalance(total, invoice.payments) <= 0 ? "paid" : invoice.paidAmount > 0 ? "partially_paid" : "issued";
      saveBilling();
      toast("Paiement modifié ; l'ancienne écriture a été contrepassée et la nouvelle comptabilisée.");
      modal.close();
      renderList();
    });
  }));
  content.querySelectorAll("[data-bill-payment-cancel]").forEach((button) => button.addEventListener("click", () => {
    const paymentId = Number(button.dataset.billPaymentCancel);
    const payment = invoice.payments.find((item) => Number(item.id) === paymentId);
    if (!payment) return;
    if (!window.confirm("Annuler ce règlement de " + fmt(payment.amount, invoice.currency, store.settings.locale) + " ? Le règlement sera conservé dans l'historique et son écriture comptable sera contrepassée si elle existe.")) return;
    const reference = "REGLEMENT " + String(invoice.number || invoice.id) + " #" + String(payment.id);
    const entry = (store.entries || []).find((item) => item.reference === reference && !item.reversed);
    if (entry) {
      const reversed = reverseEntry(store, entry.id, today());
      if (!reversed.ok) return toast("Annulation impossible : " + reversed.errors[0], 5500);
    }
    invoice.payments = invoice.payments.filter((item) => Number(item.id) !== paymentId);
    invoice.paymentHistory ||= [];
    invoice.paymentHistory.push({
      eventId: globalThis.crypto?.randomUUID?.() || ("payment-event-" + Date.now() + "-" + Math.random().toString(36).slice(2)),
      action: "annulation",
      date: today(),
      paymentId,
      previous: { ...payment },
      note: entry ? "Règlement annulé ; écriture comptable contrepassée." : "Règlement annulé ; aucune écriture comptable active à contrepasser.",
      createdAt: new Date().toISOString(),
    });
    invoice.paidAmount = round(invoice.payments.reduce((sum, item) => sum + number(item.amount), 0));
    invoice.status = calculatePaymentBalance(total, invoice.payments) <= 0 ? "paid" : invoice.paidAmount > 0 ? "partially_paid" : "issued";
    saveBilling();
    toast("Règlement annulé. La trace est conservée dans l'historique.");
    modal.close();
    renderList();
  }));
  if (balance > 0) content.querySelector("#bill-payment-save").addEventListener("click", () => {
    const payment = {
      date: content.querySelector("#bill-payment-date").value,
      amount: number(content.querySelector("#bill-payment-amount").value),
      method: content.querySelector("#bill-payment-method").value,
      reference: content.querySelector("#bill-payment-reference").value.trim(),
      notes: content.querySelector("#bill-payment-notes").value.trim(),
      currency: invoice.currency,
      exchangeRate: number(content.querySelector("#bill-payment-rate").value),
    };
    const validation = validateBillingPayment(payment, invoice, invoice.payments);
    if (!(payment.exchangeRate > 0) || !Number.isFinite(payment.exchangeRate)) validation.errors.push("Le taux de change du règlement doit être supérieur à zéro.");
    if (!validation.ok) { content.querySelector("#bill-payment-error").textContent = validation.errors.join(" "); return; }
    invoice.payments.push({ id: billing.nextPaymentId++, ...payment, createdAt: new Date().toISOString() });
    invoice.paidAmount = round(invoice.payments.reduce((sum, item) => sum + number(item.amount), 0));
    invoice.status = calculatePaymentBalance(total, invoice.payments) <= 0 ? "paid" : "partially_paid";
    const accountingResult = postInvoiceAccounting(invoice);
    saveBilling();
    modal.close();
    renderList();
    if (accountingResult && !accountingResult.ok) toast("Paiement enregistré, mais écriture non générée : " + accountingResult.errors[0], 5500);
    else toast("Paiement enregistré et comptabilisé.");
  });
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
  const accountingResult = postInvoiceAccounting(invoice);
  saveBilling();
  renderList();
  if (accountingResult && !accountingResult.ok) toast("Facture créée, comptabilisation à configurer : " + accountingResult.errors[0], 5500);
  else toast("Devis converti en facture et comptabilisé.");
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

  const billingAccounts = [...new Map([...planAccounts, ...(companySettings.customAccounts || [])].map(account => [String(account.code), account])).values()];
  const accountSelect = (key, type, label) => {
    const selected = settings.accountingAccounts?.[key] || "";
    const options = billingAccounts.filter(account => account.type === type)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), "fr", { numeric: true }))
      .map(account => `<option value="${esc(account.code)}" ${String(account.code) === String(selected) ? "selected" : ""}>${esc(account.code)} — ${esc(account.label)}</option>`).join("");
    return `<div><label for="bill-account-${key}">${label}</label><select id="bill-account-${key}"><option value="">— Choisir un compte —</option>${options}</select></div>`;
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
    <h3>Comptabilisation automatique</h3>
    <p class="muted">Choisissez les comptes de votre plan comptable. Une facture génère une écriture de vente ; chaque règlement génère une écriture de trésorerie. Le compte de taxe n'est exigé que si la facture comporte une taxe.</p>
    <div class="grid cols-2">
      ${accountSelect("customer", "asset", "Compte client (créance)")}
      ${accountSelect("revenue", "income", "Compte de ventes / produits")}
      ${accountSelect("tax", "liability", "Compte de taxe collectée")}
      ${accountSelect("bank", "asset", "Compte bancaire")}
      ${accountSelect("cash", "asset", "Compte de caisse")}
      ${accountSelect("fxGain", "income", "Compte de gains de change")}
      ${accountSelect("fxLoss", "expense", "Compte de pertes de change")}
    </div>
    <p class="muted">Les comptes proposés par défaut sont des suggestions à vérifier selon le plan comptable, l'activité et les règles fiscales de votre entreprise. Les comptes de gains et pertes de change ne sont nécessaires que si le taux du règlement diffère de celui de la facture ; si aucun compte adapté n'est proposé par votre plan, créez ou sélectionnez un compte conforme à votre référentiel avant de saisir un taux différent.</p>
    <p class="muted">Les taux proposés sont des valeurs indicatives du profil pays. Vérifiez les règles fiscales applicables avant émission. Les paramètres n'attestent pas à eux seuls d'une conformité légale nationale.</p>
    <div class="actions"><button id="bill-settings-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  bindBillingModalClose(content);

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
    settings.accountingAccounts = Object.fromEntries(["customer", "revenue", "tax", "bank", "cash", "fxGain", "fxLoss"].map(key => [
      key, content.querySelector("#bill-account-" + key).value,
    ]));
    saveBilling();
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
