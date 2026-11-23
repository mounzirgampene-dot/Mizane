// MIZANE — Interface Gestion de stock, locale hors SaaS et transactionnelle en entreprise.
import { store, $app, saveNow, esc, money, toast } from "./state.js";
import { getStock, addProduct, addWarehouse, postStockMovement, productBalance, stockBalance, stockValuation } from "./stock-core.js";
import {
  hasActiveStockCompany, readCloudStock, saveCloudStockProduct, saveCloudStockWarehouse,
  updateCloudStockSettings, postCloudStockDocument,
  reserveCloudStock, releaseCloudStockReservation,
  readCloudStockCounts, createCloudStockCount, setCloudStockCountLine,
  submitCloudStockCount, finalizeCloudStockCount, cancelCloudStockCount,
} from "./cloud-sync.js";

const fmtQty = n => Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 4 });
const kinds = { goods:"Marchandise", raw:"Matière première", semi:"Semi-fini", finished:"Produit fini", consumable:"Consommable", service:"Service" };
const movementLabels = { receipt:"Entrée", issue:"Sortie", transfer:"Transfert", adjustment:"Ajustement" };
const trackingLabels = { none:"Aucune", lot:"Par lot", serial:"Par numéro de série" };
const persist = () => { saveNow(); window.dispatchEvent(new Event("mizane:billing-changed")); };
let renderSequence = 0;

function mapCloudStock(data) {
  const settings = data?.settings || {};
  const warehouses = (data?.warehouses || []).map(w => ({ id:w.id, code:w.code, name:w.name, active:w.active !== false }));
  const conversionsByProduct = new Map();
  for (const c of data?.unit_conversions || []) { if (!conversionsByProduct.has(c.product_id)) conversionsByProduct.set(c.product_id,[]); conversionsByProduct.get(c.product_id).push({unit:c.unit_code,factorToBase:Number(c.factor_to_base)}); }
  const products = (data?.products || []).map(p => ({
    id:p.id, sku:p.sku, name:p.name, type:p.product_type, unit:p.base_unit || "unité",
    tracking:p.tracking || "none", unitConversions:conversionsByProduct.get(p.id)||[], active:p.active !== false,
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
        unitCost:Number(negative.unit_cost || 0), date:negative.movement_date, createdAt:negative.created_at,
        reference:doc.reference || "", note:doc.note || "", sourceType:doc.source_type || null, sourceId:doc.source_id || null, documentId:doc.id, documentStatus:doc.status,
      });
    } else {
      for (const m of entries) movements.push({
        id:m.id, kind, productId:m.product_id, warehouseId:m.warehouse_id,
        destinationWarehouseId:null, quantity:Math.abs(Number(m.quantity_delta)),
        quantityDelta:Number(m.quantity_delta), unitCost:Number(m.unit_cost || 0),
        date:m.movement_date, createdAt:m.created_at, reference:doc.reference || "", note:doc.note || "", sourceType:doc.source_type || null, sourceId:doc.source_id || null, documentId:doc.id, documentStatus:doc.status,
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
    cloudBalances:data?.balances || [],
    reservations:data?.reservations || [], documents:data?.documents || [],
    lots:data?.lots || [], serials:data?.serials || [],
    balances:data?.balances || [],
    countSessions:data?.countSessions || [],
  };
}

function stockMigrationKey() {
  return "mizane_stock_migration_v1:" + localStorage.getItem("mizane_active_company_v1");
}
function readStockMigrationProgress() {
  try { const raw=localStorage.getItem(stockMigrationKey()); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function saveStockMigrationProgress(progress) {
  localStorage.setItem(stockMigrationKey(),JSON.stringify(progress));
}
async function stableStockOperationUid(value) {
  if (!globalThis.crypto?.subtle) throw new Error("Le navigateur ne permet pas de créer une clé d’importation stable.");
  const digest=await globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  const bytes=Array.from(new Uint8Array(digest).slice(0,16));
  bytes[6]=(bytes[6]&0x0f)|0x50; bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.map(b=>b.toString(16).padStart(2,"0")).join("");
  return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
}
async function importLegacyStock(companyRole) {
  const legacy=store.stock;
  if (!legacy || !Array.isArray(legacy.products) || !legacy.products.length) throw new Error("Aucun ancien article local à importer.");
  if (!["admin","accountant"].includes(companyRole)) throw new Error("Seul un administrateur ou un comptable peut lancer l’import.");
  if (!globalThis.confirm("Importer l’ancien stock local dans l’entreprise ? Les opérations seront rejouées avec des identifiants idempotents.")) return;
  const progress=readStockMigrationProgress() || {started:true,done:false,productMap:{},warehouseMap:{},completed:0};
  progress.started=true; saveStockMigrationProgress(progress);
  let remote=await readCloudStock();
  const remoteProducts=new Map((remote.products||[]).map(p=>[String(p.sku).toLowerCase(),p]));
  const remoteWarehouses=new Map((remote.warehouses||[]).map(w=>[String(w.name).toLowerCase(),w]));
  for (const product of legacy.products) {
    let saved=remoteProducts.get(String(product.sku||"").toLowerCase());
    if (!saved) {
      saved=await saveCloudStockProduct({
        sku:product.sku,name:product.name,product_type:product.type||"goods",
        base_unit:product.unit||"unité",tracking:"none",active:product.active!==false,category:"",
      });
      remoteProducts.set(String(saved.sku).toLowerCase(),saved);
    }
    progress.productMap[String(product.id)]=saved.id;
    saveStockMigrationProgress(progress);
  }
  const oldWarehouses=Array.isArray(legacy.warehouses)?legacy.warehouses:[];
  for (const warehouse of oldWarehouses) {
    let saved=remoteWarehouses.get(String(warehouse.name||"").toLowerCase());
    if (!saved) {
      saved=await saveCloudStockWarehouse({
        code:warehouseCode(warehouse.name),name:warehouse.name||"Magasin principal",active:warehouse.active!==false,
      });
      remoteWarehouses.set(String(saved.name).toLowerCase(),saved);
    }
    progress.warehouseMap[String(warehouse.id)]=saved.id;
    saveStockMigrationProgress(progress);
  }
  remote=await readCloudStock();
  if (!(remote.movements||[]).length && !progress.settingsApplied) {
    const settings=legacy.settings||{};
    await updateCloudStockSettings({
      valuation_method:settings.valuationMethod==="fifo"?"fifo":"cump",
      allow_negative:companyRole==="admin" && settings.allowNegative===true,
      sales_trigger:settings.salesTrigger==="invoice_validation"?"invoice_validation":"delivery",
      purchase_trigger:settings.purchaseTrigger==="supplier_invoice"?"supplier_invoice":"receipt",
      accounting_mode:settings.accountingMode==="periodic"?"periodic":"perpetual",
    });
    progress.settingsApplied=true; saveStockMigrationProgress(progress);
  }
  progress.completed=0; saveStockMigrationProgress(progress);
  const movements=(legacy.movements||[]).map((m,index)=>({...m,_index:index}))
    .sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")) || String(a.createdAt||"").localeCompare(String(b.createdAt||"")) || a._index-b._index);
  const companyId=localStorage.getItem("mizane_active_company_v1");
  for (const movement of movements) {
    const productId=progress.productMap[String(movement.productId)];
    const warehouseId=progress.warehouseMap[String(movement.warehouseId)];
    const destinationWarehouseId=progress.warehouseMap[String(movement.destinationWarehouseId)];
    if (!productId || !warehouseId) throw new Error("Correspondance article/entrepôt introuvable pour un ancien mouvement.");
    if (!["receipt","issue","transfer"].includes(movement.kind)) throw new Error("Type d’ancien mouvement non reconnu : "+movement.kind);
    if (movement.kind==="transfer" && !destinationWarehouseId) throw new Error("Entrepôt destinataire introuvable pour un ancien transfert.");
    const legacyId=String(movement.id ?? (movement.date+"-"+movement._index));
    const operationUid=await stableStockOperationUid(companyId+":legacy-stock:"+legacyId);
    const line={product_id:productId,warehouse_id:warehouseId,quantity:Number(movement.quantity),unit_cost:Number(movement.unitCost||0)};
    if (movement.kind==="transfer") line.destination_warehouse_id=destinationWarehouseId;
    await postCloudStockDocument({
      operationUid,documentType:movement.kind,
      documentDate:movement.date||new Date().toISOString().slice(0,10),
      reference:movement.reference||"IMPORT-LOCAL",note:movement.note||"Import historique du stock local",
      lines:[line],sourceType:"legacy_local_stock",sourceId:legacyId,
    });
    progress.completed+=1; saveStockMigrationProgress(progress);
  }
  progress.done=true; progress.completed=movements.length; saveStockMigrationProgress(progress);
  toast("Import historique terminé : "+legacy.products.length+" article(s), "+movements.length+" mouvement(s).",6000);
}

export function viewStock(readOnly = false, companyRole = null) {
  const sequence = ++renderSequence;
  if (hasActiveStockCompany()) {
    $app.innerHTML = '<section class="card"><p>Chargement du stock de l’entreprise…</p></section>';
    Promise.all([readCloudStock(),readCloudStockCounts()]).then(([data,countData]) => {
      if (sequence !== renderSequence) return;
      data.countSessions=countData?.sessions || [];
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
  const lots = cloudMode ? (stock.lots || []) : (stock.lotBalances || []);
  const serials = stock.serials || [];
  const totalProducts = stock.products.length;
  const stockPositions = physical.reduce((sum,p) => sum + stock.warehouses.filter(w => stockBalance(stock,p.id,w.id) > 0).length,0);
  const totalValue = physical.reduce((sum,p) => sum + stockValuation(stock,p.id),0);
  const recent = stock.movements.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt||"").localeCompare(String(b.createdAt||""))).reverse().slice(0,12);
  const legacyStock=cloudMode ? store.stock : null;
  const migrationProgress=cloudMode ? readStockMigrationProgress() : null;
  const remoteIsEmpty=cloudMode && !stock.products.length && !stock.movements.length && !(stock.balances||[]).length;
  const showLegacyImport=cloudMode && !readOnly && ["admin","accountant"].includes(companyRole) && legacyStock && Array.isArray(legacyStock.products) && legacyStock.products.length>0 && (remoteIsEmpty || (migrationProgress?.started && !migrationProgress?.done));
  const lotRows = lots.filter(l=>Number(l.quantity)>0).map(l=>{const p=stock.products.find(x=>x.id===(l.product_id||l.productId));const w=stock.warehouses.find(x=>x.id===(l.warehouse_id||l.warehouseId));return `<tr><td>${esc(p?.sku||"")} — ${esc(p?.name||"Article")}</td><td>${esc(l.lot_code||l.lotCode||"")}</td><td>${esc(w?.name||"—")}</td><td class="num">${fmtQty(l.quantity)}</td></tr>`;}).join("");
  const serialRows = serials.map(s=>{const p=stock.products.find(x=>x.id===(s.product_id||s.productId));const w=stock.warehouses.find(x=>x.id===(s.warehouse_id||s.warehouseId));const status=s.status==="in_stock"?"En stock":s.status==="in_transit"?"En transit":"Sorti";return `<tr><td>${esc(s.serial_number||s.serialNumber||"")}</td><td>${esc(p?.sku||"")} — ${esc(p?.name||"Article")}</td><td>${esc(w?.name||"—")}</td><td>${status}</td></tr>`;}).join("");
  const traceabilityHtml = (lotRows || serialRows) ? `<section class="card"><h2>Traçabilité</h2>${lotRows ? `<h3>Lots disponibles</h3><div class="table-wrap"><table><thead><tr><th>Article</th><th>Lot</th><th>Entrepôt</th><th class="num">Quantité</th></tr></thead><tbody>${lotRows}</tbody></table></div>` : ""}${serialRows ? `<h3>Numéros de série</h3><div class="table-wrap"><table><thead><tr><th>Numéro</th><th>Article</th><th>Entrepôt</th><th>État</th></tr></thead><tbody>${serialRows}</tbody></table></div>` : ""}</section>` : "";
  $app.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h1>Gestion de stock</h1><p class="muted">${cloudMode ? "Données transactionnelles de l’entreprise" : "Mode local — données non synchronisées dans une entreprise."}</p></div>
      <div class="actions">${readOnly ? "" : '<button id="stock-add-product">Nouvel article</button><button class="secondary" id="stock-add-warehouse">Nouvel entrepôt</button><button class="secondary" id="stock-new-movement">Nouveau mouvement</button>'}${cloudMode && !readOnly ? '<button class="secondary" id="stock-new-reservation">Réserver du stock</button>' : ""}</div>
    </div>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Articles référencés</div><div class="value">${totalProducts}</div></section>
      <section class="card kpi"><div class="label">Références en stock</div><div class="value">${stockPositions}</div></section>
      <section class="card kpi"><div class="label">Valeur estimée du stock</div><div class="value">${money(totalValue)}</div></section>
    </div>
    ${showLegacyImport ? '<section class="card"><h2>Reprise de l’ancien stock</h2><p class="muted">Ancien stock local détecté : '+legacyStock.products.length+' article(s) et '+(legacyStock.movements||[]).length+' mouvement(s). Import explicite, chronologique et idempotent.</p><button id="stock-import-legacy">'+(migrationProgress?.started ? 'Reprendre l’import' : 'Importer l’ancien stock local')+'</button><p class="muted">'+(migrationProgress?.started ? 'Progression : '+(migrationProgress.completed||0)+' mouvement(s).' : 'Aucune donnée locale ne sera supprimée.')+'</p></section>' : ""}
    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:center"><h2>Articles</h2><span class="muted">Méthode : ${stock.settings.valuationMethod.toUpperCase()}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Type</th><th>Unité</th><th>Traçabilité</th><th class="num">Stock total</th><th class="num">Valeur</th></tr></thead>
      <tbody>${stock.products.map(p => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${kinds[p.type] || p.type}</td><td>${esc(p.unit)}</td><td>${trackingLabels[p.tracking] || "Aucune"}</td><td class="num">${p.type === "service" ? "—" : fmtQty(productBalance(stock,p.id))}</td><td class="num">${p.type === "service" ? "—" : money(stockValuation(stock,p.id))}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">Aucun article. Ajoutez votre premier article.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card">
      <h2>Stocks par entrepôt</h2>
      <div class="table-wrap"><table><thead><tr><th>Article</th>${stock.warehouses.map(w => `<th class="num">${esc(w.name)}</th>`).join("")}</tr></thead><tbody>
      ${physical.map(p => `<tr><td>${esc(p.sku)} — ${esc(p.name)}</td>${stock.warehouses.map(w => `<td class="num">${fmtQty(stockBalance(stock,p.id,w.id))}</td>`).join("")}</tr>`).join("") || '<tr><td class="muted">Aucun article physique.</td></tr>'}
      </tbody></table></div>
    </section>
    ${traceabilityHtml}\n    ${cloudMode && !readOnly ? `<section class="card"><h2>Inventaire physique</h2><p class="muted">Le comptage intégral gèle les mouvements de l’entrepôt jusqu’à validation ou annulation.</p><button id="stock-count-start">Démarrer un inventaire</button>${(stock.countSessions||[]).filter(s=>["counting","submitted"].includes(s.status)).map(s=>`<p><strong>${esc(s.reference)}</strong> — ${esc(s.warehouse_name)} — ${s.status==="counting"?"Comptage en cours":"En attente d’approbation"}</p><button class="secondary" data-count-open="${esc(s.id)}">Ouvrir le comptage</button>`).join("")}</section>` : ""}
    <section class="card">
      <h2>Derniers mouvements</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Article</th><th>Entrepôt</th><th class="num">Quantité</th><th>Référence</th><th>Origine</th></tr></thead><tbody>
      ${recent.map(m => { const p=stock.products.find(x=>x.id===m.productId); const w=stock.warehouses.find(x=>x.id===m.warehouseId); const dest=stock.warehouses.find(x=>x.id===m.destinationWarehouseId); return `<tr><td>${esc(m.date)}</td><td>${movementLabels[m.kind] || m.kind}</td><td>${esc(p?.name || "Article introuvable")}</td><td>${esc(w?.name || "—")}${dest ? " → "+esc(dest.name) : ""}</td><td class="num">${Number(m.quantityDelta ?? (m.kind==="receipt" ? m.quantity : -m.quantity))>=0?"+":"−"}${fmtQty(m.quantity)}</td><td>${esc(m.reference || "—")}</td><td>${m.sourceType === "sales_invoice" ? "Facture client" : m.sourceType === "sales_delivery" ? "Livraison client" : m.sourceType === "supplier_receipt" ? "Réception fournisseur" : "Mouvement manuel"}</td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">Aucun mouvement enregistré.</td></tr>'}
      </tbody></table></div>
    </section>
    ${cloudMode && stock.reservations.length ? `<section class="card"><h2>Réservations actives</h2><p class="muted">Les sorties liées aux factures et livraisons clients consomment automatiquement les réservations les plus anciennes ; le reliquat reste protégé et visible ici.</p><div class="table-wrap"><table><thead><tr><th>Article</th><th>Entrepôt</th><th class="num">Quantité</th><th>Référence</th>${readOnly ? "" : "<th>Action</th>"}</tr></thead><tbody>${stock.reservations.map(r => { const p=stock.products.find(x=>x.id===r.product_id); const w=stock.warehouses.find(x=>x.id===r.warehouse_id); return `<tr><td>${esc(p?.name || "Article")}</td><td>${esc(w?.name || "Entrepôt")}</td><td class="num">${fmtQty(r.quantity)}</td><td>${esc(r.reference || "—")}</td>${readOnly ? "" : `<td><button class="secondary" data-stock-release="${esc(r.id)}">Libérer</button></td>`}</tr>`; }).join("")}</tbody></table></div></section>` : ""}
    <section class="card">
      <h2>Paramètres</h2>
      <div class="row" style="align-items:end;flex-wrap:wrap">
        <div><label>Méthode de valorisation</label><select id="stock-valuation" ${readOnly?"disabled":""}><option value="cump" ${stock.settings.valuationMethod==="cump"?"selected":""}>CUMP</option><option value="fifo" ${stock.settings.valuationMethod==="fifo"?"selected":""}>FIFO</option></select></div>
        <div><label><input type="checkbox" id="stock-negative" ${stock.settings.allowNegative?"checked":""} ${(readOnly || (companyRole && companyRole !== "admin"))?"disabled":""}> Autoriser les stocks négatifs</label></div>
        <div><label>Déclenchement des sorties de ventes</label><select id="stock-sales-trigger" ${readOnly?"disabled":""}><option value="delivery" ${stock.settings.salesTrigger==="delivery"?"selected":""}>À la livraison</option><option value="invoice_validation" ${stock.settings.salesTrigger==="invoice_validation"?"selected":""}>À la validation de facture</option></select></div>
        <div><label>Déclenchement des entrées d'achats</label><select id="stock-purchase-trigger" ${readOnly?"disabled":""}><option value="receipt" ${stock.settings.purchaseTrigger==="receipt"?"selected":""}>À la réception physique</option><option value="supplier_invoice" ${stock.settings.purchaseTrigger==="supplier_invoice"?"selected":""}>À la validation facture fournisseur</option></select></div>
        <div><label>Mode de comptabilisation</label><select id="stock-accounting-mode" ${readOnly?"disabled":""}><option value="perpetual" ${stock.settings.accountingMode==="perpetual"?"selected":""}>Inventaire permanent</option><option value="periodic" ${stock.settings.accountingMode==="periodic"?"selected":""}>Inventaire intermittent</option></select></div>
      </div>
      <p class="muted">L'autorisation des stocks négatifs est désactivée par défaut. Toute activation est réservée à l'administrateur et auditée côté serveur.</p>
      ${cloudMode ? `<p class="muted">Réservations actives : ${stock.reservations.length}</p>` : ""}
    </section>`;
  if (readOnly) return;
  document.getElementById("stock-add-product").addEventListener("click", () => productDialog(cloudMode, companyRole));
  document.getElementById("stock-import-legacy")?.addEventListener("click", async e => { e.currentTarget.disabled=true; try { await importLegacyStock(companyRole); viewStock(false,companyRole); } catch(error) { toast(error?.message||"Import impossible.",6000); e.currentTarget.disabled=false; } });
  document.getElementById("stock-add-warehouse").addEventListener("click", () => warehouseDialog(cloudMode, companyRole));
  document.getElementById("stock-new-movement").addEventListener("click", () => movementDialog(cloudMode, companyRole));
  document.getElementById("stock-count-start")?.addEventListener("click", () => inventoryCreateDialog(stock,companyRole));
  document.querySelectorAll("[data-count-open]").forEach(b=>b.addEventListener("click",()=>inventoryOpenDialog(stock.countSessions.find(x=>x.id===b.dataset.countOpen),stock,companyRole)));
  document.getElementById("stock-new-reservation")?.addEventListener("click", () => reservationDialog(companyRole));
  document.querySelectorAll("[data-stock-release]").forEach(button => button.addEventListener("click", () => releaseReservation(button.dataset.stockRelease, companyRole)));
  document.getElementById("stock-valuation").addEventListener("change", e => changeSettings({valuation_method:e.target.value}, cloudMode, companyRole));
  document.getElementById("stock-negative").addEventListener("change", e => changeSettings({allow_negative:e.target.checked}, cloudMode, companyRole));
  document.getElementById("stock-sales-trigger").addEventListener("change", e => changeSettings({sales_trigger:e.target.value}, cloudMode, companyRole));
  document.getElementById("stock-purchase-trigger").addEventListener("change", e => changeSettings({purchase_trigger:e.target.value}, cloudMode, companyRole));
  document.getElementById("stock-accounting-mode").addEventListener("change", e => changeSettings({accounting_mode:e.target.value}, cloudMode, companyRole));
}

async function changeSettings(changes, cloudMode, companyRole) {
  try {
    if (cloudMode) await updateCloudStockSettings(changes);
    else {
      const stock = getStock(store);
      if ("valuation_method" in changes) stock.settings.valuationMethod=changes.valuation_method;
      if ("allow_negative" in changes) stock.settings.allowNegative=changes.allow_negative;
      if ("sales_trigger" in changes) stock.settings.salesTrigger=changes.sales_trigger;
      if ("purchase_trigger" in changes) stock.settings.purchaseTrigger=changes.purchase_trigger;
      if ("accounting_mode" in changes) stock.settings.accountingMode=changes.accounting_mode;
      persist();
    }
    toast("Paramètres de stock enregistrés.");
    viewStock(false, companyRole);
  } catch(error) {
    toast(error?.message || "Enregistrement du paramètre impossible.", 5000);
    viewStock(false, companyRole);
  }
}

function productDialog(cloudMode = false, companyRole = null) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un article</h2><div class="grid cols-2">
    <div><label>Référence / SKU</label><input id="sp-sku" maxlength="64"></div><div><label>Désignation</label><input id="sp-name" maxlength="180"></div>
    <div><label>Type</label><select id="sp-type">${Object.entries(kinds).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
    <div><label>Unité de base</label><input id="sp-unit" value="unité" maxlength="24"></div>
    <div><label>Traçabilité</label><select id="sp-tracking"><option value="none">Aucune</option><option value="lot">Par lot</option><option value="serial">Par numéro de série</option></select></div>
    <div><label>Conversions (format : carton=12 ; palette=120)</label><input id="sp-conversions" maxlength="600" placeholder="carton=12 ; palette=120"></div>
  </div><p class="muted">Le facteur indique le nombre d’unités de base contenues dans une unité alternative. Les conversions sont verrouillées après le premier mouvement. Les articles suivis par série utilisent leur unité de base.</p><div id="sp-error" class="errors"></div><div class="actions"><button id="sp-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal(); box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sp-save").onclick=async()=>{
    const rawConversions=box.querySelector("#sp-conversions").value;
    const unitConversions=rawConversions.split(/[;\n]/).map(part=>part.trim()).filter(Boolean).map(part=>{const [unit,factor]=part.split("=");return {unit:String(unit||"").trim(),factorToBase:Number(factor)};});
    const input={sku:box.querySelector("#sp-sku").value,name:box.querySelector("#sp-name").value,type:box.querySelector("#sp-type").value,unit:box.querySelector("#sp-unit").value,tracking:box.querySelector("#sp-tracking").value,unitConversions};
    try {
      if (cloudMode) await saveCloudStockProduct({sku:input.sku,name:input.name,product_type:input.type,base_unit:input.unit,tracking:input.tracking,unit_conversions:input.unitConversions.map(c=>({unit_code:c.unit,factor_to_base:c.factorToBase})),category:""});
      else { const result=addProduct(store,input); if(!result.ok){box.querySelector("#sp-error").textContent=result.errors.join(" ");return;} persist(); }
      modal.close();viewStock(false,companyRole);toast("Article créé.");
    } catch(error) { box.querySelector("#sp-error").textContent=error?.message || "Création impossible."; }
  };
}

function warehouseCode(name) {
  const base=String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32) || "MAGASIN";
  return base + "-" + (globalThis.crypto?.randomUUID?.().slice(0,6).toUpperCase() || String(Date.now()).slice(-6));
}
function warehouseDialog(cloudMode = false, companyRole = null) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  box.innerHTML=`<h2>Créer un entrepôt</h2><label>Nom</label><input id="sw-name" maxlength="100"><div id="sw-error" class="errors"></div><div class="actions"><button id="sw-save">Enregistrer</button><button class="secondary" data-close>Annuler</button></div>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sw-save").onclick=async()=>{
    const name=box.querySelector("#sw-name").value;
    try {
      if (cloudMode) await saveCloudStockWarehouse({code:warehouseCode(name),name});
      else {const r=addWarehouse(store,name);if(!r.ok){box.querySelector("#sw-error").textContent=r.error;return;}persist();}
      modal.close();viewStock(false,companyRole);toast("Entrepôt créé.");
    } catch(error) { box.querySelector("#sw-error").textContent=error?.message || "Création impossible."; }
  };
}


async function releaseReservation(reservationId, companyRole) {
  try {
    await releaseCloudStockReservation(reservationId);
    toast("Réservation libérée.");
    viewStock(false,companyRole);
  } catch(error) { toast(error?.message||"Libération impossible.",5000); }
}
function reservationDialog(companyRole) {
  readCloudStock().then(data => {
    const stock=mapCloudStock(data), modal=document.getElementById("modal"), box=document.getElementById("modal-content");
    const products=stock.products.filter(p=>p.active&&p.type!=="service");
    const warehouses=stock.warehouses.filter(w=>w.active);
    if(!products.length||!warehouses.length){toast("Créez d'abord un article physique et un entrepôt.");return;}
    box.innerHTML='<h2>Réserver du stock</h2><label>Article</label><select id="sr-product">'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.sku)+' — '+esc(p.name)+'</option>').join("")+'</select><label>Entrepôt</label><select id="sr-warehouse">'+warehouses.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join("")+'</select><label>Quantité</label><input id="sr-quantity" type="number" min="0.0001" step="0.0001"><label>Référence</label><input id="sr-reference" maxlength="120"><div id="sr-error" class="errors"></div><div class="actions"><button id="sr-save">Réserver</button><button class="secondary" data-close>Annuler</button></div>';
    modal.showModal(); box.querySelector("[data-close]").onclick=()=>modal.close();
    box.querySelector("#sr-save").onclick=async()=>{
      try {
        await reserveCloudStock({operationUid:globalThis.crypto.randomUUID(),productId:box.querySelector("#sr-product").value,warehouseId:box.querySelector("#sr-warehouse").value,quantity:Number(box.querySelector("#sr-quantity").value),reference:box.querySelector("#sr-reference").value});
        modal.close();toast("Stock réservé.");viewStock(false,companyRole);
      } catch(error) { box.querySelector("#sr-error").textContent=error?.message||"Réservation impossible."; }
    };
  }).catch(error=>toast(error?.message||"Lecture du stock impossible.",5000));
}

function movementDialog(cloudMode = false, companyRole = null) {
  const stock=cloudMode ? null : getStock(store);
  if (cloudMode) {
    readCloudStock().then(data => openMovementDialog(mapCloudStock(data),true,companyRole)).catch(error => toast(error?.message || "Lecture du stock impossible.",5000));
    return;
  }
  openMovementDialog(stock,false,companyRole);
}
function openMovementDialog(stock, cloudMode, companyRole = null) {
  const modal=document.getElementById("modal"), box=document.getElementById("modal-content");
  const physical=stock.products.filter(p=>p.type!=="service"&&p.active);
  const warehouses=stock.warehouses.filter(w=>w.active);
  if(!physical.length){toast("Créez d'abord un article physique.");return;}
  if(!warehouses.length){toast("Créez d'abord un entrepôt.");return;}
  box.innerHTML=`<h2>Nouveau mouvement de stock</h2><div class="grid cols-2">
    <div><label>Opération</label><select id="sm-kind"><option value="receipt">Entrée</option><option value="issue">Sortie</option><option value="transfer">Transfert</option><option value="adjustment" ${cloudMode ? "" : "disabled"}>Ajustement</option></select></div>
    <div><label>Article</label><select id="sm-product">${physical.map(p=>`<option value="${p.id}">${esc(p.sku)} — ${esc(p.name)}</option>`).join("")}</select></div>
    <div><label>Entrepôt source</label><select id="sm-warehouse">${warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div id="sm-direction-wrap" hidden><label>Sens de l’ajustement</label><select id="sm-direction"><option value="increase">Augmentation</option><option value="decrease">Diminution</option></select></div>
    <div id="sm-dest-wrap" hidden><label>Entrepôt destination</label><select id="sm-dest">${warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
    <div><label>Quantité</label><input id="sm-qty" type="number" min="0.0001" step="0.0001"></div>
    <div><label>Unité de saisie</label><select id="sm-unit"></select></div>
    <div id="sm-lot-wrap" hidden><label>Code du lot</label><input id="sm-lot" maxlength="80"></div>
    <div id="sm-serial-wrap" hidden><label>Numéros de série (un par ligne ou séparés par virgule)</label><textarea id="sm-serials" rows="2"></textarea></div>
    <div id="sm-cost-wrap"><label>Coût unitaire (${esc(store.settings.currency)})</label><input id="sm-cost" type="number" min="0" step="0.0001" value="0"></div>
    <div><label>Date</label><input id="sm-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div><label>Référence</label><input id="sm-ref" maxlength="120" placeholder="BL / facture fournisseur"></div><div id="sm-supplier-wrap" hidden><label>Fournisseur</label><input id="sm-supplier" maxlength="180"></div>
  </div><label>Note</label><textarea id="sm-note" rows="2"></textarea><div id="sm-error" class="errors"></div><div class="actions"><button id="sm-save">Valider le mouvement</button><button class="secondary" data-close>Annuler</button></div>
  <p class="muted">Le serveur valide les quantités disponibles, la valorisation et les périodes comptables. Les entrées peuvent être référencées par un bon de livraison ou une pièce fournisseur ; le journal conserve leur origine.</p>`;
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  const kind=box.querySelector("#sm-kind"), productSelect=box.querySelector("#sm-product"), dest=box.querySelector("#sm-dest-wrap"), cost=box.querySelector("#sm-cost-wrap"), directionWrap=box.querySelector("#sm-direction-wrap"), direction=box.querySelector("#sm-direction");
  const supplierWrap=box.querySelector("#sm-supplier-wrap");const update=()=>{const product=physical.find(p=>String(p.id)===productSelect.value);dest.hidden=kind.value!=="transfer";directionWrap.hidden=kind.value!=="adjustment";supplierWrap.hidden=kind.value!=="receipt";cost.hidden=!(kind.value==="receipt" || (kind.value==="adjustment" && direction.value==="increase"));
    const units=[product?.unit||"unité",...(product?.unitConversions||[]).map(c=>c.unit)];box.querySelector("#sm-unit").innerHTML=units.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join("");
    box.querySelector("#sm-lot-wrap").hidden=product?.tracking!=="lot";box.querySelector("#sm-serial-wrap").hidden=product?.tracking!=="serial";
  };kind.onchange=update;direction.onchange=update;productSelect.onchange=update;update();
  box.querySelector("#sm-save").onclick=async()=>{
    const serialNumbers=box.querySelector("#sm-serials").value.split(/[\r\n,;]/).map(v=>v.trim()).filter(Boolean);
    const input={kind:kind.value,productId:box.querySelector("#sm-product").value,warehouseId:box.querySelector("#sm-warehouse").value,destinationWarehouseId:box.querySelector("#sm-dest").value,quantity:box.querySelector("#sm-qty").value,unit:box.querySelector("#sm-unit").value,unitCost:box.querySelector("#sm-cost").value,lotCode:box.querySelector("#sm-lot").value,serialNumbers,date:box.querySelector("#sm-date").value,reference:box.querySelector("#sm-ref").value,note:[box.querySelector("#sm-supplier").value.trim()?"Fournisseur : "+box.querySelector("#sm-supplier").value.trim():"",box.querySelector("#sm-note").value].filter(Boolean).join(" — "),direction:box.querySelector("#sm-direction")?.value};
    try {
      if (cloudMode) {
        const operationUid=globalThis.crypto?.randomUUID?.();
        if (!operationUid) throw new Error("Navigateur incompatible : génération sécurisée de clé d’opération indisponible.");
        const line={product_id:input.productId,warehouse_id:input.warehouseId,quantity:Number(input.quantity),unit:input.unit,unit_cost:Number(input.unitCost||0)};
        if(input.lotCode) line.lot_code=input.lotCode;
        if(input.serialNumbers.length) line.serial_numbers=input.serialNumbers;
        if(input.kind==="transfer") line.destination_warehouse_id=input.destinationWarehouseId;
        if(input.kind==="adjustment") line.direction=box.querySelector("#sm-direction").value;
        await postCloudStockDocument({operationUid,documentType:input.kind,documentDate:input.date,reference:input.reference,note:input.note,lines:[line],sourceType:input.kind==="receipt"?"supplier_receipt":"manual_stock",sourceId:input.kind==="receipt"?(input.reference||operationUid):operationUid});
      } else {
        const r=postStockMovement(store,input);if(!r.ok){box.querySelector("#sm-error").textContent=r.error;return;}persist();
      }
      modal.close();viewStock(false,companyRole);toast("Mouvement de stock enregistré.");
    } catch(error) { box.querySelector("#sm-error").textContent=error?.message || "Validation impossible."; }
  };
}


function inventoryCreateDialog(stock,companyRole) {
  const warehouses=stock.warehouses.filter(w=>w.active); if(!warehouses.length){toast("Créez d’abord un entrepôt actif.");return;}
  const modal=document.getElementById("modal"),box=document.getElementById("modal-content");
  box.innerHTML='<h2>Démarrer un inventaire</h2><label>Entrepôt</label><select id="sic-warehouse">'+warehouses.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join("")+'</select><label>Référence</label><input id="sic-reference" maxlength="120" value="INV-'+new Date().toISOString().slice(0,10)+'"><p class="muted">Tous les mouvements de cet entrepôt seront gelés jusqu’à validation ou annulation.</p><div id="sic-error" class="errors"></div><div class="actions"><button id="sic-create">Démarrer</button><button class="secondary" data-close>Annuler</button></div>';
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sic-create").onclick=async()=>{try{await createCloudStockCount({warehouseId:box.querySelector("#sic-warehouse").value,reference:box.querySelector("#sic-reference").value.trim()});modal.close();toast("Inventaire démarré. Entrepôt gelé.");viewStock(false,companyRole);}catch(e){box.querySelector("#sic-error").textContent=e.message||"Démarrage impossible."; }};
}
function inventoryOpenDialog(session,stock,companyRole) {
  if(!session)return; const modal=document.getElementById("modal"),box=document.getElementById("modal-content");
  const products=new Map(stock.products.map(p=>[p.id,p]));
  const rows=session.lines.map(l=>{const p=products.get(l.product_id);return '<tr><td>'+esc(p?.sku||"")+' — '+esc(p?.name||"Article")+'</td><td>'+fmtQty(l.snapshot_quantity)+'</td><td>'+(session.status==="counting"?'<input type="number" min="0" step="0.0001" data-count-line="'+esc(l.id)+'" value="'+(l.counted_quantity??"")+'">':fmtQty(l.counted_quantity))+'</td><td>'+(l.counted_quantity==null?"—":fmtQty(Number(l.counted_quantity)-Number(l.snapshot_quantity)))+'</td></tr>';}).join("");
  box.innerHTML='<h2>Inventaire — '+esc(session.reference)+'</h2><p>'+esc(session.warehouse_name)+'</p><div class="table-wrap"><table><thead><tr><th>Article</th><th>Théorique</th><th>Compté</th><th>Écart</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(session.status==="counting"?'<div class="actions"><button id="sic-save">Enregistrer les quantités</button><button class="secondary" id="sic-submit">Soumettre</button>':'<p class="muted">Inventaire soumis : validation finale réservée à un administrateur.</p>'+(companyRole==="admin"?'<button id="sic-finalize">Approuver et comptabiliser</button>':""))+'<button class="secondary" id="sic-cancel">Annuler l’inventaire</button><button class="secondary" data-close>Fermer</button><div id="sic-error" class="errors"></div>';
  modal.showModal();box.querySelector("[data-close]").onclick=()=>modal.close();
  box.querySelector("#sic-save")?.addEventListener("click",async()=>{const btn=box.querySelector("#sic-save");btn.disabled=true;try{for(const input of box.querySelectorAll("[data-count-line]")){if(input.value.trim()==="")continue;const n=Number(input.value);if(!Number.isFinite(n)||n<0)throw new Error("Quantité comptée invalide.");await setCloudStockCountLine({sessionId:session.id,lineId:input.dataset.countLine,countedQuantity:n});}toast("Comptages enregistrés.");modal.close();viewStock(false,companyRole);}catch(e){box.querySelector("#sic-error").textContent=e.message||"Enregistrement impossible.";btn.disabled=false;}});
  box.querySelector("#sic-submit")?.addEventListener("click",async()=>{const btn=box.querySelector("#sic-submit");btn.disabled=true;try{for(const input of box.querySelectorAll("[data-count-line]")){if(input.value.trim()==="")continue;const n=Number(input.value);if(!Number.isFinite(n)||n<0)throw new Error("Quantité comptée invalide.");await setCloudStockCountLine({sessionId:session.id,lineId:input.dataset.countLine,countedQuantity:n});}await submitCloudStockCount(session.id);toast("Inventaire soumis pour approbation.");modal.close();viewStock(false,companyRole);}catch(e){box.querySelector("#sic-error").textContent=e.message||"Soumission impossible.";btn.disabled=false;}});
  box.querySelector("#sic-finalize")?.addEventListener("click",async()=>{try{await finalizeCloudStockCount({sessionId:session.id,operationUid:globalThis.crypto.randomUUID(),documentDate:new Date().toISOString().slice(0,10)});toast("Inventaire approuvé et comptabilisé.");modal.close();viewStock(false,companyRole);}catch(e){box.querySelector("#sic-error").textContent=e.message||"Validation impossible."; }});
  box.querySelector("#sic-cancel")?.addEventListener("click",async()=>{if(!confirm("Annuler l’inventaire et libérer l’entrepôt ?"))return;try{await cancelCloudStockCount(session.id);toast("Inventaire annulé.");modal.close();viewStock(false,companyRole);}catch(e){box.querySelector("#sic-error").textContent=e.message||"Annulation impossible."; }});
}
