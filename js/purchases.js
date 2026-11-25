// MIZANE — Module Achats : fournisseurs, commandes, factures et réceptions partielles.
// Les données métier suivent la synchronisation cloud de la facturation ; les entrées physiques
// passent exclusivement par le moteur de stock serveur et ses identifiants idempotents.
import { store, $app, saveNow, esc, toast } from "./state.js";
import { hasActiveStockCompany, readCloudStock, postCloudStockDocument } from "./cloud-sync.js";
import { planSupplierInvoiceReceiptAllocation } from "./purchase-receipts.js";
import { findDuplicateSupplierInvoice, validateSupplierInvoiceMetadata } from "./purchase-validation.js";
import { buildSupplierInvoiceJournalEntry, postSupplierInvoiceJournalEntry, buildSupplierPaymentJournalEntry, postSupplierPaymentJournalEntry } from "./purchase-accounting.js";
import { buildSupplierCreditNoteJournalEntry, postSupplierCreditNoteJournalEntry, planSupplierMultiInvoiceReconciliation, postSupplierMultiInvoicePaymentJournalEntry } from "./purchase-credit-notes.js";
import { supplierInvoiceTaxBreakdown } from "./purchase-tax.js";

const today = () => new Date().toISOString().slice(0, 10);
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round((num(value) + Number.EPSILON) * 10000) / 10000;
const uuid = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error("Ce navigateur ne permet pas de sécuriser l'identifiant de l'opération.");
  return globalThis.crypto.randomUUID();
};
const money = value => num(value).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let stockState = null;
let renderToken = 0;
const activeReceiptOperations = new Set();

function data() {
  if (!store.billing || typeof store.billing !== "object") store.billing = { documents: [], settings: {} };
  if (!store.billing.purchases || typeof store.billing.purchases !== "object") {
    store.billing.purchases = { suppliers: [], documents: [], nextId: 1, nextSupplierId: 1, nextOrderNumber: 1, nextInvoiceNumber: 1 };
  }
  const p = store.billing.purchases;
  p.suppliers ||= [];
  p.documents ||= [];
  p.nextId = Math.max(1, Number(p.nextId) || 1);
  p.nextSupplierId = Math.max(1, Number(p.nextSupplierId) || 1);
  p.nextOrderNumber = Math.max(1, Number(p.nextOrderNumber) || 1);
  p.nextInvoiceNumber = Math.max(1, Number(p.nextInvoiceNumber) || 1);
  p.nextPaymentId = Math.max(1, Number(p.nextPaymentId) || 1);
  for (const invoice of p.documents.filter(item => item.type === "invoice")) { invoice.payments ||= []; for (const payment of invoice.payments) p.nextPaymentId = Math.max(p.nextPaymentId, num(payment.id) + 1); }
  return p;
}
function persist(message) {
  saveNow();
  window.dispatchEvent(new Event("mizane:billing-changed"));
  if (message) toast(message);
}
function modal(html) {
  const dialog = document.getElementById("modal");
  const box = document.getElementById("modal-content");
  box.innerHTML = html;
  box.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.showModal();
  return { dialog, box };
}
function supplierName(id) {
  return data().suppliers.find(item => String(item.id) === String(id))?.name || "Fournisseur inconnu";
}
function supplierInvoicePayable(invoice) { const tax=supplierInvoiceTaxBreakdown(invoice); return tax.ok ? tax.payable : round(num(invoice?.total)); }
function supplierInvoicePaid(invoice) { return round((invoice?.payments||[]).reduce((sum,payment)=>sum+num(payment.amount),0)); }
function supplierInvoiceBalance(invoice) { const credited=round((invoice?.creditNotes||[]).reduce((sum,note)=>sum+num(note.payableAmount??note.total),0)); return Math.max(0,round(supplierInvoicePayable(invoice)-supplierInvoicePaid(invoice)-credited)); }
function openSupplierMultiInvoiceReconciliation() {
  const p=data();
  const invoices=p.documents.filter(invoice=>invoice.type==="invoice"&&invoice.status==="validated"&&invoice.accountingPostedAt&&supplierInvoiceBalance(invoice)>0.001);
  if(invoices.length<2) return toast("Il faut au moins deux factures fournisseurs validées avec un solde dû.");
  const {box}=modal(`<h2>Règlement groupé de factures fournisseurs</h2>
    <p class="muted">Cette opération comptabilise un seul décaissement bancaire ou de caisse, puis l'affecte aux factures sélectionnées. Les écarts de change sont comptabilisés séparément.</p>
    <div class="grid cols-2">
      <div><label>Date du paiement</label><input id="psmr-date" type="date" value="${today()}"></div>
      <div><label>Référence bancaire / caisse</label><input id="psmr-reference" maxlength="120" required></div>
      <div><label>Montant total payé</label><input id="psmr-amount" type="number" min="0.01" step="0.01"></div>
      <div><label>Tolérance d'ajustement</label><input id="psmr-tolerance" type="number" min="0" step="0.01" value="0"><small class="muted">Si elle est utilisée, l'écart est appliqué à la dernière facture sélectionnée pour équilibrer exactement le règlement.</small></div>
      <div><label>Mode de paiement</label><select id="psmr-method"><option value="bank">Banque / virement</option><option value="cash">Caisse / espèces</option></select></div>
      <div><label>Taux de conversion du paiement</label><input id="psmr-rate" type="number" min="0.000001" step="0.000001" value="1"></div>
      <div><label>Compte bancaire / caisse</label><select id="psmr-treasury">${accountOptions("asset","","treasury")}</select></div>
      <div><label>Perte de change</label><select id="psmr-fx-loss">${accountOptions("expense")}</select></div>
      <div><label>Gain de change</label><select id="psmr-fx-gain">${accountOptions("income")}</select></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Choisir</th><th>Facture</th><th>Fournisseur</th><th>Devise</th><th>Solde dû</th><th>Affectation</th></tr></thead><tbody>${invoices.map(invoice=>`<tr data-reconcile-invoice="${invoice.id}"><td><input type="checkbox" class="psmr-check"></td><td>${esc(invoice.number)}</td><td>${esc(supplierName(invoice.supplierId))}</td><td>${esc(invoice.currency||"MAD")}</td><td>${money(supplierInvoiceBalance(invoice))}</td><td><input class="psmr-allocation" type="number" min="0" max="${supplierInvoiceBalance(invoice)}" step="0.01" value="0" disabled></td></tr>`).join("")}</tbody></table></div>
    <div id="psmr-error" class="errors"></div><div class="actions"><button id="psmr-save">Comptabiliser le règlement groupé</button><button class="secondary" data-close>Annuler</button></div>`);
  box.querySelectorAll("[data-reconcile-invoice]").forEach(row=>row.querySelector(".psmr-check").addEventListener("change",event=>{
    const input=row.querySelector(".psmr-allocation");
    input.disabled=!event.target.checked;
    if(event.target.checked&&num(input.value)<=0) input.value=String(Math.min(supplierInvoiceBalance(invoices.find(item=>String(item.id)===row.dataset.reconcileInvoice)),num(box.querySelector("#psmr-amount").value)));
  }));
  box.querySelector("#psmr-amount").addEventListener("input",()=>{
    const selected=[...box.querySelectorAll("[data-reconcile-invoice]")].filter(row=>row.querySelector(".psmr-check").checked);
    if(selected.length===1&&num(selected[0].querySelector(".psmr-allocation").value)<=0) selected[0].querySelector(".psmr-allocation").value=box.querySelector("#psmr-amount").value;
  });
  box.querySelector("#psmr-save").addEventListener("click",()=>{
    const error=box.querySelector("#psmr-error");
    const reference=box.querySelector("#psmr-reference").value.trim();
    if(!reference){error.textContent="La référence du paiement est obligatoire.";return;}
    p.reconciliations ||= [];
    if(p.reconciliations.some(item=>String(item.reference||"").toLowerCase()===reference.toLowerCase())){error.textContent="Cette référence de paiement est déjà rapprochée.";return;}
    const allocations=[...box.querySelectorAll("[data-reconcile-invoice]")].filter(row=>row.querySelector(".psmr-check").checked).map(row=>({invoiceId:String(row.dataset.reconcileInvoice),amount:num(row.querySelector(".psmr-allocation").value)}));
    const first=allocations.length?invoices.find(item=>String(item.id)===String(allocations[0].invoiceId)):null;
    const payment={date:box.querySelector("#psmr-date").value,reference,amount:num(box.querySelector("#psmr-amount").value),currency:first?.currency||"MAD",method:box.querySelector("#psmr-method").value,exchangeRate:num(box.querySelector("#psmr-rate").value)};
    const tolerance=num(box.querySelector("#psmr-tolerance").value);
    const plan=planSupplierMultiInvoiceReconciliation(invoices,allocations,payment,{tolerance});
    if(!plan.ok){error.textContent=plan.errors.join(" ");return;}
    // A tolerance may absorb only a small rounding difference. Adjust the final allocation explicitly before posting.
    const normalized=allocations.map(item=>({...item}));
    if(Math.abs(plan.difference)>0.001){
      const last=normalized[normalized.length-1];
      const invoice=invoices.find(item=>String(item.id)===String(last.invoiceId));
      const adjusted=round(last.amount+plan.difference);
      if(!(adjusted>0)||adjusted>supplierInvoiceBalance(invoice)+0.001){error.textContent="La tolérance ne peut pas être absorbée par la dernière facture sélectionnée. Corrigez les affectations.";return;}
      last.amount=adjusted;
    }
    const groupId=uuid();
    const mapping={treasury:box.querySelector("#psmr-treasury").value,fxLoss:box.querySelector("#psmr-fx-loss").value,fxGain:box.querySelector("#psmr-fx-gain").value};
    const posted=postSupplierMultiInvoicePaymentJournalEntry(store,invoices,normalized,payment,mapping);
    if(!posted.ok){error.textContent=(posted.errors||["Comptabilisation du règlement refusée."]).join(" ");return;}
    const entry=(store.entries||[]).find(item=>item.reference==="REGLEMENT GROUPE FOURNISSEUR "+reference);
    for(const allocation of posted.allocations){
      const invoice=invoices.find(item=>String(item.id)===String(allocation.invoiceId));
      invoice.payments ||= [];
      invoice.payments.push({id:p.nextPaymentId++,groupId,date:payment.date,amount:allocation.amount,method:payment.method,exchangeRate:payment.exchangeRate,treasury:mapping.treasury,fxLoss:mapping.fxLoss,fxGain:mapping.fxGain,reference,status:"posted",entryId:entry?.id||null,createdAt:new Date().toISOString()});
    }
    p.reconciliations.push({id:groupId,...plan,total:posted.summary.total,difference:0,allocations:posted.allocations,date:payment.date,reference,amount:payment.amount,currency:payment.currency,method:payment.method,exchangeRate:payment.exchangeRate,status:"posted",entryId:entry?.id||null,createdAt:new Date().toISOString()});
    persist("Règlement groupé comptabilisé et affecté aux factures.");
    box.closest("dialog").close();
    renderList();
  });
}
function openSupplierCreditNote(invoice) {
  const breakdown=supplierInvoiceTaxBreakdown(invoice);
  const detailed=Array.isArray(invoice.lines)&&invoice.lines.length>0&&breakdown.ok;
  const rows=detailed?breakdown.lines.map((line,index)=>{
    const kind=line.lineType==="service"?"Service":line.lineType==="fixed_asset"?"Immobilisation":"Marchandise";
    const item=product(line.productId);
    const label=line.description||item?.name||"Article";
    return `<tr><td>${index+1}</td><td>${kind} — ${esc(label)}</td><td>${money(line.amount)}</td><td>${line.taxRate}%</td><td><input class="pscn-line-amount" data-line-index="${index}" type="number" min="0" max="${line.amount}" step="0.01" value="0"></td></tr>`;
  }).join(""):"";
  const {box}=modal(`<h2>Avoir fournisseur — ${esc(invoice.number)}</h2>
    <p>Fournisseur : ${esc(supplierName(invoice.supplierId))} · Solde dû : <strong>${money(supplierInvoiceBalance(invoice))} ${esc(invoice.currency||"")}</strong></p>
    <div class="grid cols-2"><div><label>Date de l'avoir</label><input id="pscn-date" type="date" value="${today()}"></div><div><label>Référence de l'avoir</label><input id="pscn-number" maxlength="80" required></div></div>
    ${detailed?'<h3>Lignes à corriger</h3><div class="table-wrap"><table><thead><tr><th>N°</th><th>Nature / désignation</th><th>HT d’origine</th><th>TVA</th><th>HT à créditer</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted">Saisissez le montant HT à créditer pour chaque ligne. La TVA reprend automatiquement le taux de la ligne d'origine.</p>':'<label>Montant HT de l’avoir</label><input id="pscn-total" type="number" min="0.01" step="0.01" required>'}
    <label>Motif</label><textarea id="pscn-reason" maxlength="500"></textarea>
    <div id="pscn-error" class="errors"></div><div class="actions"><button id="pscn-save">Comptabiliser l'avoir</button><button class="secondary" data-close>Annuler</button></div>`);
  box.querySelector("#pscn-save").addEventListener("click",()=>{
    const p=data(), number=box.querySelector("#pscn-number").value.trim();
    const allocations=detailed?[...box.querySelectorAll(".pscn-line-amount")].map(input=>({lineIndex:Number(input.dataset.lineIndex),amount:num(input.value)})).filter(item=>item.amount>0):null;
    const total=detailed?round(allocations.reduce((sum,item)=>sum+item.amount,0)):num(box.querySelector("#pscn-total").value);
    if(!number||!(total>0)){box.querySelector("#pscn-error").textContent="La référence et un montant HT positif sont obligatoires.";return;}
    invoice.creditNotes||=[];
    if(invoice.creditNotes.some(item=>String(item.number).toLowerCase()===number.toLowerCase())){box.querySelector("#pscn-error").textContent="Cette référence d'avoir existe déjà sur la facture.";return;}
    const creditNote={id:p.nextCreditNoteId||1,number,date:box.querySelector("#pscn-date").value,total,reason:box.querySelector("#pscn-reason").value.trim(),createdAt:new Date().toISOString(),...(detailed?{lines:allocations}:{})};
    const mode=stockState?.settings?.accountingMode||"perpetual";
    const proposal=buildSupplierCreditNoteJournalEntry(store,invoice,creditNote,mode);
    if(!proposal.ok){box.querySelector("#pscn-error").textContent=proposal.errors.join(" ");return;}
    const posted=postSupplierCreditNoteJournalEntry(store,invoice,creditNote,mode);
    if(!posted.ok){box.querySelector("#pscn-error").textContent=(posted.errors||["Comptabilisation refusée."]).join(" ");return;}
    creditNote.payableAmount=proposal.summary.payableAmount;creditNote.status="posted";
    invoice.creditNotes.push(creditNote);p.nextCreditNoteId=creditNote.id+1;
    persist("Avoir fournisseur comptabilisé.");box.closest("dialog").close();renderList();
  });
}
function openSupplierPayment(invoice) {
  const balance=supplierInvoiceBalance(invoice); if(balance<=0.001)return toast('Cette facture fournisseur est déjà intégralement réglée.');
  const defaultRate=Number(invoice.accounting?.exchangeRate)||1;
  const {box}=modal(`<h2>Règlement fournisseur — ${esc(invoice.number)}</h2><p>Reste dû : <strong>${money(balance)} ${esc(invoice.currency||'')}</strong></p><div class="grid cols-2"><div><label>Date</label><input id="psp-date" type="date" value="${today()}"></div><div><label>Montant</label><input id="psp-amount" type="number" min="0.01" max="${balance}" step="0.01" value="${balance}"></div><div><label>Mode</label><select id="psp-method"><option value="bank">Banque / virement</option><option value="cash">Caisse / espèces</option></select></div><div><label>Taux de conversion</label><input id="psp-rate" type="number" min="0.000001" step="0.000001" value="${defaultRate}"></div><div><label>Compte de trésorerie</label><select id="psp-treasury">${accountOptions('asset', '', 'treasury')}</select></div><div><label>Perte de change</label><select id="psp-fx-loss">${accountOptions('expense')}</select></div><div><label>Gain de change</label><select id="psp-fx-gain">${accountOptions('income')}</select></div></div><p class="muted">La dette est soldée au taux comptable de la facture ; l’écart de change est comptabilisé séparément.</p><div id="psp-error" class="errors"></div><div class="actions"><button id="psp-submit">Comptabiliser</button><button class="secondary" data-close>Annuler</button></div>`);
  box.querySelector('#psp-submit').addEventListener('click',()=>{
    const p=data(), payment={id:p.nextPaymentId,date:box.querySelector('#psp-date').value,amount:num(box.querySelector('#psp-amount').value),method:box.querySelector('#psp-method').value,exchangeRate:num(box.querySelector('#psp-rate').value),treasury:box.querySelector('#psp-treasury').value,fxLoss:box.querySelector('#psp-fx-loss').value,fxGain:box.querySelector('#psp-fx-gain').value,createdAt:new Date().toISOString()};
    const reference='REGLEMENT FOURNISSEUR '+String(invoice.number||invoice.id)+' #'+String(payment.id), existing=(store.entries||[]).find(entry=>entry.reference===reference);
    if(existing){
      const expectedDebt=round(num(payment.amount)*num(invoice.accounting?.exchangeRate));
      const expectedCash=round(num(payment.amount)*num(payment.exchangeRate));
      const lines=existing.lines||[];
      const debtLine=lines.find(line=>String(line.account)===String(invoice.accounting?.accounts?.supplier)&&round(line.debit)===expectedDebt);
      const cashLine=lines.find(line=>String(line.account)===String(payment.treasury)&&round(line.credit)===expectedCash);
      if(existing.date!==payment.date || existing.journal!==(payment.method==="cash"?"CAI":"BAN") || !debtLine || !cashLine){
        box.querySelector("#psp-error").textContent="Une écriture porte déjà cette référence, mais ses montants ou ses comptes diffèrent. Aucune réconciliation automatique n'a été effectuée.";
        return;
      }
      invoice.payments||=[];invoice.payments.push({...payment,status:"posted",entryId:existing.id});p.nextPaymentId++;persist("Règlement déjà comptabilisé : historique réconcilié après vérification des montants.");box.closest("dialog").close();renderList();return;
    }
    const proposal=buildSupplierPaymentJournalEntry(store,invoice,payment,payment);if(!proposal.ok){box.querySelector('#psp-error').textContent=proposal.errors.join(' ');return;}
    const posted=postSupplierPaymentJournalEntry(store,invoice,payment,payment);if(!posted.ok){box.querySelector('#psp-error').textContent=(posted.errors||['Règlement refusé.']).join(' ');return;}
    payment.status='posted';payment.entryId=(store.entries||[]).find(entry=>entry.reference===reference)?.id||null;invoice.payments||=[];invoice.payments.push(payment);p.nextPaymentId++;persist('Règlement fournisseur comptabilisé.');box.closest('dialog').close();renderList();
  });
}
function product(id) {
  return (stockState?.products || []).find(item => String(item.id) === String(id));
}
function warehouse(id) {
  return (stockState?.warehouses || []).find(item => String(item.id) === String(id));
}
function purchaseLineKey(line) {
  return String(line.productId) + "::" + String(line.warehouseId);
}
function orderLinesFor(order, line) {
  return (order?.lines || []).filter(item => purchaseLineKey(item) === purchaseLineKey(line));
}
function orderedQuantity(order, line) {
  return round(orderLinesFor(order, line).reduce((sum, item) => sum + num(item.baseQuantity), 0));
}
function invoicedQuantity(orderId, line, exceptInvoiceId = null) {
  return round(data().documents
    .filter(doc => doc.type === "invoice" && doc.orderId === orderId && doc.status !== "cancelled" && doc.id !== exceptInvoiceId)
    .flatMap(doc => doc.lines || [])
    .filter(item => item.lineType !== "service" && item.lineType !== "fixed_asset")
    .filter(item => purchaseLineKey(item) === purchaseLineKey(line))
    .reduce((sum, item) => sum + num(item.baseQuantity), 0));
}
function validateInvoiceAgainstOrder(order, invoice, { requireReceived = false } = {}) {
  if (!order || order.type !== "order" || order.supplierId !== invoice.supplierId) return "Commande fournisseur introuvable ou fournisseur incohérent.";
  const invoiceTotals = new Map();
  for (const line of invoice.lines || []) {
    if (line.lineType === "service" || line.lineType === "fixed_asset") continue;
    const matches = orderLinesFor(order, line);
    if (!matches.length) return "Rapprochement impossible : article ou entrepôt absent de la commande.";
    if (matches.some(item => Math.abs(num(item.unitCost) - num(line.unitCost)) > 0.0001)) return "Rapprochement impossible : le coût unitaire diffère de la commande.";
    const key = purchaseLineKey(line);
    invoiceTotals.set(key, round((invoiceTotals.get(key) || 0) + num(line.baseQuantity)));
    if (requireReceived) {
      const received = round(matches.reduce((sum, item) => sum + num(item.receivedBase), 0));
      if (num(line.baseQuantity) > received) return "Rapprochement bloqué : la quantité facturée dépasse la quantité physiquement reçue.";
    }
  }
  for (const [key, quantity] of invoiceTotals) {
    const line = (invoice.lines || []).find(item => purchaseLineKey(item) === key);
    const alreadyInvoiced = invoicedQuantity(order.id, line, invoice.id);
    if (alreadyInvoiced + quantity > orderedQuantity(order, line) + 0.0001) {
      return "Rapprochement impossible : le cumul des factures dépasse la quantité commandée.";
    }
  }
  return "";
}
function unitOptions(item, selected = "") {
  const base = item.base_unit || "unité";
  const conversions = (stockState?.unit_conversions || []).filter(row => row.product_id === item.id);
  const options = [{ unit: base, factor: 1 }, ...conversions.map(row => ({ unit: row.unit_code, factor: Number(row.factor_to_base) }))];
  return options.map(row => `<option value="${esc(row.unit)}" data-factor="${row.factor}" ${row.unit === selected ? "selected" : ""}>${esc(row.unit)}</option>`).join("");
}
function lineRow(index, source = {}) {
  const products = (stockState?.products || []).filter(item => item.active !== false && item.product_type !== "service");
  const warehouses = (stockState?.warehouses || []).filter(item => item.active !== false);
  const chosen = products.find(item => String(item.id) === String(source.productId)) || products[0];
  const units = chosen ? unitOptions(chosen, source.unit || chosen.base_unit) : "";
  return `<tr data-purchase-line="${index}">
    <td><select class="pa-product">${products.map(item => `<option value="${esc(item.id)}" ${chosen?.id === item.id ? "selected" : ""}>${esc(item.sku)} — ${esc(item.name)}</option>`).join("")}</select></td>
    <td><select class="pa-warehouse">${warehouses.map(item => `<option value="${esc(item.id)}" ${String(source.warehouseId || warehouses[0]?.id) === String(item.id) ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></td>
    <td><select class="pa-unit">${units}</select></td>
    <td><input class="pa-quantity" type="number" min="0.0001" step="0.0001" value="${source.quantity ?? 1}"></td>
    <td><input class="pa-cost" type="number" min="0" step="0.0001" value="${source.unitCost ?? 0}"></td>
    <td><input class="pa-tax" type="number" min="0" max="100" step="0.01" value="${source.taxRate ?? ""}" placeholder="Défaut"></td>
    <td><input class="pa-trace" maxlength="500" value="${esc(source.trace || "")}" placeholder="Lot ou séries"></td>
    <td><button type="button" class="secondary pa-remove" aria-label="Supprimer la ligne">×</button></td>
  </tr>`;
}
function extraLineRow(index, source = {}) {
  return '<tr data-extra-line="' + index + '"><td><select class="pa-extra-type"><option value="service" ' + (source.lineType !== "fixed_asset" ? "selected" : "") + '>Service / prestation</option><option value="fixed_asset" ' + (source.lineType === "fixed_asset" ? "selected" : "") + '>Immobilisation</option></select></td>' +
    '<td><input class="pa-extra-description" maxlength="240" value="' + esc(source.description || "") + '" placeholder="Désignation de la prestation ou du bien"></td>' +
    '<td><input class="pa-extra-quantity" type="number" min="0.0001" step="0.0001" value="' + (source.quantity ?? 1) + '"></td>' +
    '<td><input class="pa-extra-cost" type="number" min="0.01" step="0.01" value="' + (source.unitCost ?? 0) + '"></td>' +
    '<td><input class="pa-tax" type="number" min="0" max="100" step="0.01" value="' + (source.taxRate ?? "") + '" placeholder="Défaut"></td>' +
    '<td><button type="button" class="secondary pa-extra-remove" aria-label="Supprimer la ligne">×</button></td></tr>';
}
function refreshLineUnits(row, unit = "") {
  const item = product(row.querySelector(".pa-product").value);
  row.querySelector(".pa-unit").innerHTML = item ? unitOptions(item, unit || item.base_unit) : "";
}
function readLines(box) {
  const goods = [...box.querySelectorAll("[data-purchase-line]")].map(row => {
    const item = product(row.querySelector(".pa-product").value), unit = row.querySelector(".pa-unit").value;
    const factor = Number(row.querySelector(".pa-unit").selectedOptions[0]?.dataset.factor || 1);
    const quantity = num(row.querySelector(".pa-quantity").value), unitCost = num(row.querySelector(".pa-cost").value), taxValue = row.querySelector(".pa-tax").value.trim();
    return { lineType:"goods", productId:item?.id, warehouseId:row.querySelector(".pa-warehouse").value, unit, factor, quantity, unitCost, taxRate:taxValue===""?null:num(taxValue), trace:row.querySelector(".pa-trace")?.value.trim() || "", baseQuantity:round(quantity*factor), baseUnitCost:factor>0?round(unitCost/factor):0 };
  });
  const extras = [...box.querySelectorAll("[data-extra-line]")].filter(row => row.querySelector(".pa-extra-description").value.trim() || num(row.querySelector(".pa-extra-cost").value)>0 || num(row.querySelector(".pa-extra-quantity").value)!==1).map(row => {
    const taxValue=row.querySelector(".pa-tax").value.trim();
    return { lineType:row.querySelector(".pa-extra-type").value, description:row.querySelector(".pa-extra-description").value.trim(), quantity:num(row.querySelector(".pa-extra-quantity").value), unitCost:num(row.querySelector(".pa-extra-cost").value), taxRate:taxValue===""?null:num(taxValue), factor:1, baseQuantity:num(row.querySelector(".pa-extra-quantity").value), baseUnitCost:num(row.querySelector(".pa-extra-cost").value) };
  });
  return goods.concat(extras);
}
function accountOptions(type, selected = "", purpose = "") {
  const accounts = [...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, account]) => ({ code, ...account })) : []), ...(store.settings.customAccounts || [])];
  const validPurpose = account => {
    const code = String(account.code || ""), label = String(account.label || "").toLocaleLowerCase();
    if (purpose === "supplier") return code.startsWith("4") && /fournisseur/.test(label);
    if (purpose === "stock") return code.startsWith("3") && /(stock|marchandise|matière|approvisionnement|produit)/.test(label);
    if (purpose === "purchases") return code.startsWith("6") && /(achat|charge)/.test(label);
    if (purpose === "inputVat") return /(tva.*(récupérable|déductible|acquisition|achats)|taxe.*récupérable|impôt.*récupérable)/.test(label);
    if (purpose === "services") return code.startsWith("6") && /(service|honoraire|charge|prestation)/.test(label);
    if (purpose === "fixedAssets") return code.startsWith("2") && /(immobil|matériel|terrain|construction|équipement)/.test(label);
    if (purpose === "treasury") return code.startsWith("5") && /(banque|caisse|trésorerie)/.test(label);
    return true;
  };
  const unique = [...new Map(accounts.filter(account => account.type === type && validPurpose(account)).map(account => [String(account.code), account])).values()];
  return '<option value="">— Choisir un compte —</option>' + unique.map(account => '<option value="' + esc(account.code) + '" ' + (String(account.code) === String(selected) ? "selected" : "") + '>' + esc(account.code) + " — " + esc(account.label) + '</option>').join("");
}
function validateLines(lines) {
  if (!lines.length) return "Ajoutez au moins une ligne d'achat.";
  if (lines.some(line => (line.taxRate !== null && (!Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 100))
    || (line.lineType === "service" || line.lineType === "fixed_asset"
      ? (!line.description || !(line.quantity > 0) || !(line.unitCost > 0) || !Number.isFinite(line.quantity * line.unitCost))
      : (!line.productId || !line.warehouseId || !(line.quantity > 0) || !(line.factor > 0) || line.unitCost < 0 || !Number.isFinite(line.baseQuantity))))) return "Une ligne comporte une nature, une désignation, un article, un entrepôt, une quantité, un coût ou un taux de taxe invalide.";
  return "";
}
function totals(lines) {
  return round(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
}
function statusLabel(status) {
  return ({ draft:"Brouillon", ordered:"Commandée", partially_received:"Partiellement reçue", received:"Reçue", validated:"Validée", cancelled:"Annulée" })[status] || status;
}
function newNumber(type) {
  const p = data();
  const year = new Date().getFullYear();
  if (type === "order") return "BC-" + year + "-" + String(p.nextOrderNumber++).padStart(4, "0");
  return "FAF-" + year + "-" + String(p.nextInvoiceNumber++).padStart(4, "0");
}
function renderList() {
  const p = data();
  const docs = [...p.documents].sort((a,b) => String(b.date).localeCompare(String(a.date)) || Number(b.id)-Number(a.id));
  const orders = docs.filter(doc => doc.type === "order");
  const invoices = docs.filter(doc => doc.type === "invoice");
  const outstandingByCurrency=new Map(); for(const invoice of invoices.filter(item=>item.status==="validated"&&item.accountingPostedAt)){const balance=supplierInvoiceBalance(invoice);if(balance>0.001){const currency=invoice.currency||store.settings.currency||"MAD";outstandingByCurrency.set(currency,round((outstandingByCurrency.get(currency)||0)+balance));}}
  const outstandingSummary=[...outstandingByCurrency].map(([currency,amount])=>money(amount)+" "+currency).join(" · ")||"Aucune dette fournisseur non réglée.";
  const reconciliationRows=(p.reconciliations||[]).slice().reverse().map(item=>`<tr><td>${esc(item.date)}</td><td>${esc(item.reference)}</td><td>${esc(item.currency||"")}</td><td class="num">${money(item.amount)}</td><td>${item.status==="matched_with_tolerance"?"Rapproché avec tolérance":"Rapproché"}</td><td>${(item.allocations||[]).map(allocation=>esc(allocation.invoiceNumber)).join(", ")}</td></tr>`).join("");
  const rows = docs.map(doc => `<tr>
    <td>${esc(doc.number)}</td><td>${doc.type === "order" ? "Commande" : "Facture fournisseur"}</td>
    <td>${esc(supplierName(doc.supplierId))}</td><td>${esc(doc.date)}</td>
    <td>${esc(statusLabel(doc.status))}</td><td class="num">${money(doc.total)} ${esc(doc.currency || store.settings.currency || "MAD")}</td>
    <td><button class="secondary" data-purchase-open="${doc.id}">Ouvrir</button></td>
  </tr>`).join("");
  $app.innerHTML = `
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap">
        <div><h2>Achats</h2><p class="muted">Fournisseurs, commandes, factures et rapprochement des réceptions.</p></div>
        <div class="actions"><button id="pa-supplier">Nouveau fournisseur</button><button id="pa-order">Nouvelle commande</button><button id="pa-invoice">Nouvelle facture</button><button class="secondary" id="pa-reconcile">Rapprocher un paiement groupé</button></div>
      </div>
      <div class="grid cols-3">
        <div class="calculator-result"><strong>${p.suppliers.length}</strong><br><span class="muted">Fournisseurs</span></div>
        <div class="calculator-result"><strong>${orders.filter(x => ["ordered","partially_received"].includes(x.status)).length}</strong><br><span class="muted">Commandes en cours</span></div>
        <div class="calculator-result"><strong>${invoices.filter(x => x.status === "validated").length}</strong><br><span class="muted">Factures validées</span></div>
      </div>
      <p><strong>Dettes fournisseurs comptabilisées :</strong> ${esc(outstandingSummary)}</p>
    </section>
    <section class="card"><h2>Documents d'achat</h2>
      <div class="table-wrap"><table><thead><tr><th>Référence</th><th>Type</th><th>Fournisseur</th><th>Date</th><th>État</th><th class="num">Total</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Aucun document d’achat enregistré.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card"><h2>Rapprochements de paiements groupés</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Référence</th><th>Devise</th><th>Montant</th><th>État</th><th>Factures</th></tr></thead><tbody>${reconciliationRows||'<tr><td colspan="6">Aucun rapprochement enregistré.</td></tr>'}</tbody></table></div></section>
    <section class="card"><h2>Règle d'entrée en stock</h2><p>${stockState?.settings?.purchase_trigger === "supplier_invoice" ? "L'entrée en stock est déclenchée à la validation de la facture fournisseur." : "L'entrée en stock est déclenchée à la réception physique. Les réceptions partielles sont prises en charge."}</p><p class="muted">Les factures et commandes sont synchronisées dans l'espace professionnel. Les quantités physiques sont inscrites dans le journal serveur de stock.</p></section>`;
  document.getElementById("pa-supplier").addEventListener("click", openSupplier);
  document.getElementById("pa-order").addEventListener("click", () => openDocument("order"));
  document.getElementById("pa-invoice").addEventListener("click", () => openDocument("invoice"));
  document.getElementById("pa-reconcile").addEventListener("click", openSupplierMultiInvoiceReconciliation);
  $app.querySelectorAll("[data-purchase-open]").forEach(button => button.addEventListener("click", () => openDetail(Number(button.dataset.purchaseOpen))));
}
function openSupplier() {
  const p = data();
  const { box } = modal(`<h2>Nouveau fournisseur</h2>
    <label>Nom / raison sociale</label><input id="ps-name" maxlength="180" required>
    <div class="grid cols-2"><div><label>Code fournisseur</label><input id="ps-code" maxlength="40"></div><div><label>Identifiant fiscal</label><input id="ps-tax" maxlength="80"></div></div>
    <div class="grid cols-2"><div><label>Téléphone</label><input id="ps-phone" maxlength="60"></div><div><label>E-mail</label><input id="ps-email" type="email" maxlength="180"></div></div>
    <label>Adresse</label><textarea id="ps-address" maxlength="500"></textarea><div id="ps-error" class="errors"></div>
    <div class="actions"><button id="ps-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`);
  box.querySelector("#ps-save").addEventListener("click", () => {
    const name = box.querySelector("#ps-name").value.trim();
    const code = box.querySelector("#ps-code").value.trim();
    if (!name) { box.querySelector("#ps-error").textContent = "Le nom du fournisseur est obligatoire."; return; }
    if (code && p.suppliers.some(item => item.code.toLowerCase() === code.toLowerCase())) { box.querySelector("#ps-error").textContent = "Ce code fournisseur existe déjà."; return; }
    p.suppliers.push({ id:p.nextSupplierId++, name, code, taxNumber:box.querySelector("#ps-tax").value.trim(), phone:box.querySelector("#ps-phone").value.trim(), email:box.querySelector("#ps-email").value.trim(), address:box.querySelector("#ps-address").value.trim(), active:true, createdAt:new Date().toISOString() });
    box.closest("dialog").close(); persist("Fournisseur enregistré."); renderList();
  });
}
function openDocument(type) {
  const p = data();
  const suppliers = p.suppliers.filter(item => item.active !== false);
  if (!suppliers.length) { toast("Créez d'abord un fournisseur."); openSupplier(); return; }
  if (type === "order" && (!(stockState?.products || []).some(item => item.active !== false && item.product_type !== "service") || !(stockState?.warehouses || []).length)) { toast("Créez d'abord au moins un article physique et un entrepôt dans Gestion de stock."); return; }
  const orders = p.documents.filter(doc => doc.type === "order" && doc.status !== "cancelled");
  const { box } = modal(`<h2>${type === "order" ? "Nouvelle commande fournisseur" : "Nouvelle facture fournisseur"}</h2>
    <div class="grid cols-2"><div><label>Fournisseur</label><select id="pd-supplier">${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
    <div><label>Date</label><input id="pd-date" type="date" value="${today()}"></div></div>
    ${type === "invoice" ? `<label>Commande à rapprocher (facultatif)</label><select id="pd-order"><option value="">Facture sans commande liée</option>${orders.map(o => `<option value="${o.id}">${esc(o.number)} — ${esc(supplierName(o.supplierId))}</option>`).join("")}</select>` : ""}
    <label>${type === "invoice" ? "Référence de facture fournisseur *" : "Référence de commande fournisseur"}</label><input id="pd-reference" maxlength="120" ${type === "invoice" ? "required" : ""} placeholder="${type === "invoice" ? "N° de facture du fournisseur" : "N° de commande fournisseur"}">
    <label>Devise</label><input id="pd-currency" maxlength="3" value="${esc(store.settings.currency || "MAD")}">
    ${type === "invoice" ? '<div class="grid cols-2"><div><label>Taux de conversion vers ' + esc(store.settings.currency || "MAD") + '</label><input id="pd-exchange-rate" type="number" min="0.000001" step="0.000001" value="1"></div><div><label>Taux de taxe fournisseur (%)</label><input id="pd-tax-rate" type="number" min="0" max="100" step="0.01" value="0"></div></div><label><input id="pd-tax-recoverable" type="checkbox" checked> Taxe récupérable</label><h3>Imputation comptable obligatoire</h3><div class="grid cols-2"><div><label>Compte fournisseur (passif)</label><select id="pd-account-supplier">' + accountOptions("liability", "", "supplier") + '</select></div><div><label>Compte de stock (actif, inventaire permanent)</label><select id="pd-account-stock">' + accountOptions("asset", "", "stock") + '</select></div><div><label>Compte d’achats (charge, inventaire périodique)</label><select id="pd-account-purchases">' + accountOptions("expense", "", "purchases") + '</select></div><div><label>TVA récupérable (actif)</label><select id="pd-account-vat">' + accountOptions("asset", "", "inputVat") + '</select></div><div><label>Prestations de services (charge)</label><select id="pd-account-services">' + accountOptions("expense", "", "services") + '</select></div><div><label>Immobilisations (actif)</label><select id="pd-account-fixed-assets">' + accountOptions("asset", "", "fixedAssets") + '</select></div></div><p class="muted">Les marchandises sont imputées au stock ou aux achats selon le mode d’inventaire ; les services et immobilisations utilisent leurs comptes dédiés.</p>' : ""}
    <h3>Lignes d'achat</h3><div class="table-wrap"><table><thead><tr><th>Article physique</th><th>Entrepôt</th><th>Unité</th><th>Quantité</th><th>Coût unitaire HT</th><th>TVA % (défaut)</th><th>Lot / séries (facture)</th><th></th></tr></thead><tbody id="pd-lines">${lineRow(0)}</tbody></table></div>
    <button type="button" class="secondary" id="pd-add-line">Ajouter une ligne de marchandise</button>
    ${type === "invoice" ? '<h3>Services et immobilisations</h3><div class="table-wrap"><table><thead><tr><th>Nature</th><th>Désignation</th><th>Quantité</th><th>Coût unitaire HT</th><th>TVA % (défaut)</th><th></th></tr></thead><tbody id="pd-extra-lines">' + extraLineRow(0) + '</tbody></table></div><button type="button" class="secondary" id="pd-add-extra-line">Ajouter une prestation ou immobilisation</button>' : ""}
    <p id="pd-total" class="calculator-result">Total : 0,00</p><div id="pd-error" class="errors"></div>
    <div class="actions"><button id="pd-save">Enregistrer ${type === "order" ? "la commande" : "la facture"}</button><button class="secondary" data-close>Annuler</button></div>`);
  const tbody = box.querySelector("#pd-lines");
  const extraTbody = box.querySelector("#pd-extra-lines");
  const bindExtraRows = () => extraTbody?.querySelectorAll("[data-extra-line]").forEach(row => {
    row.querySelector(".pa-extra-remove").addEventListener("click", () => { if (extraTbody.children.length > 1) row.remove(); updateTotal(); });
    row.querySelectorAll("input,select").forEach(el => el.addEventListener("input", updateTotal));
  });
  const bindRows = () => {
    tbody.querySelectorAll("[data-purchase-line]").forEach(row => {
      row.querySelector(".pa-product").addEventListener("change", () => refreshLineUnits(row));
      row.querySelector(".pa-remove").addEventListener("click", () => { if (tbody.children.length > 1 || type === "invoice") row.remove(); updateTotal(); });
      row.querySelectorAll("input,select").forEach(el => el.addEventListener("input", updateTotal));
    });
  };
  const updateTotal = () => { const lines=readLines(box), ht=totals(lines), fallback=num(box.querySelector("#pd-tax-rate")?.value), vat=round(lines.reduce((sum,line)=>sum+Math.round((line.quantity*line.unitCost*(line.taxRate===null?fallback:line.taxRate)/100+Number.EPSILON)*100)/100,0)); box.querySelector("#pd-total").textContent="HT : "+money(ht)+" | TVA : "+money(vat)+" | TTC : "+money(round(ht+vat))+" "+box.querySelector("#pd-currency").value; };
  bindRows(); bindExtraRows(); updateTotal();
  box.querySelector("#pd-tax-rate")?.addEventListener("input", updateTotal);
  box.querySelector("#pd-add-line").addEventListener("click", () => { tbody.insertAdjacentHTML("beforeend", lineRow(tbody.children.length)); bindRows(); updateTotal(); });
  box.querySelector("#pd-add-extra-line")?.addEventListener("click", () => { extraTbody.insertAdjacentHTML("beforeend", extraLineRow(extraTbody.children.length)); bindExtraRows(); updateTotal(); });
  box.querySelector("#pd-currency").addEventListener("input", () => {
    if (type === "invoice") {
      const currency = box.querySelector("#pd-currency").value.trim().toUpperCase();
      box.querySelector("#pd-exchange-rate").value = currency === String(store.settings.currency || "").toUpperCase() ? "1" : "";
    }
    updateTotal();
  });
  if (type === "invoice") box.querySelector("#pd-order").addEventListener("change", event => {
    const order = p.documents.find(doc => String(doc.id) === event.target.value);
    if (!order) return;
    if (String(order.supplierId) !== box.querySelector("#pd-supplier").value) box.querySelector("#pd-supplier").value = String(order.supplierId);
    tbody.innerHTML = order.lines.filter(line => !line.lineType || line.lineType === "goods").map((line,index) => lineRow(index,line)).join("");
    if (extraTbody) extraTbody.innerHTML = extraLineRow(0);
    bindRows(); bindExtraRows(); updateTotal();
  });
  box.querySelector("#pd-save").addEventListener("click", () => {
    const lines = readLines(box), error = validateLines(lines);
    const supplierId = Number(box.querySelector("#pd-supplier").value);
    const orderId = type === "invoice" ? Number(box.querySelector("#pd-order")?.value || 0) || null : null;
    if (error) { box.querySelector("#pd-error").textContent = error; return; }
    const supplierReference = box.querySelector("#pd-reference").value.trim();
    if (type === "invoice") {
      const metadata = validateSupplierInvoiceMetadata({ reference:supplierReference, date:box.querySelector("#pd-date").value || today(), currency:box.querySelector("#pd-currency").value.trim().toUpperCase() || store.settings.currency || "MAD" });
      if (!metadata.ok) { box.querySelector("#pd-error").textContent = metadata.errors[0]; return; }
      const duplicate = findDuplicateSupplierInvoice(p.documents, supplierId, supplierReference);
      if (duplicate) {
        box.querySelector("#pd-error").textContent = "Cette référence de facture fournisseur existe déjà pour ce fournisseur (" + duplicate.number + "). Vérifiez qu'il ne s'agit pas d'une double saisie.";
        return;
      }
    }
    if (type === "invoice" && orderId) {
      const order = p.documents.find(doc => doc.id === orderId);
      const candidate = { id:null, supplierId, lines };
      const matchingError = validateInvoiceAgainstOrder(order, candidate);
      if (matchingError) { box.querySelector("#pd-error").textContent = matchingError; return; }
    }
    const doc = { id:p.nextId++, type, number:newNumber(type), supplierId, supplierName:supplierName(supplierId), orderId, date:box.querySelector("#pd-date").value || today(), reference:box.querySelector("#pd-reference").value.trim(), currency:box.querySelector("#pd-currency").value.trim().toUpperCase() || store.settings.currency || "MAD", lines:lines.map(line=>({...line,receivedBase:0,stockPostedBase:0})), total:totals(lines), status:type === "order" ? "ordered" : "draft", createdAt:new Date().toISOString() };
    if (type === "invoice") {
      const exchangeRate = Number(box.querySelector("#pd-exchange-rate").value), taxRate = Number(box.querySelector("#pd-tax-rate").value);
      if (!(exchangeRate > 0) || !Number.isFinite(exchangeRate)) { box.querySelector("#pd-error").textContent = "Le taux de conversion doit être strictement positif."; return; }
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) { box.querySelector("#pd-error").textContent = "Le taux de taxe doit être compris entre 0 et 100 %."; return; }
      doc.accounting = { exchangeRate, taxRate, taxRecoverable:box.querySelector("#pd-tax-recoverable").checked, accounts:{ supplier:box.querySelector("#pd-account-supplier").value, stock:box.querySelector("#pd-account-stock").value, purchases:box.querySelector("#pd-account-purchases").value, inputVat:box.querySelector("#pd-account-vat").value, services:box.querySelector("#pd-account-services").value, fixedAssets:box.querySelector("#pd-account-fixed-assets").value } };
    }
    p.documents.push(doc);
    box.closest("dialog").close(); persist(type === "order" ? "Commande fournisseur enregistrée." : "Facture fournisseur enregistrée."); renderList();
  });
}
function configureSupplierAccounting(doc) {
  const current = doc.accounting || {};
  const accounts = current.accounts || {};
  const { box } = modal('<h2>Imputation comptable — ' + esc(doc.number) + '</h2>' +
    '<div class="grid cols-2"><div><label>Taux de conversion vers ' + esc(store.settings.currency || "MAD") + '</label><input id="pac-rate" type="number" min="0.000001" step="0.000001" value="' + esc(current.exchangeRate ?? (doc.currency === store.settings.currency ? 1 : "")) + '"></div>' +
    '<div><label>Taux de taxe fournisseur (%)</label><input id="pac-tax" type="number" min="0" max="100" step="0.01" value="' + esc(current.taxRate ?? 0) + '"></div></div>' +
    '<label><input id="pac-recoverable" type="checkbox" ' + (current.taxRecoverable !== false ? "checked" : "") + '> Taxe récupérable</label>' +
    '<label>Compte fournisseur (passif)</label><select id="pac-supplier">' + accountOptions("liability", accounts.supplier, "supplier") + '</select>' +
    '<label>Compte de stock (actif, inventaire permanent)</label><select id="pac-stock">' + accountOptions("asset", accounts.stock, "stock") + '</select>' +
    '<label>Compte d’achats (charge, inventaire périodique)</label><select id="pac-purchases">' + accountOptions("expense", accounts.purchases, "purchases") + '</select>' +
    '<label>TVA récupérable (actif)</label><select id="pac-vat">' + accountOptions("asset", accounts.inputVat, "inputVat") + '</select>' +
    '<label>Prestations de services (charge)</label><select id="pac-services">' + accountOptions("expense", accounts.services, "services") + '</select>' +
    '<label>Immobilisations (actif)</label><select id="pac-fixed-assets">' + accountOptions("asset", accounts.fixedAssets, "fixedAssets") + '</select>' +
    '<div id="pac-error" class="errors"></div><div class="actions"><button id="pac-save">Enregistrer l’imputation</button><button class="secondary" data-close>Annuler</button></div>');
  box.querySelector("#pac-save").addEventListener("click", () => {
    const exchangeRate = Number(box.querySelector("#pac-rate").value), taxRate = Number(box.querySelector("#pac-tax").value);
    if (!(exchangeRate > 0) || !Number.isFinite(exchangeRate)) { box.querySelector("#pac-error").textContent = "Le taux de conversion doit être strictement positif."; return; }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) { box.querySelector("#pac-error").textContent = "Le taux de taxe doit être compris entre 0 et 100 %."; return; }
    doc.accounting = { exchangeRate, taxRate, taxRecoverable:box.querySelector("#pac-recoverable").checked, accounts:{ supplier:box.querySelector("#pac-supplier").value, stock:box.querySelector("#pac-stock").value, purchases:box.querySelector("#pac-purchases").value, inputVat:box.querySelector("#pac-vat").value, services:box.querySelector("#pac-services").value, fixedAssets:box.querySelector("#pac-fixed-assets").value } };
    persist("Imputation comptable fournisseur enregistrée.");
    box.closest("dialog").close();
    openDetail(doc.id);
  });
}
function openDetail(id) {
  const doc = data().documents.find(item => item.id === id);
  if (!doc) return;
  const p = data();
  const linkedOrder = doc.orderId ? p.documents.find(item => item.id === doc.orderId) : null;
  const lines = doc.lines.map(line => {
    const item = product(line.productId);
    const kind=line.lineType==="service"?"Service":line.lineType==="fixed_asset"?"Immobilisation":"Marchandise";
    return `<tr><td>${kind}</td><td>${esc(line.description || item?.name || "Article")}</td><td>${esc(warehouse(line.warehouseId)?.name || "—")}</td><td class="num">${line.quantity} ${esc(line.unit || "")}</td><td class="num">${money(line.unitCost)}</td><td class="num">${line.lineType==="service"||line.lineType==="fixed_asset"?"—":round(line.baseQuantity)+" "+esc(item?.base_unit||"")}</td></tr>`;
  }).join("");
  const remaining = doc.lines.reduce((sum,line) => {
    if (line.lineType === "service" || line.lineType === "fixed_asset") return sum;
    const linkedReceived = orderLinesFor(linkedOrder, line).reduce((sum, item) => sum + num(item.receivedBase), 0);
    const received = doc.type === "order" ? num(line.receivedBase) :
      stockState?.settings?.purchase_trigger === "supplier_invoice" ? num(line.stockPostedBase) :
      doc.orderId ? linkedReceived : num(line.receivedBase);
    return sum + Math.max(0,line.baseQuantity - received);
  },0);
  const creditNoteRows=(doc.creditNotes||[]).map(note=>`<tr><td>${esc(note.date)}</td><td>${esc(note.number)}</td><td>${money(note.payableAmount??note.total)} ${esc(doc.currency||"")}</td><td>${note.status==="posted"?"Comptabilisé":"À vérifier"}</td></tr>`).join("");
  const paymentRows=(doc.payments||[]).map(payment=>`<tr><td>${esc(payment.date)}</td><td>${money(payment.amount)} ${esc(doc.currency||"")}</td><td>${payment.method==="cash"?"Caisse":"Banque"}</td><td>${payment.status==="posted"?"Comptabilisé":"À vérifier"}</td></tr>`).join("");
  const supplierBalance=doc.type==="invoice"?supplierInvoiceBalance(doc):0;
  const { box } = modal(`<h2>${esc(doc.number)}</h2><p>${doc.type === "order" ? "Commande fournisseur" : "Facture fournisseur"} · ${esc(supplierName(doc.supplierId))} · ${esc(doc.date)}</p>
    <p>État : <strong>${esc(statusLabel(doc.status))}</strong> · Total : <strong>${money(doc.total)} ${esc(doc.currency)}</strong></p>
    ${doc.type==="invoice"?`<p>Montant TTC dû : ${money(supplierInvoicePayable(doc))} · Réglé : ${money(supplierInvoicePaid(doc))} · Avoirs : ${money((doc.creditNotes||[]).reduce((sum,note)=>sum+num(note.payableAmount??note.total),0))} · Reste : <strong>${money(supplierBalance)}</strong></p><h3>Avoirs fournisseurs</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Référence</th><th>Montant</th><th>État</th></tr></thead><tbody>${creditNoteRows||"<tr><td colspan=\"4\">Aucun avoir.</td></tr>"}</tbody></table></div><h3>Historique des règlements</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Montant</th><th>Mode</th><th>État</th></tr></thead><tbody>${paymentRows||"<tr><td colspan=\"4\">Aucun règlement enregistré.</td></tr>"}</tbody></table></div>`:""}
    ${linkedOrder ? `<p>Commande liée : ${esc(linkedOrder.number)}</p>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Nature</th><th>Désignation</th><th>Entrepôt</th><th>Quantité</th><th>Coût unitaire HT</th><th>Quantité de base</th></tr></thead><tbody>${lines}</tbody></table></div>
    <p>Quantité de base restant à entrer : <strong>${round(remaining)}</strong></p>
    <div id="pd-detail-actions" class="actions"></div><div id="pd-detail-error" class="errors"></div>
    <div class="actions"><button class="secondary" data-close>Fermer</button></div>`);
  const actions = box.querySelector("#pd-detail-actions");
  const addAction = (label, fn) => { const button = document.createElement("button"); button.textContent = label; button.addEventListener("click", fn); actions.append(button); };
  if (doc.status === "draft" && doc.type === "invoice") addAction("Configurer l’imputation comptable", () => configureSupplierAccounting(doc));
  if (doc.status === "draft" && doc.type === "invoice") addAction("Valider la facture", () => validateInvoice(doc, box));
  if (doc.type === "invoice" && doc.status === "validated" && !doc.accountingPostedAt) addAction("Comptabiliser la facture", () => postSupplierAccounting(doc, box));
  if (doc.type === "invoice" && doc.status === "validated" && doc.accountingPostedAt && supplierBalance > 0.001) addAction("Enregistrer un règlement", () => openSupplierPayment(doc));
  if (doc.type === "invoice" && doc.status === "validated" && doc.accountingPostedAt && supplierBalance > 0.001) addAction("Créer un avoir fournisseur", () => openSupplierCreditNote(doc));
  if (doc.type === "order" && ["ordered","partially_received"].includes(doc.status) && remaining > 0) addAction("Enregistrer une réception partielle", () => openReceipt(doc));
  if (doc.type === "invoice" && !doc.orderId && doc.status === "validated" && stockState?.settings?.purchase_trigger === "receipt" && remaining > 0) addAction("Enregistrer la réception physique", () => openReceipt(doc));
  if (doc.type === "invoice" && doc.status === "validating" && doc.pendingInvoiceReceipt) addAction("Réessayer la validation et l’entrée en stock", () => postReceipt(doc, doc.pendingInvoiceReceipt.lines, box, "supplier_invoice").then(async () => { if (!doc.pendingInvoiceReceipt && doc.status === "validating") { doc.status="validated"; doc.validatedAt=new Date().toISOString(); persist("Facture fournisseur validée."); await postSupplierAccounting(doc, box); } }));
  if (["draft","ordered"].includes(doc.status)) addAction("Annuler le document", () => { if (doc.type === "order" && doc.lines.some(line=>num(line.receivedBase)>0)) { box.querySelector("#pd-detail-error").textContent = "Une commande déjà reçue ne peut pas être annulée depuis cette action."; return; } doc.status="cancelled"; persist("Document annulé."); box.closest("dialog").close(); renderList(); });
}
async function postReceipt(doc, requestedLines, box, sourceType) {
  const pendingKey = sourceType === "supplier_invoice" ? "pendingInvoiceReceipt" : "pendingReceipt";
  if (!doc[pendingKey]) { doc[pendingKey] = { operationUid:uuid(), lines:requestedLines, sourceType, sourceId:String(doc.id), attempted:false }; persist(); }
  const pending = doc[pendingKey];
  const requestKey = String(doc.id) + ":" + pendingKey;
  if (activeReceiptOperations.has(requestKey)) return;
  activeReceiptOperations.add(requestKey);
  try {
    // Vérifier toutes les allocations avant d'envoyer la réception au serveur :
    // un refus local après confirmation distante laisserait un mouvement physique orphelin.
    const linkedOrder = sourceType === "supplier_invoice" && doc.orderId
      ? data().documents.find(item => item.id === doc.orderId)
      : null;
    const allocationPlan = sourceType === "supplier_invoice" && doc.orderId
      ? planSupplierInvoiceReceiptAllocation(linkedOrder, doc, pending.lines)
      : { ok: true, allocations: [] };
    if (!allocationPlan.ok) {
      if (!pending.attempted) {
        delete doc[pendingKey];
        if (sourceType === "supplier_invoice") doc.status = "draft";
        persist();
      }
      throw new Error(allocationPlan.error);
    }
    // Marquer l'envoi avant l'appel reseau : apres une reponse incertaine, conserver
    // le meme identifiant idempotent et ne jamais fabriquer une nouvelle reception.
    pending.attempted = true;
    persist();
    const result = await postCloudStockDocument({
      operationUid:pending.operationUid, documentType:"receipt", documentDate:doc.date,
      reference:doc.reference || doc.number, note:"Réception fournisseur — " + supplierName(doc.supplierId),
      sourceType:pending.sourceType, sourceId:pending.sourceId,
      lines:pending.lines,
    });
    if (!result?.ok) throw new Error("Le serveur n'a pas confirmé la réception du stock.");
    // L'affectation a déjà été validée intégralement ; son application ne peut plus échouer
    // sur un dépassement de reliquat après que le serveur a inscrit le mouvement.
    for (const allocation of allocationPlan.allocations) {
      allocation.orderLine.receivedBase = round(num(allocation.orderLine.receivedBase) + allocation.quantity);
    }
    for (const line of pending.lines) {
      const baseQty = num(line.quantity);
      const match = doc.lines[Number(line.line_index)];
      if (match) {
        if (sourceType === "supplier_invoice") {
          match.stockPostedBase = round(num(match.stockPostedBase) + baseQty);
        } else match.receivedBase = round(num(match.receivedBase) + baseQty);
      }
    }
    if (linkedOrder) linkedOrder.status = linkedOrder.lines.every(item => num(item.receivedBase) >= item.baseQuantity) ? "received" : "partially_received";
    delete doc[pendingKey];
    if (doc.type === "order") doc.status = doc.lines.every(line => num(line.receivedBase) >= line.baseQuantity) ? "received" : "partially_received";
    persist("Entrée de stock fournisseur confirmée.");
    box?.closest("dialog")?.close(); renderList();
  } catch (error) {
    box.querySelector("#pd-detail-error").textContent = (error?.message || "Réception impossible.") + " L'opération est conservée : réessayez sans créer un nouveau mouvement.";
    if (!box.querySelector("#pd-retry")) {
      const retry = document.createElement("button"); retry.id="pd-retry"; retry.textContent="Réessayer la même réception";
      retry.addEventListener("click", () => postReceipt(doc, requestedLines, box, sourceType)); box.querySelector("#pd-detail-actions").append(retry);
    }
  } finally {
    activeReceiptOperations.delete(requestKey);
  }
}
function openReceipt(doc) {
  const { box } = modal(`<h2>Réception fournisseur — ${esc(doc.number)}</h2><p>Renseignez uniquement les quantités reçues aujourd'hui. Le reliquat restera à recevoir.</p>
    <div class="table-wrap"><table><thead><tr><th>Article</th><th>Restant (base)</th><th>Reçu (base)</th><th>Lot / série</th></tr></thead><tbody>${doc.lines.map((line,index) => ({line,index})).filter(({line}) => line.lineType !== "service" && line.lineType !== "fixed_asset").map(({line,index}) => {
      const item=product(line.productId), left=Math.max(0,line.baseQuantity-num(line.receivedBase));
      return `<tr data-receive-line="${index}"><td>${esc(item?.name||"Article")}</td><td>${round(left)}</td><td><input class="pr-qty" type="number" min="0" max="${left}" step="0.0001" value="${left}"></td><td><input class="pr-trace" placeholder="${item?.tracking === "serial" ? "Séries séparées par virgule" : item?.tracking === "lot" ? "Code lot" : "Facultatif"}"></td></tr>`;
    }).join("")}</tbody></table></div><div id="pd-detail-error" class="errors"></div><div id="pd-detail-actions" class="actions"></div>
    <div class="actions"><button id="pr-confirm">Confirmer la réception</button><button class="secondary" data-close>Annuler</button></div>`);
  box.querySelector("#pr-confirm").addEventListener("click", () => {
    const lines=[];
    for (const row of box.querySelectorAll("[data-receive-line]")) {
      const index=Number(row.dataset.receiveLine), source=doc.lines[index], qty=num(row.querySelector(".pr-qty").value);
      if (qty<=0) continue;
      const item=product(source.productId), trace=row.querySelector(".pr-trace").value.trim();
      if (qty > Math.max(0,source.baseQuantity-num(source.receivedBase))) { box.querySelector("#pd-detail-error").textContent="La quantité reçue dépasse le reliquat."; return; }
      const serials=item?.tracking === "serial" ? trace.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean) : [];
      if (item?.tracking === "serial" && serials.length !== qty) { box.querySelector("#pd-detail-error").textContent="Un numéro de série est requis pour chaque unité entière."; return; }
      if (item?.tracking === "lot" && !trace) { box.querySelector("#pd-detail-error").textContent="Le code du lot est obligatoire."; return; }
      lines.push({ line_index:index, product_id:source.productId, warehouse_id:source.warehouseId, quantity:qty, unit_cost:source.baseUnitCost, lot_code:item?.tracking === "lot" ? trace : null, serial_numbers:serials });
    }
    if (!lines.length) { box.querySelector("#pd-detail-error").textContent="Saisissez au moins une quantité reçue."; return; }
    postReceipt(doc, lines, box, "supplier_receipt");
  });
}
async function postSupplierAccounting(doc, box) {
  if (doc.accountingPostedAt) return true;
  const reference = "ACHAT FOURNISSEUR " + String(doc.number || doc.id);
  const alreadyPosted = (store.entries || []).find(entry => entry.reference === reference);
  if (alreadyPosted) {
    doc.accountingPostedAt = alreadyPosted.date ? new Date().toISOString() : new Date().toISOString();
    doc.accountingEntryId = alreadyPosted.id || null;
    persist("Écriture fournisseur déjà présente : état de comptabilisation réconcilié.");
    box.closest("dialog")?.close(); renderList(); return true;
  }
  const mode = stockState?.settings?.accountingMode || "perpetual";
  const proposal = buildSupplierInvoiceJournalEntry(store, doc, mode);
  if (!proposal.ok) { box.querySelector("#pd-detail-error").textContent = proposal.errors.join(" "); return false; }
  const result = postSupplierInvoiceJournalEntry(store, doc, mode);
  if (!result.ok) { box.querySelector("#pd-detail-error").textContent = (result.errors || ["Comptabilisation impossible."]).join(" "); return false; }
  doc.accountingPostedAt = new Date().toISOString();
  doc.accountingEntryId = (store.entries || []).find(entry => entry.reference === "ACHAT FOURNISSEUR " + String(doc.number || doc.id))?.id || null;
  persist("Facture fournisseur comptabilisée dans le journal des achats.");
  box.closest("dialog")?.close(); renderList(); return true;
}
async function validateInvoice(doc, box) {
  const proposal = buildSupplierInvoiceJournalEntry(store, doc, stockState?.settings?.accountingMode || "perpetual");
  if (!proposal.ok) { box.querySelector("#pd-detail-error").textContent = proposal.errors.join(" "); return; }
  if (doc.orderId) {
    const order=data().documents.find(item=>item.id===doc.orderId);
    const matchingError=validateInvoiceAgainstOrder(order,doc,{requireReceived:stockState?.settings?.purchase_trigger === "receipt"});
    if (matchingError) { box.querySelector("#pd-detail-error").textContent=matchingError; return; }
  }
  if (stockState?.settings?.purchase_trigger === "supplier_invoice") {
    const lines=[];
    for (const line of doc.lines) {
      if (line.lineType === "service" || line.lineType === "fixed_asset") continue;
      // Chaque facture possède son propre cumul d'entrée ; le cumul reçu de la commande
      // ne doit jamais neutraliser une facture ultérieure portant sur une autre tranche.
      const already=num(line.stockPostedBase);
      const qty=Math.max(0,line.baseQuantity-already);
      if (qty>0) {
        const item=product(line.productId), trace=String(line.trace||"").trim();
        const serials=item?.tracking === "serial" ? trace.split(/[,;\\n]+/).map(value=>value.trim()).filter(Boolean) : [];
        if (item?.tracking === "lot" && !trace) { box.querySelector("#pd-detail-error").textContent="Le code de lot est obligatoire avant la validation de la facture."; return; }
        if (item?.tracking === "serial" && serials.length !== qty) { box.querySelector("#pd-detail-error").textContent="La facture doit contenir un numéro de série par unité entière reçue."; return; }
        lines.push({line_index:doc.lines.indexOf(line),product_id:line.productId,warehouse_id:line.warehouseId,quantity:qty,unit_cost:line.baseUnitCost,lot_code:item?.tracking === "lot" ? trace : null,serial_numbers:serials});
      }
    }
    if (lines.length) {
      doc.status="validating"; persist();
      await postReceipt(doc,lines,box,"supplier_invoice");
      if (doc.pendingInvoiceReceipt || doc.status !== "validating") return;
    }
  }
  doc.status="validated"; doc.validatedAt=new Date().toISOString(); persist("Facture fournisseur validée."); await postSupplierAccounting(doc, box);
}

export async function viewPurchases(readOnly = false, role = null) {
  const token=++renderToken;
  if (readOnly || role === "reader") { $app.innerHTML='<section class="card"><h2>Achats</h2><p>Accès réservé à l’administrateur et au comptable.</p></section>'; return; }
  if (!hasActiveStockCompany()) { $app.innerHTML='<section class="card"><h2>Achats</h2><p>Le module Achats nécessite un espace professionnel connecté pour garantir la synchronisation et la traçabilité du stock.</p></section>'; return; }
  $app.innerHTML='<section class="card"><p>Chargement des articles, entrepôts et paramètres de stock…</p></section>';
  try {
    const remote=await readCloudStock();
    if (token!==renderToken) return;
    stockState=remote;
    renderList();
  } catch(error) {
    if (token!==renderToken) return;
    $app.innerHTML='<section class="card"><h2>Achats indisponibles</h2><p class="errors"></p><button id="pa-retry">Réessayer</button></section>';
    $app.querySelector(".errors").textContent=error?.message || "Lecture du stock impossible.";
    $app.querySelector("#pa-retry").addEventListener("click",()=>viewPurchases(readOnly,role));
  }
}
