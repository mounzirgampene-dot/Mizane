import test from "node:test";
import assert from "node:assert/strict";
import { addDeliveryDays, summarizePurchaseOrder, buildPurchaseDeliveryDashboard } from "../js/purchase-delivery-tracking.js";

const order = (overrides = {}) => ({
  id: 1, type: "order", number: "BC-2026-0001", status: "ordered",
  lines: [{ productId: "p1", baseQuantity: 10, receivedBase: 0 }],
  ...overrides,
});

test("achats fournisseurs : calcule le délai prévisionnel depuis la date de commande", () => {
  assert.equal(addDeliveryDays("2026-11-26", 5), "2026-12-01");
  assert.equal(addDeliveryDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDeliveryDays("2026-02-30", 3), "");
  assert.equal(addDeliveryDays("2026-11-26", -1), "");
});

test("achats fournisseurs : détecte les commandes en retard et calcule le reliquat", () => {
  const result = summarizePurchaseOrder(order({
    status: "partially_received", expectedDeliveryDate: "2026-11-20",
    lines: [
      { productId: "p1", baseQuantity: 10, receivedBase: 4 },
      { lineType: "service", baseQuantity: 50, receivedBase: 0 },
    ],
    receiptHistory: [{ date: "2026-11-22" }, { date: "2026-11-24" }],
  }), "2026-11-26");
  assert.equal(result.deliveryState, "late");
  assert.equal(result.daysLate, 6);
  assert.equal(result.orderedBase, 10);
  assert.equal(result.receivedBase, 4);
  assert.equal(result.remainingBase, 6);
  assert.equal(result.progress, 40);
  assert.equal(result.receiptCount, 2);
});

test("achats fournisseurs : classe les livraisons à échéance aujourd'hui et sous sept jours", () => {
  assert.equal(summarizePurchaseOrder(order({ expectedDeliveryDate: "2026-11-26" }), "2026-11-26").deliveryState, "due_today");
  assert.equal(summarizePurchaseOrder(order({ expectedDeliveryDate: "2026-12-03" }), "2026-11-26").deliveryState, "due_soon");
  assert.equal(summarizePurchaseOrder(order({ expectedDeliveryDate: "2026-12-04" }), "2026-11-26").deliveryState, "on_track");
});

test("achats fournisseurs : signale une date absente et ignore les commandes closes dans les alertes", () => {
  const dashboard = buildPurchaseDeliveryDashboard([
    order({ id: 1, expectedDeliveryDate: null }),
    order({ id: 2, expectedDeliveryDate: "2026-11-20" }),
    order({ id: 3, status: "received", expectedDeliveryDate: "2026-11-20", lines: [{ baseQuantity: 10, receivedBase: 10 }] }),
    order({ id: 4, status: "cancelled", expectedDeliveryDate: "2026-11-20" }),
    order({ id: 5, status: "draft", expectedDeliveryDate: "2026-11-20" }),
  ], "2026-11-26");
  assert.equal(dashboard.totals.open, 2);
  assert.equal(dashboard.totals.missingDate, 1);
  assert.equal(dashboard.totals.late, 1);
  assert.equal(dashboard.totals.received, 1);
  assert.deepEqual(dashboard.alerts.map(item => item.orderId), [1, 2]);
});

test("achats fournisseurs : ne signale pas de retard quand le reliquat est nul", () => {
  const result = summarizePurchaseOrder(order({
    status: "received", expectedDeliveryDate: "2026-11-01",
    lines: [{ baseQuantity: 10, receivedBase: 10 }],
  }), "2026-11-26");
  assert.equal(result.deliveryState, "received");
  assert.equal(result.isOpen, false);
  assert.equal(result.remainingBase, 0);
});
