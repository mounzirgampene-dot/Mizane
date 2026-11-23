// MIZANE — Interface Gestion de stock.
import { store, $app, saveNow, esc, money, toast } from "./state.js";
import { getStock, addProduct, addWarehouse, postStockMovement, productBalance, stockBalance, stockValuation } from "./stock-core.js";

const fmtQty = n => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 4 });
const kinds = { goods:"Marchandise", raw:"Matière première", semi:"Semi-fini", finished:"Produit fini", consumable:"Consommable", service:"Service" };
const movementLabels = { receipt:"Entrée", issue:"Sortie", transfer:"Transfert" };
const persist = () => { saveNow(); window.dispatchEvent(new Event("mizane:billing-changed")); };

export function viewStock(readOnly = false, companyRole = null) {
  const stock = getStock(store);
  const physical = stock.products.filter(p => p.type !== "service");
  const totalProducts = stock.products.length;
  const totalUnits = physical.reduce((sum,p) => sum + productBalance(stock,p.id),0);
  const totalValue = physical.reduce((sum,p) => sum + stockValuation(stock,p.id),0);
  const recent = stock.movements.slice().reverse().slice(0,12);
  $app.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h1>Gestion de stock</h1><p class="muted">Articles, entrepôts, mouvements et valorisation.</p></div>
      <div class="actions">${readOnly ? "" : '<button id="stock-add-product">Nouvel article</button><button class="secondary" id="stock-add-warehouse">Nouvel entrepôt</button><button class="secondary" id="stock-new-movement">Nouveau mouvement</button>'}</div>
    </div>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Articles référencés</div><div class="value">${totalProducts}</div></section>
      <section class="card kpi"><div class="label">Unités en stock</div><div class="value">${fmtQty(totalUnits)}</div></section>
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
      ${recent.map(m => { const p=stock.products.find(x=>x.id===m.productId); const w=stock.warehouses.find(x=>x.id===m.warehouseId); const dest=stock.warehouses.find(x=>x.id===m.destinationWarehouseId); return `<tr><td>${esc(m.date)}</td><td>${movementLabels[m.kind]}</td><td>${esc(p?.name || "Article supprimé")}</td><td>${esc(w?.name || "—")}${dest ? " → "+esc(dest.name) : ""}</td><td class="num">${m.kind==="receipt"?"+":"−"}${fmtQty(m.quantity)}</td><td>${esc(m.reference || "—")}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">Aucun mouvement enregistré.</td></tr>'}
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
      <p class="muted">L'autorisation des stocks négatifs est désactivée par défaut. Toute activation doit être réservée à l'administrateur et auditée.</p>
    </section>`;
  if (readOnly) return;
  document.getElementById("stock-add-product").addEventListener("click", () => productDialog());
  document.getElementById("stock-add-warehouse").addEventListener("click", () => warehouseDialog());
  document.getElementById("stock-new-movement").addEventListener("click", () => movementDialog());
  document.getElementById("stock-valuation").addEventListener("change", e => { stock.settings.valuationMethod=e.target.value; persist(); viewStock(); });
  if (!companyRole || companyRole === "admin") document.getElementById("stock-negative").addEventListener("change", e => { stock.settings.allowNegative=e.target.checked; persist(); toast("Paramètre de stock enregistré."); });
  document.getElementById("stock-sales-trigger").addEventListener("change", e => { stock.settings.salesTrigger=e.target.value; persist(); toast("Paramètre de déclenchement enregistré."); });
  document.getElementById("stock-purchase-trigger").addEventListener("change", e => { stock.settings.purchaseTrigger=e.target.value; persist(); toast("Paramètre de déclenchement enregistré."); });
}
function productDialog() {
  const stock=getStock(store), modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un article</h2><div class="grid cols-2">
    <div><label>Référence / SKU</label><input id="sp-sku" maxlength="64"></div><div><label>Désignation</label><input id="sp-name" maxlength="180"></div>
    <div><label>Type</label><select id="sp-type">${Object.entries(kinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div><label>Unité</label><input id="sp-unit" value="unité" maxlength="24"></div>
    <div><label>Traçabilité</label><select id="sp-tracking"><option value="none">Aucune</option><option value="lot">Par lot</option><option value="serial">Par numéro de série</option></select></div>
  </div><div id="sp-error" class="errors"></div><div class="actions"><button id="sp-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal(); box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sp-save").onclick=()=>{ const result=addProduct(store,{sku:box.querySelector("#sp-sku").value,name:box.querySelector("#sp-name").value,type:box.querySelector("#sp-type").value,unit:box.querySelector("#sp-unit").value,tracking:box.querySelector("#sp-tracking").value}); if(!result.ok){box.querySelector("#sp-error").textContent=result.errors.join(" ");return;} persist();modal.close();viewStock();toast("Article créé."); };
}
function warehouseDialog() {
  const stock=getStock(store), modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un entrepôt</h2><label>Nom</label><input id="sw-name" maxlength="100"><div id="sw-error" class="errors"></div><div class="actions"><button id="sw-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sw-save").onclick=()=>{const r=addWarehouse(store,box.querySelector("#sw-name").value);if(!r.ok){box.querySelector("#sw-error").textContent=r.error;return;}persist();modal.close();viewStock();toast("Entrepôt créé.");};
}
function movementDialog() {
  const stock=getStock(store), modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  const physical=stock.products.filter(p=>p.type!=="service"&&p.active);
  if(!physical.length){toast("Créez d'abord un article physique.");return;}
  box.innerHTML=`<h2>Nouveau mouvement de stock</h2><div class="grid cols-2">
    <div><label>Opération</label><select id="sm-kind"><option value="receipt">Entrée</option><option value="issue">Sortie</option><option value="transfer">Transfert</option></select></div>
    <div><label>Article</label><select id="sm-product">${physical.map(p=>`<option value="${p.id}">${esc(p.sku)} — ${esc(p.name)}</option>`).join("")}</select></div>
    <div><label>Entrepôt source</label><select id="sm-warehouse">${stock.warehouses.filter(w=>w.active).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div id="sm-dest-wrap" hidden><label>Entrepôt destination</label><select id="sm-dest">${stock.warehouses.filter(w=>w.active).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div><label>Quantité</label><input id="sm-qty" type="number" min="0.0001" step="0.0001"></div>
    <div id="sm-cost-wrap"><label>Coût unitaire (${esc(store.settings.currency)})</label><input id="sm-cost" type="number" min="0" step="0.0001" value="0"></div>
    <div><label>Date</label><input id="sm-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div><label>Référence</label><input id="sm-ref" maxlength="120"></div>
  </div><label>Note</label><textarea id="sm-note" rows="2"></textarea><div id="sm-error" class="errors"></div><div class="actions"><button id="sm-save">Valider le mouvement</button><button class="secondary" data-close>Annuler</button></div>
  <p class="muted">Une validation de mouvement ajoute une ligne au journal. Les mouvements existants ne sont pas supprimés.</p>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  const kind=box.querySelector("#sm-kind"), dest=box.querySelector("#sm-dest-wrap"), cost=box.querySelector("#sm-cost-wrap");
  const update=()=>{dest.hidden=kind.value!=="transfer";cost.hidden=kind.value!=="receipt";};kind.onchange=update;update();
  box.querySelector("#sm-save").onclick=()=>{const r=postStockMovement(store,{kind:kind.value,productId:box.querySelector("#sm-product").value,warehouseId:box.querySelector("#sm-warehouse").value,destinationWarehouseId:box.querySelector("#sm-dest").value,quantity:box.querySelector("#sm-qty").value,unitCost:box.querySelector("#sm-cost").value,date:box.querySelector("#sm-date").value,reference:box.querySelector("#sm-ref").value,note:box.querySelector("#sm-note").value});if(!r.ok){box.querySelector("#sm-error").textContent=r.error;return;}persist();modal.close();viewStock();toast("Mouvement de stock enregistré.");};
}
