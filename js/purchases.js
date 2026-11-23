// MIZANE — Module Achats : fournisseurs, commandes, factures et réceptions partielles.
// Les données métier suivent la synchronisation cloud de la facturation ; les entrées physiques
// passent exclusivement par le moteur de stock serveur et ses identifiants idempotents.
import { store, $app, saveNow, esc, toast } from "./state.js";
import { hasActiveStockCompany, readCloudStock, postCloudStockDocument } from "./cloud-sync.js";

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
    .filter(item => purchaseLineKey(item) === purchaseLineKey(line))
    .reduce((sum, item) => sum + num(item.baseQuantity), 0));
}
function validateInvoiceAgainstOrder(order, invoice, { requireReceived = false } = {}) {
  if (!order || order.type !== "order" || order.supplierId !== invoice.supplierId) return "Commande fournisseur introuvable ou fournisseur incohérent.";
  const invoiceTotals = new Map();
  for (const line of invoice.lines || []) {
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
    <td><input class="pa-trace" maxlength="500" value="${esc(source.trace || "")}" placeholder="Lot ou séries"></td>
    <td><button type="button" class="secondary pa-remove" aria-label="Supprimer la ligne">×</button></td>
  </tr>`;
}
function refreshLineUnits(row, unit = "") {
  const item = product(row.querySelector(".pa-product").value);
  row.querySelector(".pa-unit").innerHTML = item ? unitOptions(item, unit || item.base_unit) : "";
}
function readLines(box) {
  return [...box.querySelectorAll("[data-purchase-line]")].map(row => {
    const item = product(row.querySelector(".pa-product").value);
    const unit = row.querySelector(".pa-unit").value;
    const factor = Number(row.querySelector(".pa-unit").selectedOptions[0]?.dataset.factor || 1);
    const quantity = num(row.querySelector(".pa-quantity").value);
    const unitCost = num(row.querySelector(".pa-cost").value);
    return { productId: item?.id, warehouseId: row.querySelector(".pa-warehouse").value, unit, factor, quantity, unitCost, trace:row.querySelector(".pa-trace")?.value.trim() || "", baseQuantity: round(quantity * factor), baseUnitCost: factor > 0 ? round(unitCost / factor) : 0 };
  });
}
function validateLines(lines) {
  if (!lines.length) return "Ajoutez au moins une ligne d'achat.";
  if (lines.some(line => !line.productId || !line.warehouseId || !(line.quantity > 0) || !(line.factor > 0) || line.unitCost < 0 || !Number.isFinite(line.baseQuantity))) return "Une ligne comporte un article, un entrepôt, une quantité ou un coût invalide.";
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
        <div class="actions"><button id="pa-supplier">Nouveau fournisseur</button><button id="pa-order">Nouvelle commande</button><button id="pa-invoice">Nouvelle facture</button></div>
      </div>
      <div class="grid cols-3">
        <div class="calculator-result"><strong>${p.suppliers.length}</strong><br><span class="muted">Fournisseurs</span></div>
        <div class="calculator-result"><strong>${orders.filter(x => ["ordered","partially_received"].includes(x.status)).length}</strong><br><span class="muted">Commandes en cours</span></div>
        <div class="calculator-result"><strong>${invoices.filter(x => x.status === "validated").length}</strong><br><span class="muted">Factures validées</span></div>
      </div>
    </section>
    <section class="card"><h2>Documents d'achat</h2>
      <div class="table-wrap"><table><thead><tr><th>Référence</th><th>Type</th><th>Fournisseur</th><th>Date</th><th>État</th><th class="num">Total</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Aucun document d’achat enregistré.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card"><h2>Règle d'entrée en stock</h2><p>${stockState?.settings?.purchase_trigger === "supplier_invoice" ? "L'entrée en stock est déclenchée à la validation de la facture fournisseur." : "L'entrée en stock est déclenchée à la réception physique. Les réceptions partielles sont prises en charge."}</p><p class="muted">Les factures et commandes sont synchronisées dans l'espace professionnel. Les quantités physiques sont inscrites dans le journal serveur de stock.</p></section>`;
  document.getElementById("pa-supplier").addEventListener("click", openSupplier);
  document.getElementById("pa-order").addEventListener("click", () => openDocument("order"));
  document.getElementById("pa-invoice").addEventListener("click", () => openDocument("invoice"));
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
  if (!(stockState?.products || []).some(item => item.active !== false && item.product_type !== "service") || !(stockState?.warehouses || []).length) { toast("Créez d'abord au moins un article physique et un entrepôt dans Gestion de stock."); return; }
  const orders = p.documents.filter(doc => doc.type === "order" && doc.status !== "cancelled");
  const { box } = modal(`<h2>${type === "order" ? "Nouvelle commande fournisseur" : "Nouvelle facture fournisseur"}</h2>
    <div class="grid cols-2"><div><label>Fournisseur</label><select id="pd-supplier">${suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
    <div><label>Date</label><input id="pd-date" type="date" value="${today()}"></div></div>
    ${type === "invoice" ? `<label>Commande à rapprocher (facultatif)</label><select id="pd-order"><option value="">Facture sans commande liée</option>${orders.map(o => `<option value="${o.id}">${esc(o.number)} — ${esc(supplierName(o.supplierId))}</option>`).join("")}</select>` : ""}
    <label>Référence fournisseur</label><input id="pd-reference" maxlength="120" placeholder="N° commande / facture fournisseur">
    <label>Devise</label><input id="pd-currency" maxlength="3" value="${esc(store.settings.currency || "MAD")}">
    <h3>Lignes d'achat</h3><div class="table-wrap"><table><thead><tr><th>Article physique</th><th>Entrepôt</th><th>Unité</th><th>Quantité</th><th>Coût unitaire</th><th>Lot / séries (facture)</th><th></th></tr></thead><tbody id="pd-lines">${lineRow(0)}</tbody></table></div>
    <button type="button" class="secondary" id="pd-add-line">Ajouter une ligne</button>
    <p id="pd-total" class="calculator-result">Total : 0,00</p><div id="pd-error" class="errors"></div>
    <div class="actions"><button id="pd-save">Enregistrer ${type === "order" ? "la commande" : "la facture"}</button><button class="secondary" data-close>Annuler</button></div>`);
  const tbody = box.querySelector("#pd-lines");
  const bindRows = () => {
    tbody.querySelectorAll("[data-purchase-line]").forEach(row => {
      row.querySelector(".pa-product").addEventListener("change", () => refreshLineUnits(row));
      row.querySelector(".pa-remove").addEventListener("click", () => { if (tbody.children.length > 1) row.remove(); updateTotal(); });
      row.querySelectorAll("input,select").forEach(el => el.addEventListener("input", updateTotal));
    });
  };
  const updateTotal = () => { const lines = readLines(box); box.querySelector("#pd-total").textContent = "Total : " + money(totals(lines)) + " " + box.querySelector("#pd-currency").value; };
  bindRows(); updateTotal();
  box.querySelector("#pd-add-line").addEventListener("click", () => { tbody.insertAdjacentHTML("beforeend", lineRow(tbody.children.length)); bindRows(); updateTotal(); });
  box.querySelector("#pd-currency").addEventListener("input", updateTotal);
  if (type === "invoice") box.querySelector("#pd-order").addEventListener("change", event => {
    const order = p.documents.find(doc => String(doc.id) === event.target.value);
    if (!order) return;
    if (String(order.supplierId) !== box.querySelector("#pd-supplier").value) box.querySelector("#pd-supplier").value = String(order.supplierId);
    tbody.innerHTML = order.lines.map((line,index) => lineRow(index,line)).join("");
    bindRows(); updateTotal();
  });
  box.querySelector("#pd-save").addEventListener("click", () => {
    const lines = readLines(box), error = validateLines(lines);
    const supplierId = Number(box.querySelector("#pd-supplier").value);
    const orderId = type === "invoice" ? Number(box.querySelector("#pd-order")?.value || 0) || null : null;
    if (error) { box.querySelector("#pd-error").textContent = error; return; }
    if (type === "invoice" && orderId) {
      const order = p.documents.find(doc => doc.id === orderId);
      const candidate = { id:null, supplierId, lines };
      const matchingError = validateInvoiceAgainstOrder(order, candidate);
      if (matchingError) { box.querySelector("#pd-error").textContent = matchingError; return; }
    }
    const doc = { id:p.nextId++, type, number:newNumber(type), supplierId, orderId, date:box.querySelector("#pd-date").value || today(), reference:box.querySelector("#pd-reference").value.trim(), currency:box.querySelector("#pd-currency").value.trim().toUpperCase() || store.settings.currency || "MAD", lines:lines.map(line=>({...line,receivedBase:0,stockPostedBase:0})), total:totals(lines), status:type === "order" ? "ordered" : "draft", createdAt:new Date().toISOString() };
    p.documents.push(doc);
    box.closest("dialog").close(); persist(type === "order" ? "Commande fournisseur enregistrée." : "Facture fournisseur enregistrée."); renderList();
  });
}
function openDetail(id) {
  const doc = data().documents.find(item => item.id === id);
  if (!doc) return;
  const p = data();
  const linkedOrder = doc.orderId ? p.documents.find(item => item.id === doc.orderId) : null;
  const lines = doc.lines.map(line => {
    const item = product(line.productId);
    return `<tr><td>${esc(item?.name || "Article")}</td><td>${esc(warehouse(line.warehouseId)?.name || "Entrepôt")}</td><td class="num">${line.quantity} ${esc(line.unit)}</td><td class="num">${money(line.unitCost)}</td><td class="num">${round(line.baseQuantity)} ${esc(item?.base_unit || "")}</td></tr>`;
  }).join("");
  const remaining = doc.lines.reduce((sum,line) => {
    const linkedReceived = orderLinesFor(linkedOrder, line).reduce((sum, item) => sum + num(item.receivedBase), 0);
    const received = doc.type === "order" ? num(line.receivedBase) :
      stockState?.settings?.purchase_trigger === "supplier_invoice" ? num(line.stockPostedBase) :
      doc.orderId ? linkedReceived : num(line.receivedBase);
    return sum + Math.max(0,line.baseQuantity - received);
  },0);
  const { box } = modal(`<h2>${esc(doc.number)}</h2><p>${doc.type === "order" ? "Commande fournisseur" : "Facture fournisseur"} · ${esc(supplierName(doc.supplierId))} · ${esc(doc.date)}</p>
    <p>État : <strong>${esc(statusLabel(doc.status))}</strong> · Total : <strong>${money(doc.total)} ${esc(doc.currency)}</strong></p>
    ${linkedOrder ? `<p>Commande liée : ${esc(linkedOrder.number)}</p>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Article</th><th>Entrepôt</th><th>Quantité</th><th>Coût unitaire</th><th>Quantité de base</th></tr></thead><tbody>${lines}</tbody></table></div>
    <p>Quantité de base restant à entrer : <strong>${round(remaining)}</strong></p>
    <div id="pd-detail-actions" class="actions"></div><div id="pd-detail-error" class="errors"></div>
    <div class="actions"><button class="secondary" data-close>Fermer</button></div>`);
  const actions = box.querySelector("#pd-detail-actions");
  const addAction = (label, fn) => { const button = document.createElement("button"); button.textContent = label; button.addEventListener("click", fn); actions.append(button); };
  if (doc.status === "draft" && doc.type === "invoice") addAction("Valider la facture", () => validateInvoice(doc, box));
  if (doc.type === "order" && ["ordered","partially_received"].includes(doc.status) && remaining > 0) addAction("Enregistrer une réception partielle", () => openReceipt(doc));
  if (doc.type === "invoice" && !doc.orderId && doc.status === "validated" && stockState?.settings?.purchase_trigger === "receipt" && remaining > 0) addAction("Enregistrer la réception physique", () => openReceipt(doc));
  if (doc.type === "invoice" && doc.status === "validating" && doc.pendingInvoiceReceipt) addAction("Réessayer la validation et l’entrée en stock", () => postReceipt(doc, doc.pendingInvoiceReceipt.lines, box, "supplier_invoice").then(() => { if (!doc.pendingInvoiceReceipt) { doc.status="validated"; doc.validatedAt=new Date().toISOString(); persist("Facture fournisseur validée."); } }));
  if (["draft","ordered"].includes(doc.status)) addAction("Annuler le document", () => { if (doc.type === "order" && doc.lines.some(line=>num(line.receivedBase)>0)) { box.querySelector("#pd-detail-error").textContent = "Une commande déjà reçue ne peut pas être annulée depuis cette action."; return; } doc.status="cancelled"; persist("Document annulé."); box.closest("dialog").close(); renderList(); });
}
async function postReceipt(doc, requestedLines, box, sourceType) {
  const pendingKey = sourceType === "supplier_invoice" ? "pendingInvoiceReceipt" : "pendingReceipt";
  if (!doc[pendingKey]) { doc[pendingKey] = { operationUid:uuid(), lines:requestedLines, sourceType, sourceId:String(doc.id) }; persist(); }
  const pending = doc[pendingKey];
  const requestKey = String(doc.id) + ":" + pendingKey;
  if (activeReceiptOperations.has(requestKey)) return;
  activeReceiptOperations.add(requestKey);
  try {
    const result = await postCloudStockDocument({
      operationUid:pending.operationUid, documentType:"receipt", documentDate:doc.date,
      reference:doc.reference || doc.number, note:"Réception fournisseur — " + supplierName(doc.supplierId),
      sourceType:pending.sourceType, sourceId:pending.sourceId,
      lines:pending.lines,
    });
    if (!result?.ok) throw new Error("Le serveur n'a pas confirmé la réception du stock.");
    for (const line of pending.lines) {
      const baseQty = num(line.quantity);
      const match = doc.lines[Number(line.line_index)];
      if (match) {
        if (sourceType === "supplier_invoice") {
          match.stockPostedBase = round(num(match.stockPostedBase) + baseQty);
          if (doc.orderId) {
            const linked = data().documents.find(item => item.id === doc.orderId);
            const orderLine = linked?.lines.find(item => String(item.productId) === String(match.productId) && String(item.warehouseId) === String(match.warehouseId));
            if (orderLine) orderLine.receivedBase = round(num(orderLine.receivedBase) + baseQty);
            if (linked) linked.status = linked.lines.every(item => num(item.receivedBase) >= item.baseQuantity) ? "received" : "partially_received";
          }
        } else match.receivedBase = round(num(match.receivedBase) + baseQty);
      }
    }
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
    <div class="table-wrap"><table><thead><tr><th>Article</th><th>Restant (base)</th><th>Reçu (base)</th><th>Lot / série</th></tr></thead><tbody>${doc.lines.map((line,index) => {
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
async function validateInvoice(doc, box) {
  if (doc.orderId) {
    const order=data().documents.find(item=>item.id===doc.orderId);
    const matchingError=validateInvoiceAgainstOrder(order,doc,{requireReceived:stockState?.settings?.purchase_trigger === "receipt"});
    if (matchingError) { box.querySelector("#pd-detail-error").textContent=matchingError; return; }
  }
  if (stockState?.settings?.purchase_trigger === "supplier_invoice") {
    const lines=[];
    for (const line of doc.lines) {
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
      if (doc.pendingInvoiceReceipt) return;
    }
  }
  doc.status="validated"; doc.validatedAt=new Date().toISOString(); persist("Facture fournisseur validée."); box.closest("dialog").close(); renderList();
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
