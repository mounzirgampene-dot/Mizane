// MIZANE — Interface Gestion de stock, locale hors SaaS et transactionnelle en entreprise.
import { store, $app, saveNow, esc, money, toast } from "./state.js";
import { getStock, addProduct, addWarehouse, postStockMovement, productBalance, stockBalance, stockValuation } from "./stock-core.js";
import {
  hasActiveStockCompany, readCloudStock, saveCloudStockProduct, saveCloudStockWarehouse,
  updateCloudStockSettings, postCloudStockDocument,
} from "./cloud-sync.js";

const fmtQty = n => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 4 });
const kinds = { goods:"Marchandise", raw:"Matière première", semi:"Semi-fini", finished:"Produit fini", consumable:"Consommable", service:"Service" };
const movementLabels = { receipt:"Entrée", issue:"Sortie", transfer:"Transfert", adjustment:"Ajustement" };
const persist = () => { saveNow(); window.dispatchEvent(new Event("mizane:billing-changed")); };
let renderSequence = 0;

function mapCloudStock(data) {
  const settings = data?.settings || {};
  const warehouses = (data?.warehouses || []).map(w => ({ id:w.id, code:w.code, name:w.name, active:w.active !== false }));
  const products = (data?.products || []).map(p => ({
    id:p.id, sku:p.sku, name:p.name, type:p.product_type, unit:p.base_unit || "unité",
    tracking:p.tracking || "none", active:p.active !== false,
  }));
  const documents = new Map((data?.documents || []).map(d => [d.id,d]));
  const grouped = new Map();
  for (const m of data?.movements || []) {
    const key = m.document_id + ":" + m.product_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m);
  }
  const movements = [];
  for (const entries of grouped.values()) {
    const first = entries[0], doc = documents.get(first.document_id) || {};
    const kind = doc.document_type || "issue";
    const negative = entries.find(m => Number(m.quantity_delta) < 0);
    const positive = entries.find(m => Number(m.quantity_delta) > 0);
    if (kind === "transfer" && negative && positive) {
      movements.push({
        id:first.document_id + ":" + first.product_id, kind, productId:first.product_id,
        warehouseId:negative.warehouse_id, destinationWarehouseId:positive.warehouse_id,
        quantity:Math.abs(Number(negative.quantity_delta)), quantityDelta:-Math.abs(Number(negative.quantity_delta)),
        unitCost:Number(negative.unit_cost || 0), date:negative.movement_date,
        reference:doc.reference || "", note:doc.note || "", documentId:doc.id,
      });
    } else {
      for (const m of entries) movements.push({
        id:m.id, kind, productId:m.product_id, warehouseId:m.warehouse_id,
        destinationWarehouseId:null, quantity:Math.abs(Number(m.quantity_delta)),
        quantityDelta:Number(m.quantity_delta), unitCost:Number(m.unit_cost || 0),
        date:m.movement_date, reference:doc.reference || "", note:doc.note || "", documentId:doc.id,
      });
    }
  }
  movements.sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const layers = (data?.balances || []).filter(b => Number(b.quantity) > 0).map(b => ({
    productId:b.product_id, warehouseId:b.warehouse_id, remaining:Number(b.quantity),
    unitCost:Number(b.inventory_value || 0) / Number(b.quantity),
  }));
  return {
    settings:{
      valuationMethod:settings.valuation_method || "cump",
      allowNegative:settings.allow_negative === true,
      salesTrigger:settings.sales_trigger || "delivery",
      purchaseTrigger:settings.purchase_trigger || "receipt",
      accountingMode:settings.accounting_mode || "perpetual",
    },
    warehouses, products, movements, layers,
    reservations:data?.reservations || [],
    balances:data?.balances || [],
  };
}

export function viewStock(readOnly = false, companyRole = null) {
  const sequence = ++renderSequence;
  if (hasActiveStockCompany()) {
    $app.innerHTML = '<section class="card"><p>Chargement du stock de l’entreprise…</p></section>';
    readCloudStock().then(data => {
      if (sequence !== renderSequence) return;
      renderStock(mapCloudStock(data), readOnly, companyRole, true);
    }).catch(error => {
      if (sequence !== renderSequence) return;
      $app.innerHTML = '<section class="card"><h2>Stock cloud indisponible</h2><p class="errors"></p><p class="muted">Aucune modification locale ne sera utilisée comme substitut aux données de l’entreprise.</p><button id="stock-retry">Réessayer</button></section>';
      $app.querySelector(".errors").textContent = error?.message || "Lecture du stock impossible.";
      document.getElementById("stock-retry")?.addEventListener("click", () => viewStock(readOnly, companyRole));
    });
    return;
  }
  renderStock(getStock(store), readOnly, companyRole, false);
}

function renderStock(stock, readOnly, companyRole, cloudMode) {
  const physical = stock.products.filter(p => p.type !== "service");
  const totalProducts = stock.products.length;
  const stockPositions = physical.reduce((sum,p) => sum + stock.warehouses.filter(w => stockBalance(stock,p.id,w.id) > 0).length,0);
  const totalValue = physical.reduce((sum,p) => sum + stockValuation(stock,p.id),0);
  const recent = stock.movements.slice().reverse().slice(0,12);
  $app.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h1>Gestion de stock</h1><p class="muted">${cloudMode ? "Données transactionnelles de l’entreprise" : "Mode local — données non synchronisées dans une entreprise."}</p></div>
      <div class="actions">${readOnly ? "" : '<button id="stock-add-product">Nouvel article</button><button class="secondary" id="stock-add-warehouse">Nouvel entrepôt</button><button class="secondary" id="stock-new-movement">Nouveau mouvement</button>'}</div>
    </div>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Articles référencés</div><div class="value">${totalProducts}</div></section>
      <section class="card kpi"><div class="label">Références en stock</div><div class="value">${stockPositions}</div></section>
      <section class="card kpi"><div class="label">Valeur estimée du stock</div><div class="value">${money(totalValue)}</div></section>
    </div>
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:center"><h2>Articles</h2><span class="muted">Méthode : ${stock.settings.valuationMethod.toUpperCase()}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Type</th><th>Unité</th><th class="num">Stock total</th><th class="num">Valeur</th></tr></thead>
      <tbody>${stock.products.map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${kinds[p.type] || p.type}</td><td>${esc(p.unit)}</td><td class="num">${p.type === "service" ? "—" : fmtQty(productBalance(stock,p.id))}</td><td class="num">${p.type === "service" ? "—" : money(stockValuation(stock,p.id))}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">Aucun article. Ajoutez votre premier article.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card">
      <h2>Stocks par entrepôt</h2>
      <div class="table-wrap"><table><thead><tr><th>Article</th>${stock.warehouses.map(w => `<th class="num">${esc(w.name)}</th>`).join("")}</tr></thead><tbody>
      ${physical.map(p => `<tr><td>${esc(p.sku)} — ${esc(p.name)}</td>${stock.warehouses.map(w => `<td class="num">${fmtQty(stockBalance(stock,p.id,w.id))}</td>`).join("")}</tr>`).join("") || '<tr><td class="muted">Aucun article physique.</td></tr>'}
      </tbody></table></div>
    </section>
    <section class="card">
      <h2>Derniers mouvements</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Article</th><th>Entrepôt</th><th class="num">Quantité</th><th>Référence</th></tr></thead><tbody>
      ${recent.map(m => { const p=stock.products.find(x=>x.id===m.productId); const w=stock.warehouses.find(x=>x.id===m.warehouseId); const dest=stock.warehouses.find(x=>x.id===m.destinationWarehouseId); return `<tr><td>${esc(m.date)}</td><td>${movementLabels[m.kind] || m.kind}</td><td>${esc(p?.name || "Article introuvable")}</td><td>${esc(w?.name || "—")}${dest ? " → "+esc(dest.name) : ""}</td><td class="num">${Number(m.quantityDelta ?? (m.kind==="receipt" ? m.quantity : -m.quantity))>=0?"+":"−"}${fmtQty(m.quantity)}</td><td>${esc(m.reference || "—")}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">Aucun mouvement enregistré.</td></tr>'}
      </tbody></table></div>
    </section>
    <section class="card">
      <h2>Paramètres</h2>
      <div class="row" style="align-items:end;flex-wrap:wrap">
        <div><label>Méthode de valorisation</label><select id="stock-valuation" ${readOnly?"disabled":""}><option value="cump" ${stock.settings.valuationMethod==="cump"?"selected":""}>CUMP</option><option value="fifo" ${stock.settings.valuationMethod==="fifo"?"selected":""}>FIFO</option></select></div>
        <div><label><input type="checkbox" id="stock-negative" ${stock.settings.allowNegative?"checked":""} ${(readOnly || (companyRole && companyRole !== "admin"))?"disabled":""}> Autoriser les stocks négatifs</label></div>
        <div><label>Déclenchement des sorties de ventes</label><select id="stock-sales-trigger" ${readOnly?"disabled":""}><option value="delivery" ${stock.settings.salesTrigger==="delivery"?"selected":""}>À la livraison</option><option value="invoice_validation" ${stock.settings.salesTrigger==="invoice_validation"?"selected":""}>À la validation de facture</option></select></div>
        <div><label>Déclenchement des entrées d'achats</label><select id="stock-purchase-trigger" ${readOnly?"disabled":""}><option value="receipt" ${stock.settings.purchaseTrigger==="receipt"?"selected":""}>À la réception physique</option><option value="supplier_invoice" ${stock.settings.purchaseTrigger==="supplier_invoice"?"selected":""}>À la validation facture fournisseur</option></select></div>
      </div>
      <p class="muted">L'autorisation des stocks négatifs est désactivée par défaut. Toute activation est réservée à l'administrateur et auditée côté serveur.</p>
      ${cloudMode ? `<p class="muted">Réservations actives : ${stock.reservations.length}</p>` : ""}
    </section>`;
  if (readOnly) return;
  document.getElementById("stock-add-product").addEventListener("click", () => productDialog(cloudMode));
  document.getElementById("stock-add-warehouse").addEventListener("click", () => warehouseDialog(cloudMode));
  document.getElementById("stock-new-movement").addEventListener("click", () => movementDialog(cloudMode));
  document.getElementById("stock-valuation").addEventListener("change", e => changeSettings({valuation_method:e.target.value}, cloudMode));
  document.getElementById("stock-negative").addEventListener("change", e => changeSettings({allow_negative:e.target.checked}, cloudMode));
  document.getElementById("stock-sales-trigger").addEventListener("change", e => changeSettings({sales_trigger:e.target.value}, cloudMode));
  document.getElementById("stock-purchase-trigger").addEventListener("change", e => changeSettings({purchase_trigger:e.target.value}, cloudMode));
}

async function changeSettings(changes, cloudMode) {
  try {
    if (cloudMode) await updateCloudStockSettings(changes);
    else {
      const stock = getStock(store);
      if ("valuation_method" in changes) stock.settings.valuationMethod=changes.valuation_method;
      if ("allow_negative" in changes) stock.settings.allowNegative=changes.allow_negative;
      if ("sales_trigger" in changes) stock.settings.salesTrigger=changes.sales_trigger;
      if ("purchase_trigger" in changes) stock.settings.purchaseTrigger=changes.purchase_trigger;
      persist();
    }
    toast("Paramètres de stock enregistrés.");
    viewStock(false, cloudMode ? "admin" : null);
  } catch(error) {
    toast(error?.message || "Enregistrement du paramètre impossible.", 5000);
    viewStock(false, null);
  }
}

function productDialog(cloudMode = false) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un article</h2><div class="grid cols-2">
    <div><label>Référence / SKU</label><input id="sp-sku" maxlength="64"></div><div><label>Désignation</label><input id="sp-name" maxlength="180"></div>
    <div><label>Type</label><select id="sp-type">${Object.entries(kinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div><label>Unité</label><input id="sp-unit" value="unité" maxlength="24"></div>
    <div><label>Traçabilité</label><select id="sp-tracking"><option value="none">Aucune</option><option value="lot" disabled>Par lot — prochain lot</option><option value="serial" disabled>Par numéro de série — prochain lot</option></select></div>
  </div><div id="sp-error" class="errors"></div><div class="actions"><button id="sp-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal(); box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sp-save").onclick=async()=>{
    const input={sku:box.querySelector("#sp-sku").value,name:box.querySelector("#sp-name").value,type:box.querySelector("#sp-type").value,unit:box.querySelector("#sp-unit").value,tracking:box.querySelector("#sp-tracking").value};
    try {
      if (cloudMode) await saveCloudStockProduct({sku:input.sku,name:input.name,product_type:input.type,base_unit:input.unit,tracking:input.tracking,category:""});
      else { const result=addProduct(store,input); if(!result.ok){box.querySelector("#sp-error").textContent=result.errors.join(" ");return;} persist(); }
      modal.close();viewStock(false,null);toast("Article créé.");
    } catch(error) { box.querySelector("#sp-error").textContent=error?.message || "Création impossible."; }
  };
}

function warehouseCode(name) {
  const base=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32) || "MAGASIN";
  return base + "-" + (globalThis.crypto?.randomUUID?.().slice(0,6).toUpperCase() || String(Date.now()).slice(-6));
}
function warehouseDialog(cloudMode = false) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un entrepôt</h2><label>Nom</label><input id="sw-name" maxlength="100"><div id="sw-error" class="errors"></div><div class="actions"><button id="sw-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sw-save").onclick=async()=>{
    const name=box.querySelector("#sw-name").value;
    try {
      if (cloudMode) await saveCloudStockWarehouse({code:warehouseCode(name),name});
      else {const r=addWarehouse(store,name);if(!r.ok){box.querySelector("#sw-error").textContent=r.error;return;}persist();}
      modal.close();viewStock(false,null);toast("Entrepôt créé.");
    } catch(error) { box.querySelector("#sw-error").textContent=error?.message || "Création impossible."; }
  };
}

function movementDialog(cloudMode = false) {
  const stock=cloudMode ? null : getStock(store);
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  if (cloudMode) {
    readCloudStock().then(data => openMovementDialog(mapCloudStock(data),true)).catch(error => toast(error?.message || "Lecture du stock impossible.",5000));
    return;
  }
  openMovementDialog(stock,false);
}
function openMovementDialog(stock, cloudMode) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  const physical=stock.products.filter(p=>p.type!=="service"&&p.active);
  const warehouses=stock.warehouses.filter(w=>w.active);
  if(!physical.length){toast("Créez d'abord un article physique.");return;}
  if(!warehouses.length){toast("Créez d'abord un entrepôt.");return;}
  box.innerHTML=`<h2>Nouveau mouvement de stock</h2><div class="grid cols-2">
    <div><label>Opération</label><select id="sm-kind"><option value="receipt">Entrée</option><option value="issue">Sortie</option><option value="transfer">Transfert</option></select></div>
    <div><label>Article</label><select id="sm-product">${physical.map(p=>`<option value="${p.id}">${esc(p.sku)} — ${esc(p.name)}</option>`).join("")}</select></div>
    <div><label>Entrepôt source</label><select id="sm-warehouse">${warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div id="sm-dest-wrap" hidden><label>Entrepôt destination</label><select id="sm-dest">${warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div><label>Quantité</label><input id="sm-qty" type="number" min="0.0001" step="0.0001"></div>
    <div id="sm-cost-wrap"><label>Coût unitaire (${esc(store.settings.currency)})</label><input id="sm-cost" type="number" min="0" step="0.0001" value="0"></div>
    <div><label>Date</label><input id="sm-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div><label>Référence</label><input id="sm-ref" maxlength="120"></div>
  </div><label>Note</label><textarea id="sm-note" rows="2"></textarea><div id="sm-error" class="errors"></div><div class="actions"><button id="sm-save">Valider le mouvement</button><button class="secondary" data-close>Annuler</button></div>
  <p class="muted">Le serveur valide les quantités disponibles, la valorisation et les périodes comptables. Le journal des mouvements est conservé.</p>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  const kind=box.querySelector("#sm-kind"), dest=box.querySelector("#sm-dest-wrap"), cost=box.querySelector("#sm-cost-wrap");
  const update=()=>{dest.hidden=kind.value!=="transfer";cost.hidden=kind.value!=="receipt";};kind.onchange=update;update();
  box.querySelector("#sm-save").onclick=async()=>{
    const input={kind:kind.value,productId:box.querySelector("#sm-product").value,warehouseId:box.querySelector("#sm-warehouse").value,destinationWarehouseId:box.querySelector("#sm-dest").value,quantity:box.querySelector("#sm-qty").value,unitCost:box.querySelector("#sm-cost").value,date:box.querySelector("#sm-date").value,reference:box.querySelector("#sm-ref").value,note:box.querySelector("#sm-note").value};
    try {
      if (cloudMode) {
        const operationUid=globalThis.crypto?.randomUUID?.();
        if (!operationUid) throw new Error("Navigateur incompatible : génération sécurisée de clé d’opération indisponible.");
        const line={product_id:input.productId,warehouse_id:input.warehouseId,quantity:Number(input.quantity),unit_cost:Number(input.unitCost||0)};
        if(input.kind==="transfer") line.destination_warehouse_id=input.destinationWarehouseId;
        await postCloudStockDocument({operationUid,documentType:input.kind,documentDate:input.date,reference:input.reference,note:input.note,lines:[line]});
      } else {
        const r=postStockMovement(store,input);if(!r.ok){box.querySelector("#sm-error").textContent=r.error;return;}persist();
      }
      modal.close();viewStock(false,null);toast("Mouvement de stock enregistré.");
    } catch(error) { box.querySelector("#sm-error").textContent=error?.message || "Validation impossible."; }
  };
}
