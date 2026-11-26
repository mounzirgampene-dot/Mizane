import test from "node:test";
import assert from "node:assert/strict";
import { buildStockReplenishmentReport, prepareStockReplenishmentDraftLines, stockReplenishmentCsv } from "../js/stock-replenishment.js";

const products = [
  { id: "p1", sku: "A-01", name: "Article A", type: "goods", unit: "pièce", minimumStock: 5, targetStock: 12 },
  { id: "p2", sku: "B-02", name: "Article B", type: "raw", unit: "kg", minimum_stock: 3, target_stock: 8 },
  { id: "p3", sku: "S-03", name: "Service", type: "service", minimumStock: 1, targetStock: 2 },
  { id: "p4", sku: "I-04", name: "Inactif", type: "goods", active: false, minimumStock: 1, targetStock: 2 },
];

test("réapprovisionnement : calcule le disponible après déduction des réservations", () => {
  const report = buildStockReplenishmentReport({
    products,
    warehouses: [{ id: "w1", name: "Principal" }, { id: "w2", name: "Secondaire" }],
    balances: [
      { product_id: "p1", warehouse_id: "w1", quantity: 4 },
      { product_id: "p1", warehouse_id: "w2", quantity: 3 },
      { product_id: "p2", warehouse_id: "w1", quantity: 10 },
    ],
    reservations: [{ product_id: "p1", warehouse_id: "w1", quantity: 2, status: "active" }],
  });
  assert.equal(report.ok, true);
  assert.equal(report.summary.monitored, 2);
  assert.equal(report.summary.alerts, 1);
  assert.equal(report.alerts[0].productId, "p1");
  assert.equal(report.alerts[0].onHand, 7);
  assert.equal(report.alerts[0].reserved, 2);
  assert.equal(report.alerts[0].available, 5);
  assert.equal(report.alerts[0].reorderQuantity, 7);
  assert.equal(report.lines.some(line => line.productId === "p3" || line.productId === "p4"), false);
});

test("réapprovisionnement : distingue rupture, seuil atteint et disponibilité incohérente", () => {
  const report = buildStockReplenishmentReport({
    products: [
      { id: "empty", name: "Vide", minimumStock: 2, targetStock: 6 },
      { id: "low", name: "Bas", minimumStock: 4, targetStock: 10 },
      { id: "conflict", name: "Conflit", minimumStock: 1, targetStock: 4 },
    ],
    warehouses: [{ id: "w1", name: "Principal" }],
    balances: [
      { product_id: "low", warehouse_id: "w1", quantity: 4 },
      { product_id: "conflict", warehouse_id: "w1", quantity: 2 },
    ],
    reservations: [{ product_id: "conflict", warehouse_id: "w1", quantity: 3 }],
  });
  assert.equal(report.summary.outOfStock, 1);
  assert.equal(report.summary.belowMinimum, 1);
  assert.equal(report.summary.reservationConflicts, 1);
  assert.deepEqual(report.alerts.map(line => line.status), ["reservation_conflict", "out_of_stock", "below_minimum"]);
  assert.equal(report.alerts.find(line => line.productId === "empty").reorderQuantity, 6);
});

test("réapprovisionnement : ignore les articles sans seuil et les réservations libérées", () => {
  const report = buildStockReplenishmentReport({
    products: [
      { id: "p1", name: "Sans seuil", minimumStock: 0, targetStock: 0 },
      { id: "p2", name: "Avec seuil", minimumStock: 2, targetStock: 5 },
    ],
    warehouses: [{ id: "w1" }],
    balances: [{ product_id: "p2", warehouse_id: "w1", quantity: 1 }],
    reservations: [{ product_id: "p2", warehouse_id: "w1", quantity: 1, status: "released" }],
  });
  assert.equal(report.summary.monitored, 1);
  assert.equal(report.alerts[0].available, 1);
  assert.equal(report.alerts[0].reorderQuantity, 4);
});

test("réapprovisionnement : refuse les seuils négatifs ou une cible inférieure au minimum", () => {
  const report = buildStockReplenishmentReport({
    products: [
      { id: "bad1", name: "Négatif", minimumStock: -1, targetStock: 2 },
      { id: "bad2", name: "Cible incohérente", minimumStock: 5, targetStock: 3 },
    ],
    warehouses: [{ id: "w1" }],
    balances: [],
    reservations: [],
  });
  assert.equal(report.ok, false);
  assert.equal(report.errors.length, 2);
  assert.equal(report.lines.length, 0);
});

test("réapprovisionnement : exporte un CSV avec séparateurs et guillemets protégés", () => {
  const report = buildStockReplenishmentReport({
    products: [{ id: "p1", sku: 'A;"1', name: 'Article "A"', minimumStock: 2, targetStock: 5 }],
    warehouses: [{ id: "w1", name: "Magasin; central" }],
    balances: [{ product_id: "p1", warehouse_id: "w1", quantity: 1 }],
  });
  const csv = stockReplenishmentCsv(report);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"A;""1"'));
  assert.ok(csv.includes('"Article ""A"""'));
  assert.ok(csv.includes('"Magasin; central: 1"'));
});


test("brouillon de réapprovisionnement : déduit les quantités encore ouvertes, brouillons compris", () => {
  const lines = [{
    productId: "p1", reorderQuantity: 10, unit: "pièce",
    warehouses: [{ warehouseId: "w1", available: 2 }, { warehouseId: "w2", available: 5 }],
  }];
  const documents = [
    { type: "order", status: "draft", lines: [{ productId: "p1", baseQuantity: 3, receivedBase: 1 }] },
    { type: "order", status: "partially_received", lines: [{ productId: "p1", baseQuantity: 2, receivedBase: 0 }] },
    { type: "order", status: "cancelled", lines: [{ productId: "p1", baseQuantity: 8, receivedBase: 0 }] },
    { type: "invoice", status: "validated", lines: [{ productId: "p1", baseQuantity: 9, receivedBase: 0 }] },
  ];
  const prepared = prepareStockReplenishmentDraftLines(
    lines, documents,
    [{ id: "p1", base_unit: "pièce", active: true }],
    [{ id: "w1", active: true }, { id: "w2", active: true }],
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].quantity, 6);
  assert.equal(prepared[0].baseQuantity, 6);
  assert.equal(prepared[0].unit, "pièce");
  assert.equal(prepared[0].warehouseId, "w1");
  assert.equal(prepared[0].unitCost, 0);
  assert.equal(prepared[0].alreadyOnOrder, 4);
});

test("brouillon de réapprovisionnement : ne duplique pas une commande déjà suffisante", () => {
  const prepared = prepareStockReplenishmentDraftLines(
    [{ productId: "p1", reorderQuantity: 5, warehouses: [{ warehouseId: "w1", available: 0 }] }],
    [{ type: "order", status: "ordered", lines: [{ productId: "p1", quantity: 5, factor: 1, receivedBase: 0 }] }],
    [{ id: "p1", base_unit: "unité" }],
    [{ id: "w1", active: true }],
  );
  assert.deepEqual(prepared, []);
});

test("brouillon de réapprovisionnement : ignore les articles non physiques et les entrepôts inactifs", () => {
  const prepared = prepareStockReplenishmentDraftLines(
    [
      { productId: "service", reorderQuantity: 3, warehouses: [{ warehouseId: "w1", available: 0 }] },
      { productId: "goods", reorderQuantity: 3, warehouses: [{ warehouseId: "w1", available: 0 }] },
    ],
    [],
    [{ id: "service", product_type: "service" }, { id: "goods", base_unit: "kg" }],
    [{ id: "w1", active: false }],
  );
  assert.deepEqual(prepared, []);
});
