// MIZANE — Moteur de gestion de stock (journal des mouvements, CUMP/FIFO).
const round = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const uuid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function getStock(store) {
  if (!store.stock || typeof store.stock !== "object") {
    store.stock = {
      settings: { valuationMethod: "cump", allowNegative: false, salesTrigger: "delivery", purchaseTrigger: "receipt", accountingMode: "perpetual" },
      warehouses: [{ id: "main", name: "Magasin principal", active: true }],
      products: [], movements: [], layers: [], nextProductId: 1,
    };
  }
  const stock = store.stock;
  stock.settings ||= { valuationMethod: "cump", allowNegative: false, salesTrigger: "delivery", purchaseTrigger: "receipt", accountingMode: "perpetual" };
  stock.settings.accountingMode ||= "perpetual";
  stock.warehouses ||= [{ id: "main", name: "Magasin principal", active: true }];
  stock.products ||= [];
  stock.movements ||= [];
  stock.layers ||= [];
  stock.nextProductId = Math.max(1, Number(stock.nextProductId) || 1);
  stock.settings.valuationMethod ||= "cump";
  if (!["cump", "fifo"].includes(stock.settings.valuationMethod)) stock.settings.valuationMethod = "cump";
  return stock;
}

export function stockBalance(stock, productId, warehouseId) {
  if (Array.isArray(stock.cloudBalances)) {
    const balance = stock.cloudBalances.find(row => row.product_id === productId && row.warehouse_id === warehouseId);
    return round(Number(balance?.quantity || 0));
  }
  return round(stock.movements.reduce((sum, m) => {
    if (m.productId !== productId) return sum;
    if (m.warehouseId === warehouseId) return sum + Number(m.quantityDelta);
    if (m.destinationWarehouseId === warehouseId) return sum + Number(m.quantity);
    return sum;
  }, 0));
}
export function productBalance(stock, productId) {
  return round(stock.warehouses.reduce((sum, w) => sum + stockBalance(stock, productId, w.id), 0));
}
export function validateProduct(input, products = []) {
  const errors = [];
  if (!String(input.sku || "").trim()) errors.push("La référence article est obligatoire.");
  if (products.some(p => p.sku.toLowerCase() === String(input.sku).trim().toLowerCase())) errors.push("Cette référence existe déjà.");
  if (!String(input.name || "").trim()) errors.push("Le nom de l'article est obligatoire.");
  if (!["goods","raw","semi","finished","consumable","service"].includes(input.type)) errors.push("Type d'article invalide.");
  if (!["none","lot","serial"].includes(input.tracking)) errors.push("Traçabilité invalide.");
  if (input.type === "service" && input.tracking !== "none") errors.push("Un service ne peut pas avoir de traçabilité de stock.");
  const conversions = Array.isArray(input.unitConversions) ? input.unitConversions : [];
  const seenUnits = new Set([String(input.unit || "unité").trim().toLowerCase()]);
  for (const conversion of conversions) {
    const unit = String(conversion?.unit || "").trim().toLowerCase();
    const factor = Number(conversion?.factorToBase);
    if (!unit || unit.length > 24 || seenUnits.has(unit) || !(factor > 0) || !Number.isFinite(factor) || factor > 1e9) errors.push("Une conversion d’unité est invalide ou dupliquée.");
    seenUnits.add(unit);
  }
  if (input.tracking === "serial" && conversions.length) errors.push("Les articles suivis par numéro de série utilisent uniquement leur unité de base.");
  return errors;
}
export function addProduct(store, input) {
  const stock = getStock(store);
  const errors = validateProduct(input, stock.products);
  if (errors.length) return { ok: false, errors };
  const product = {
    id: stock.nextProductId++, sku: String(input.sku).trim(), name: String(input.name).trim(),
    type: input.type, unit: String(input.unit || "unité").trim(), tracking: input.tracking,
    unitConversions: (input.unitConversions || []).map(c => ({ unit:String(c.unit).trim(), factorToBase:Number(c.factorToBase) })),
    active: true, createdAt: new Date().toISOString(),
  };
  stock.products.push(product);
  return { ok: true, product };
}
function consumeFifo(stock, productId, warehouseId, quantity) {
  let remaining = quantity, cost = 0;
  const layers = stock.layers.filter(l => l.productId === productId && l.warehouseId === warehouseId && l.remaining > 0).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.remaining);
    layer.remaining = round(layer.remaining - take);
    remaining = round(remaining - take);
    cost = round(cost + take * layer.unitCost);
  }
  if (remaining > 0) return { ok: false, error: "Couches FIFO insuffisantes pour cette sortie." };
  return { ok: true, cost };
}
export function postStockMovement(store, input) {
  const stock = getStock(store);
  const product = stock.products.find(p => p.id === Number(input.productId) && p.active);
  if (!product) return { ok: false, error: "Article introuvable ou inactif." };
  if (product.type === "service") return { ok: false, error: "Un service ne peut pas faire l'objet d'un mouvement physique." };
  const inputUnit = String(input.unit || product.unit || "unité").trim();
  const conversion = inputUnit === product.unit ? null : (product.unitConversions || []).find(c => String(c.unit).toLowerCase() === inputUnit.toLowerCase());
  if (inputUnit !== product.unit && !conversion) return { ok:false, error:`Unité non autorisée : ${inputUnit}.` };
  const factor = conversion ? Number(conversion.factorToBase) : 1;
  if (product.tracking === "serial" && (factor !== 1 || inputUnit !== product.unit)) return { ok:false, error:"Les articles suivis par série doivent être saisis dans leur unité de base." };
  const quantity = round(Number(input.quantity) * factor);
  const movementDate = String(input.date || new Date().toISOString().slice(0,10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || Number.isNaN(Date.parse(movementDate + "T00:00:00Z")) || new Date(movementDate + "T00:00:00Z").toISOString().slice(0,10) !== movementDate) return { ok: false, error: "Date de mouvement invalide." };
  if (!(quantity > 0) || !Number.isFinite(quantity)) return { ok: false, error: "Quantité invalide." };
  const warehouse = stock.warehouses.find(w => w.id === input.warehouseId && w.active);
  if (!warehouse) return { ok: false, error: "Entrepôt source invalide." };
  const kind = input.kind;
  if (!["receipt","issue","transfer"].includes(kind)) return { ok: false, error: "Type de mouvement invalide." };
  if (kind === "transfer") {
    const destination = stock.warehouses.find(w => w.id === input.destinationWarehouseId && w.active);
    if (!destination || destination.id === warehouse.id) return { ok: false, error: "Entrepôt de destination invalide." };
  }
  const before = stockBalance(stock, product.id, warehouse.id);
  if (kind === "transfer" && before < quantity) return { ok: false, error: "Un transfert ne peut pas créer un stock négatif dans l'entrepôt source." };
  if (kind === "issue" && stock.settings.valuationMethod === "fifo" && before < quantity) return { ok: false, error: "La méthode FIFO exige des couches de stock disponibles pour valoriser cette sortie." };
  if (kind !== "receipt" && !stock.settings.allowNegative && before < quantity) {
    return { ok: false, error: `Stock insuffisant : ${before} ${product.unit} disponible(s).` };
  }
  let unitCost = round(Number(input.unitCost || 0) / factor);
  if (kind === "receipt" && (!(unitCost >= 0) || !Number.isFinite(unitCost))) return { ok: false, error: "Coût unitaire invalide." };
  const lotCode = String(input.lotCode || "").trim();
  const serialNumbers = Array.isArray(input.serialNumbers) ? input.serialNumbers.map(v=>String(v).trim()) : [];
  if (product.tracking === "lot" && (!lotCode || lotCode.length > 80 || serialNumbers.length)) return { ok:false, error:"Un code de lot valide est obligatoire." };
  if (product.tracking === "serial" && (quantity !== Math.trunc(quantity) || serialNumbers.length !== quantity || serialNumbers.some(v=>!v || v.length>120) || new Set(serialNumbers.map(v=>v.toLowerCase())).size !== serialNumbers.length || lotCode)) return { ok:false, error:"Saisissez un numéro de série unique pour chaque unité entière." };
  if (product.tracking === "none" && (lotCode || serialNumbers.length)) return { ok:false, error:"Cet article ne prend pas en charge la traçabilité." };
  const stockLotBalances = stock.lotBalances ||= [];
  const stockSerials = stock.serials ||= [];
  const sourceLot = product.tracking === "lot" ? stockLotBalances.find(x=>x.productId===product.id && x.warehouseId===warehouse.id && x.lotCode===lotCode) : null;
  if (product.tracking === "lot" && (kind === "issue" || kind === "transfer") && (!sourceLot || sourceLot.quantity < quantity)) return {ok:false,error:"Quantité insuffisante pour ce lot dans cet entrepôt."};
  if (product.tracking === "serial") {
    if (kind === "receipt") {
      const invalid = serialNumbers.find(serialNumber => { const existing=stockSerials.find(x=>x.serialNumber.toLowerCase()===serialNumber.toLowerCase()); return existing && (existing.productId!==product.id || existing.status!=="issued"); });
      if (invalid) return {ok:false,error:`Numéro de série déjà enregistré ou non disponible : ${invalid}.`};
    } else {
      const invalid = serialNumbers.find(serialNumber => !stockSerials.some(x=>x.productId===product.id && x.serialNumber.toLowerCase()===serialNumber.toLowerCase() && x.status==="in_stock" && x.warehouseId===warehouse.id));
      if (invalid) return {ok:false,error:`Numéro de série indisponible dans cet entrepôt : ${invalid}.`};
    }
  }
  let valuationCost = round(quantity * unitCost);
  if (kind === "issue" || kind === "transfer") {
    if (stock.settings.valuationMethod === "fifo") {
      const consumed = consumeFifo(stock, product.id, warehouse.id, quantity);
      if (!consumed.ok) return consumed;
      valuationCost = consumed.cost;
      unitCost = round(valuationCost / quantity);
    } else {
      const currentLayers = stock.layers.filter(l => l.productId === product.id && l.warehouseId === warehouse.id && l.remaining > 0);
      const totalQty = currentLayers.reduce((s,l) => s + l.remaining, 0);
      const totalValue = currentLayers.reduce((s,l) => s + l.remaining*l.unitCost, 0);
      unitCost = totalQty > 0 ? round(totalValue/totalQty) : 0;
      const availableToValue = Math.min(quantity, totalQty);
      valuationCost = round(availableToValue*unitCost);
      const consumptionRatio = totalQty > 0 ? Math.min(1, availableToValue/totalQty) : 0;
      for (const layer of currentLayers) {
        layer.remaining = round(layer.remaining * (1-consumptionRatio));
      }
    }
  }
  if (product.tracking === "lot") {
    if (kind === "receipt" || (kind === "adjustment" && input.direction === "increase")) {
      if (sourceLot) sourceLot.quantity=round(sourceLot.quantity+quantity); else stockLotBalances.push({productId:product.id,warehouseId:warehouse.id,lotCode,quantity});
    } else {
      sourceLot.quantity=round(sourceLot.quantity-quantity);
      if (kind === "transfer") { const destLot=stockLotBalances.find(x=>x.productId===product.id && x.warehouseId===input.destinationWarehouseId && x.lotCode===lotCode); if(destLot) destLot.quantity=round(destLot.quantity+quantity); else stockLotBalances.push({productId:product.id,warehouseId:input.destinationWarehouseId,lotCode,quantity}); }
    }
  }
  if (product.tracking === "serial") {
    if (kind === "receipt" || (kind === "adjustment" && input.direction === "increase")) {
      for (const serialNumber of serialNumbers) {
        const existing=stockSerials.find(x=>x.serialNumber.toLowerCase()===serialNumber.toLowerCase());
        if (existing) { existing.status="in_stock"; existing.warehouseId=warehouse.id; } else stockSerials.push({productId:product.id,serialNumber,warehouseId:warehouse.id,status:"in_stock"});
      }
    } else {
      for (const serialNumber of serialNumbers) {
        const existing=stockSerials.find(x=>x.productId===product.id && x.serialNumber.toLowerCase()===serialNumber.toLowerCase() && x.status==="in_stock" && x.warehouseId===warehouse.id);
        if (kind === "transfer") existing.warehouseId=input.destinationWarehouseId; else { existing.status="issued"; existing.warehouseId=null; }
      }
    }
  }
  const movement = {
    id: uuid(), kind, productId: product.id, warehouseId: warehouse.id,
    destinationWarehouseId: kind === "transfer" ? input.destinationWarehouseId : null,
    quantity, quantityDelta: kind === "receipt" ? quantity : -quantity,
    unitCost, totalCost: valuationCost, lotCode:lotCode || null, serialNumbers, inputQuantity:Number(input.quantity), inputUnit, conversionFactor:factor, reference: String(input.reference || "").trim(),
    date: movementDate,
    note: String(input.note || "").trim(), createdAt: new Date().toISOString(),
  };
  stock.movements.push(movement);
  if (kind === "receipt") {
    stock.layers.push({ id: uuid(), movementId: movement.id, productId: product.id, warehouseId: warehouse.id, quantity, remaining: quantity, unitCost, createdAt: movement.createdAt });
  } else if (kind === "transfer") {
    stock.layers.push({ id: uuid(), movementId: movement.id, productId: product.id, warehouseId: input.destinationWarehouseId, quantity, remaining: quantity, unitCost, createdAt: movement.createdAt });
  }
  return { ok: true, movement };
}
export function addWarehouse(store, name) {
  const stock = getStock(store), clean = String(name || "").trim();
  if (!clean) return { ok: false, error: "Nom d'entrepôt obligatoire." };
  if (stock.warehouses.some(w => w.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: "Cet entrepôt existe déjà." };
  const warehouse = { id: uuid(), name: clean, active: true, createdAt: new Date().toISOString() };
  stock.warehouses.push(warehouse);
  return { ok: true, warehouse };
}
export function stockValuation(stock, productId) {
  return round(stock.layers.filter(l => l.productId === productId && l.remaining > 0).reduce((sum,l) => sum + l.remaining*l.unitCost, 0));
}
