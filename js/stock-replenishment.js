// MIZANE — Seuils de réapprovisionnement et alertes de disponibilité.
const round4 = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const valueOf = (object, camel, snake, fallback = 0) => object?.[camel] ?? object?.[snake] ?? fallback;

export function buildStockReplenishmentReport({ products = [], warehouses = [], balances = [], reservations = [] } = {}) {
  const errors = [];
  if (!Array.isArray(products) || !Array.isArray(warehouses) || !Array.isArray(balances) || !Array.isArray(reservations)) {
    return { ok: false, errors: ["Les données de réapprovisionnement sont invalides."], lines: [], alerts: [], summary: { monitored: 0, alerts: 0, outOfStock: 0, belowMinimum: 0, reservationConflicts: 0 } };
  }

  const positions = new Map();
  for (const balance of balances) {
    const productId = String(balance?.product_id ?? balance?.productId ?? "");
    const warehouseId = String(balance?.warehouse_id ?? balance?.warehouseId ?? "");
    const quantity = Number(balance?.quantity ?? 0);
    if (!productId || !warehouseId || !Number.isFinite(quantity)) {
      errors.push("Une position de stock contient un identifiant ou une quantité invalide.");
      continue;
    }
    if (!positions.has(productId)) positions.set(productId, new Map());
    const byWarehouse = positions.get(productId);
    byWarehouse.set(warehouseId, round4((byWarehouse.get(warehouseId) || 0) + quantity));
  }

  const reserved = new Map();
  for (const reservation of reservations) {
    if (reservation?.status && reservation.status !== "active") continue;
    const productId = String(reservation?.product_id ?? reservation?.productId ?? "");
    const warehouseId = String(reservation?.warehouse_id ?? reservation?.warehouseId ?? "");
    const quantity = Number(reservation?.quantity);
    if (!productId || !warehouseId || !(quantity > 0) || !Number.isFinite(quantity)) {
      errors.push("Une réservation active contient une quantité ou une référence invalide.");
      continue;
    }
    if (!reserved.has(productId)) reserved.set(productId, new Map());
    const byWarehouse = reserved.get(productId);
    byWarehouse.set(warehouseId, round4((byWarehouse.get(warehouseId) || 0) + quantity));
  }

  const lines = [];
  for (const product of products) {
    if (!product || product.active === false || (product.type ?? product.product_type) === "service") continue;
    const productId = String(product.id ?? "");
    if (!productId) {
      errors.push("Un article physique ne possède pas d’identifiant.");
      continue;
    }
    const minimum = Number(valueOf(product, "minimumStock", "minimum_stock"));
    const target = Number(valueOf(product, "targetStock", "target_stock", minimum));
    if (!Number.isFinite(minimum) || !Number.isFinite(target) || minimum < 0 || target < minimum || target >= 1000000000000) {
      errors.push("Seuils invalides pour l’article " + String(product.sku || product.name || productId) + ".");
      continue;
    }
    if (minimum === 0 && target === 0) continue;

    const productPositions = positions.get(productId) || new Map();
    const productReservations = reserved.get(productId) || new Map();
    const warehouseRows = warehouses.map(warehouse => {
      const warehouseId = String(warehouse.id);
      const onHand = round4(productPositions.get(warehouseId) || 0);
      const reservedQuantity = round4(productReservations.get(warehouseId) || 0);
      return {
        warehouseId,
        warehouseName: String(warehouse.name || warehouse.code || warehouseId),
        onHand,
        reserved: reservedQuantity,
        available: round4(onHand - reservedQuantity),
      };
    });
    const onHand = round4(warehouseRows.reduce((sum, row) => sum + row.onHand, 0));
    const reservedQuantity = round4(warehouseRows.reduce((sum, row) => sum + row.reserved, 0));
    const available = round4(onHand - reservedQuantity);
    const status = available < 0 ? "reservation_conflict"
      : available <= 0 ? "out_of_stock"
      : available <= minimum ? "below_minimum" : "healthy";
    const reorderQuantity = status === "healthy" ? 0 : round4(Math.max(0, target - Math.max(0, available)));
    lines.push({
      productId,
      sku: String(product.sku || ""),
      name: String(product.name || ""),
      unit: String(product.unit || product.base_unit || "unité"),
      onHand,
      reserved: reservedQuantity,
      available,
      minimumStock: round4(minimum),
      targetStock: round4(target),
      reorderQuantity,
      status,
      warehouses: warehouseRows,
    });
  }

  const priority = { reservation_conflict: 0, out_of_stock: 1, below_minimum: 2, healthy: 3 };
  lines.sort((a, b) => priority[a.status] - priority[b.status] || b.reorderQuantity - a.reorderQuantity || a.name.localeCompare(b.name, "fr"));
  const alerts = lines.filter(line => line.status !== "healthy");
  const summary = {
    monitored: lines.length,
    alerts: alerts.length,
    outOfStock: alerts.filter(line => line.status === "out_of_stock").length,
    belowMinimum: alerts.filter(line => line.status === "below_minimum").length,
    reservationConflicts: alerts.filter(line => line.status === "reservation_conflict").length,
  };
  return { ok: errors.length === 0, errors, lines, alerts, summary };
}

export function stockReplenishmentCsv(report) {
  if (!report || !Array.isArray(report.lines)) return "";
  const quote = value => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  const rows = [
    ["Référence", "Article", "Unité", "Stock physique", "Réservé", "Disponible", "Seuil minimum", "Stock cible", "Quantité suggérée", "État", "Détail par entrepôt"],
    ...report.lines.map(line => [
      line.sku, line.name, line.unit, line.onHand, line.reserved, line.available,
      line.minimumStock, line.targetStock, line.reorderQuantity,
      line.status,
      line.warehouses.map(warehouse => warehouse.warehouseName + ": " + warehouse.available).join(" | "),
    ]),
  ];
  return "\uFEFF" + rows.map(row => row.map(quote).join(";")).join("\r\n");
}
