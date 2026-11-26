/**
 * Suivi prévisionnel des commandes fournisseurs.
 * Calculs en lecture seule : aucun mouvement, statut ou paiement n'est modifié ici.
 */
const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round4 = value => Math.round((n(value) + Number.EPSILON) * 10000) / 10000;
const openStatuses = new Set(["ordered", "partially_received"]);
const validISODate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function addDeliveryDays(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 3650) return "";
  const parsed = new Date(date + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "";
  parsed.setUTCDate(parsed.getUTCDate() + Number(days));
  return parsed.toISOString().slice(0, 10);
}

export function summarizePurchaseOrder(order, today = new Date().toISOString().slice(0, 10)) {
  if (!order || order.type !== "order") return null;
  const lines = (order.lines || []).filter(line => line.lineType !== "service" && line.lineType !== "fixed_asset");
  const orderedBase = round4(lines.reduce((sum, line) => sum + Math.max(0, n(line.baseQuantity)), 0));
  const receivedBase = round4(lines.reduce((sum, line) => sum + Math.min(Math.max(0, n(line.baseQuantity)), Math.max(0, n(line.receivedBase))), 0));
  const remainingBase = round4(Math.max(0, orderedBase - receivedBase));
  const progress = orderedBase > 0 ? Math.min(100, Math.round(receivedBase / orderedBase * 10000) / 100) : 100;
  const expected = String(order.expectedDeliveryDate || "");
  const validExpected = validISODate(expected) && validISODate(today);
  const isOpen = openStatuses.has(order.status) && remainingBase > 0;
  const daysLate = validExpected && isOpen && expected < today ? Math.floor((Date.parse(today + "T00:00:00Z") - Date.parse(expected + "T00:00:00Z")) / 86400000) : 0;
  const daysUntil = validExpected ? Math.ceil((Date.parse(expected + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000) : null;
  let deliveryState = "not_applicable";
  if (order.status === "draft") deliveryState = "draft";
  else if (order.status === "cancelled") deliveryState = "cancelled";
  else if (remainingBase <= 0 || order.status === "received") deliveryState = "received";
  else if (!validExpected) deliveryState = "missing_date";
  else if (daysLate > 0) deliveryState = "late";
  else if (daysUntil === 0) deliveryState = "due_today";
  else if (daysUntil <= 7) deliveryState = "due_soon";
  else deliveryState = "on_track";
  return { orderId: order.id, number: order.number, status: order.status, expectedDeliveryDate: validExpected ? expected : "", orderedBase, receivedBase, remainingBase, progress, isOpen, daysLate, daysUntil, deliveryState, receiptCount: (order.receiptHistory || []).length };
}

export function buildPurchaseDeliveryDashboard(orders = [], today = new Date().toISOString().slice(0, 10)) {
  const summaries = orders.filter(order => order?.type === "order").map(order => summarizePurchaseOrder(order, today)).filter(Boolean);
  const alerts = summaries.filter(item => item.isOpen && ["late", "due_today", "due_soon", "missing_date"].includes(item.deliveryState));
  return { summaries, alerts, totals: {
    open: summaries.filter(item => item.isOpen).length,
    late: summaries.filter(item => item.deliveryState === "late").length,
    dueToday: summaries.filter(item => item.deliveryState === "due_today").length,
    dueSoon: summaries.filter(item => item.deliveryState === "due_soon").length,
    missingDate: summaries.filter(item => item.deliveryState === "missing_date").length,
    partial: summaries.filter(item => item.status === "partially_received" && item.remainingBase > 0).length,
    received: summaries.filter(item => item.deliveryState === "received").length,
  }};
}
