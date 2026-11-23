// MIZANE — Moteur de gestion de stock (journal des mouvements, CUMP/FIFO).
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const uuid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function getStock(store) {
  if (!store.stock || typeof store.stock !== "object") {
    store.stock = {
      settings: { valuationMethod: "cump", allowNegative: false, salesTrigger: "delivery", purchaseTrigger: "receipt" },
      warehouses: [{ id: "main", name: "Magasin principal", active: true }],
      products: [], movements: [], layers: [], nextProductId: 1,
    };
  }
  const stock = store.stock;
  stock.settings ||= { valuationMethod: "cump", allowNegative: false, salesTrigger: "delivery", purchaseTrigger: "receipt" };
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
  return errors;
}
export function addProduct(store, input) {
  const stock = getStock(store);
  const errors = validateProduct(input, stock.products);
  if (errors.length) return { ok: false, errors };
  const product = {
    id: stock.nextProductId++, sku: String(input.sku).trim(), name: String(input.name).trim(),
    type: input.type, unit: String(input.unit || "unité").trim(), tracking: input.tracking,
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
  const quantity = round(Number(input.quantity));
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
  let unitCost = round(Number(input.unitCost || 0));
  if (kind === "receipt" && (!(unitCost >= 0) || !Number.isFinite(unitCost))) return { ok: false, error: "Coût unitaire invalide." };
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
  const movement = {
    id: uuid(), kind, productId: product.id, warehouseId: warehouse.id,
    destinationWarehouseId: kind === "transfer" ? input.destinationWarehouseId : null,
    quantity, quantityDelta: kind === "receipt" ? quantity : -quantity,
    unitCost, totalCost: valuationCost, reference: String(input.reference || "").trim(),
    date: input.date || new Date().toISOString().slice(0,10),
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
