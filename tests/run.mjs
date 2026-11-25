import "./tax-compliance.test.js";
import "./tax.test.js";
import "./customer-followups.test.js";
import "./fixed-assets.test.js";
import "./asset-disposals.test.js";
// MIZANE — Tests du moteur comptable. Exécution : node tests/run.mjs
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { cleanSecrets, fingerprint, shouldRetryFunctionError, localSnapshot, orderOperations, syncAccounting, validateSyncStore } from "../js/accounting-sync.js";
import {
  newStore, validDate, validateEntry, postEntry, reverseEntry, trialBalance, ledger,
  incomeStatement, balanceSheet, checkAnomalies, cashBalance, toCSV, buildAccountCache,
} from "../js/accounting.js";
import { allAccounts, findAccount, searchAccounts, PLANS } from "../js/plans.js";
import { COUNTRIES, formatMoney } from "../js/countries.js";
import { chartModeControls, renderHorizontalBars } from "../js/charts.js";
import { periodControls, previousYearRange, comparisonTable } from "../js/report-periods.js";
import { validateBackup } from "../js/db.js";
import { invokeWithRetry as invokeBillingWithRetry } from "../js/billing-sync.js";
import { buildFullCreditNoteJournalEntry, buildCreditNoteJournalEntry, buildCreditNoteRefundJournalEntry, postBillingJournalEntriesAtomically, suggestStockAccounts } from "../js/billing-accounting.js";
import { calculateOutstandingBase } from "../js/billing-core.js";
import { getStock, addProduct, addWarehouse, postStockMovement, productBalance, stockBalance, stockValuation } from "../js/stock-core.js";
import { planSupplierInvoiceReceiptAllocation } from "../js/purchase-receipts.js";
import { buildSupplierInvoiceControlReport } from "../js/purchase-controls.js";
import { addSupplierPaymentTerms, supplierPayableAge, classifySupplierPayable, buildSupplierPayablesSchedule, supplierCashOutflowForecast } from "../js/supplier-payables.js";
import { buildCommercialMarginReport } from "../js/commercial-margin-core.js";
import { buildCommercialPerformanceReport } from "../js/commercial-performance-core.js";
import { buildStrategicDashboardSnapshot } from "../js/strategic-dashboard-core.js";
import { buildFinancialForecast, groupFinancialAmounts } from "../js/financial-forecast-core.js";
import { buildBudgetReport, validateBudgetLines } from "../js/budget-core.js";
import { buildReceivablesReport } from "../js/receivables-core.js";
import { findDuplicateSupplierInvoice, validateSupplierInvoiceMetadata } from "../js/purchase-validation.js";
import { buildSupplierInvoiceJournalEntry, postSupplierInvoiceJournalEntry, buildSupplierPaymentJournalEntry, postSupplierPaymentJournalEntry } from "../js/purchase-accounting.js";
import { supplierInvoiceTaxBreakdown } from "../js/purchase-tax.js";
import { suggestSupplierInvoiceAccounts } from "../js/purchase-account-mapping.js";
import { buildSupplierCreditNoteJournalEntry, postSupplierCreditNoteJournalEntry, planSupplierMultiInvoiceReconciliation, buildSupplierMultiInvoicePaymentJournalEntry, postSupplierMultiInvoicePaymentJournalEntry } from "../js/purchase-credit-notes.js";
import { buildSalesStockCostJournalEntry, postSalesStockCostJournalEntry, buildStockOperationJournalEntry, postStockOperationJournalEntry, calculateLocalStockPeriodValuation, buildPeriodicStockClosingJournalEntry, postPeriodicStockClosingJournalEntry } from "../js/stock-accounting.js";

let passed = 0, failed = 0;
const invitationMigration = readFileSync(new URL("../supabase/migrations/20261122100000_atomic_company_invitations.sql", import.meta.url), "utf8");
const notificationsMigration = readFileSync(new URL("../supabase/migrations/20261123203000_accounting_notifications.sql", import.meta.url), "utf8");
const accountingAnomalyReportingMigration = readFileSync(new URL("../supabase/migrations/20261123210000_accounting_anomaly_reporting.sql", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("../js/notifications.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const coreSource = readFileSync(new URL("../js/views/core.js", import.meta.url), "utf8");

const stockServerMigration = readFileSync(new URL("../supabase/migrations/20261123085959_stock_server_engine.sql", import.meta.url), "utf8");
const stockIndexesMigration = readFileSync(new URL("../supabase/migrations/20261123090112_stock_foreign_key_indexes.sql", import.meta.url), "utf8");
const stockTraceabilityMigration = readFileSync(new URL("../supabase/migrations/20261123090659_stock_traceability_and_units.sql", import.meta.url), "utf8");
const stockLotFixMigration = readFileSync(new URL("../supabase/migrations/20261123090728_fix_stock_lot_balance_decrease.sql", import.meta.url), "utf8");
const stockSerialGuardsMigration = readFileSync(new URL("../supabase/migrations/20261123090856_stock_serial_guards_and_indexes.sql", import.meta.url), "utf8");
const stockSerialNormalizeMigration = readFileSync(new URL("../supabase/migrations/20261123091005_normalize_stock_serial_inputs.sql", import.meta.url), "utf8");
const stockReservationFulfillmentMigration = readFileSync(new URL("../supabase/migrations/20261123094940_stock_auto_reservation_fulfillment.sql", import.meta.url), "utf8");
const stockPhysicalInventoryMigration = readFileSync(new URL("../supabase/migrations/20261123110000_stock_physical_inventory.sql", import.meta.url), "utf8");
const stockInventoryGuardMigration = readFileSync(new URL("../supabase/migrations/20261123120000_stock_inventory_freeze_guard_hardening.sql", import.meta.url), "utf8");
const stockInventoryNullFixMigration = readFileSync(new URL("../supabase/migrations/20261123121500_stock_inventory_freeze_guard_null_fix.sql", import.meta.url), "utf8");
const stockExactReversalMigration = readFileSync(new URL("../supabase/migrations/20261123130000_stock_exact_valuation_reversals.sql", import.meta.url), "utf8");
const stockReversalLinkFixMigration = readFileSync(new URL("../supabase/migrations/20261123131500_fix_reversal_document_link.sql", import.meta.url), "utf8");
const stockCumpReversalCleanupMigration = readFileSync(new URL("../supabase/migrations/20261123133000_stock_cump_reversal_allocation_cleanup.sql", import.meta.url), "utf8");
const stockTrackedReversalMigration = readFileSync(new URL("../supabase/migrations/20261123150000_stock_tracked_valuation_reversals.sql", import.meta.url), "utf8");
const stockCatalogWriteSerializationMigration = readFileSync(new URL("../supabase/migrations/20261123160000_stock_catalog_write_serialization.sql", import.meta.url), "utf8");
const stockReservationInvoiceLinkMigration = readFileSync(new URL("../supabase/migrations/20261123170000_stock_reservation_invoice_link.sql", import.meta.url), "utf8");
const stockReservationLockOrderMigration = readFileSync(new URL("../supabase/migrations/20261123171500_stock_reservation_lock_order.sql", import.meta.url), "utf8");
const stockReservationIdempotencyMigration = readFileSync(new URL("../supabase/migrations/20261123173000_fix_stock_reservation_idempotency.sql", import.meta.url), "utf8");
const stockProductCatalogMigration = readFileSync(new URL("../supabase/migrations/20261123164851_stock_product_catalog_and_prices.sql", import.meta.url), "utf8");
const stockCatalogIndexesMigration = readFileSync(new URL("../supabase/migrations/20261123164907_stock_catalog_indexes_and_read_policy.sql", import.meta.url), "utf8");
const stockCatalogGuardsMigration = readFileSync(new URL("../supabase/migrations/20261123165146_stock_product_catalog_unit_conversion_guard.sql", import.meta.url), "utf8");
const stockPriceUnitsMigration = readFileSync(new URL("../supabase/migrations/20261123172036_stock_product_price_units.sql", import.meta.url), "utf8");
const stockUiSource = readFileSync(new URL("../js/stock.js", import.meta.url), "utf8");
const opsUiSource = readFileSync(new URL("../js/views/ops.js", import.meta.url), "utf8");
const stockPeriodicValuationMigration = readFileSync(new URL("../supabase/migrations/20261125060451_stock_periodic_inventory_valuation.sql", import.meta.url), "utf8");
const stockPeriodicValuationHardeningMigration = readFileSync(new URL("../supabase/migrations/20261125060559_stock_periodic_inventory_valuation_hardening.sql", import.meta.url), "utf8");
const stockPeriodicValuationSecurityMigration = readFileSync(new URL("../supabase/migrations/20261125060730_stock_periodic_inventory_function_security.sql", import.meta.url), "utf8");
const reportsUiSource = readFileSync(new URL("../js/views/reports.js", import.meta.url), "utf8");
const financialUiSource = readFileSync(new URL("../js/views/financial.js", import.meta.url), "utf8");
const purchasesUiSource = readFileSync(new URL("../js/purchases.js", import.meta.url), "utf8");
const purchaseControlsSource = readFileSync(new URL("../js/purchase-controls.js", import.meta.url), "utf8");
const purchaseAccountingSource = readFileSync(new URL("../js/purchase-accounting.js", import.meta.url), "utf8");
const serviceWorkerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const purchaseReceiptSource = readFileSync(new URL("../js/purchase-receipts.js", import.meta.url), "utf8");
const billingSyncSource = readFileSync(new URL("../js/billing-sync.js", import.meta.url), "utf8");
const billingUiSource = readFileSync(new URL("../js/billing.js", import.meta.url), "utf8");
const stockCloudSource = readFileSync(new URL("../js/cloud-sync.js", import.meta.url), "utf8");
const stockCoreSource = readFileSync(new URL("../js/stock-core.js", import.meta.url), "utf8");

const invitationFunction = readFileSync(new URL("../supabase/functions/manage-company-members/index.ts", import.meta.url), "utf8");
test("invitations : création atomique protégée par verrou et vérification admin", () => {
  assert.match(invitationMigration, /pg_advisory_xact_lock/);
  assert.match(invitationMigration, /role = 'admin'[\s\S]*status = 'active'/);
  assert.match(invitationMigration, /accepted_at is null[\s\S]*revoked_at is null[\s\S]*expires_at > pg_catalog\.clock_timestamp\(\)/);
  assert.match(invitationMigration, /grant execute[\s\S]*to service_role/i);
  assert.match(invitationFunction, /rpc\("create_company_invitation"/);
  assert.match(invitationFunction, /error\.code === "P0001"[\s\S]*fail\(409/);
  assert.doesNotMatch(invitationFunction, /\.from\("company_invitations"\)\s*\.insert\(/);
});

test("contrepassation stock : restauration exacte CUMP/FIFO et garde-fous", () => {
  assert.match(stockExactReversalMigration, /private\.stock_reverse_document_impl/);
  assert.match(stockExactReversalMigration, /later\.id>original\.last_original_movement/);
  assert.match(stockExactReversalMigration, /tracking<>'none'/);
  assert.match(stockExactReversalMigration, /stock_valuation_allocations/);
  assert.match(stockExactReversalMigration, /remaining_quantity=0/);
  assert.match(stockExactReversalMigration, /inventory_value=round\(inventory_value\+v_value,6\)/);
  assert.match(stockReversalLinkFixMigration, /p_company_id,v_reversal_doc_id,currval/);
  assert.match(stockReversalLinkFixMigration, /returning id into v_reversal_movement_id/);
  assert.match(stockCumpReversalCleanupMigration, /v_settings\.valuation_method='fifo'/);
  assert.match(stockCumpReversalCleanupMigration, /ne doit pas recevoir de fausses allocations FIFO/);
  assert.match(stockUiSource, /data-stock-reverse/);
  const reversalUiGuard = stockUiSource.match(/const canReverse=([^;]+);/)?.[1] || "";
  assert.match(reversalUiGuard,/m\.documentStatus==="posted"/);
  assert.doesNotMatch(reversalUiGuard,/tracking/);
  assert.match(stockUiSource, /reverseCloudStockDocument/);
  assert.match(stockUiSource, /Motif obligatoire/);
  assert.match(stockCloudSource, /stock_reverse_document/);
});
 
test("stock : idempotence des réservations compare aussi les liens nuls", () => {
  assert.match(stockReservationIdempotencyMigration,/source_type is distinct from p_source_type/);
  assert.match(stockReservationIdempotencyMigration,/source_id is distinct from p_source_id/);
});

test("stock : réservations liées verrouillent le catalogue avant validation", () => {
  assert.match(stockReservationLockOrderMigration,/stock_reserve_linked_impl/);
  assert.match(stockReservationLockOrderMigration,/stock_reserve_impl/);
  assert.match(stockReservationLockOrderMigration,/pg_advisory_xact_lock/);
  assert.match(stockReservationLockOrderMigration,/Point de verrouillage introuvable/);
});

test("stock : les réservations sont consommées uniquement par leur facture liée", () => {
  assert.match(stockReservationInvoiceLinkMigration,/stock_reservations_source_link_check/);
  assert.match(stockReservationInvoiceLinkMigration,/stock_reserve_linked_impl/);
  assert.match(stockReservationInvoiceLinkMigration,/r\.source_type='sales_invoice'/);
  assert.match(stockReservationInvoiceLinkMigration,/split_part\(coalesce\(p_source_id,''\),':',1\)/);
  assert.match(stockCloudSource,/stock_reserve_linked/);
});

test("stock : écritures du catalogue sérialisées avec les mouvements", () => {
  for (const fn of ["stock_save_product_impl","stock_save_warehouse_impl","stock_update_settings_impl"]) {
    assert.match(stockCatalogWriteSerializationMigration,new RegExp(fn));
  }
  assert.match(stockCatalogWriteSerializationMigration,/pg_advisory_xact_lock/);
  assert.match(stockCatalogWriteSerializationMigration,/:stock/);
});

test("contrepassation stock : lots et numéros de série restaurés sans altérer la traçabilité", () => {
  assert.match(stockTrackedReversalMigration, /private\.stock_reverse_document_impl/);
  assert.match(stockTrackedReversalMigration, /stock_serials/);
  assert.match(stockTrackedReversalMigration, /last_movement_id=m\.id/);
  assert.match(stockTrackedReversalMigration, /order by m\.id desc/);
  assert.match(stockTrackedReversalMigration, /état actuel d''un numéro de série/);
  assert.match(stockUiSource, /lots et numéros de série ont été restaurés/);
});

test("inventaire physique : gel intégral, comptage, soumission et ajustement atomique", () => {
  assert.match(stockPhysicalInventoryMigration, /stock_count_sessions/);
  assert.match(stockPhysicalInventoryMigration, /stock_count_lines/);
  assert.match(stockPhysicalInventoryMigration, /stock_count_block_movement/);
  assert.match(stockPhysicalInventoryMigration, /status in \('counting','submitted'\)/);
  assert.match(stockPhysicalInventoryMigration, /v_source_type='inventory_count'/);
  assert.match(stockPhysicalInventoryMigration, /stock_count_finalize_impl/);
  assert.match(stockPhysicalInventoryMigration, /stock\.count_approved_and_posted/);
  assert.match(stockPhysicalInventoryMigration, /v_role<>'admin'/);
  assert.match(stockInventoryGuardMigration, /mizane\.stock_count_finalize_session/);
  assert.match(stockInventoryNullFixMigration, /is not distinct from s\.id::text/);
  assert.match(stockUiSource, /readCloudStockCounts/);
  assert.match(stockUiSource, /data-count-open/);
  assert.match(stockCloudSource, /stock_count_finalize/);
});
 
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\n    " + e.message); }
}

test("états financiers : filtres de période et comparaison avec N-1", () => {
  assert.match(periodControls("balance","2026-01-01","2026-12-31"),/type="date"/);
  assert.match(periodControls("balance","2026-01-01","2026-12-31"),/name="compare" checked/);
  assert.deepEqual(previousYearRange("2024-02-29","2024-12-31"),{start:"2023-02-28",end:"2023-12-31"});
  assert.match(comparisonTable("Comparaison","2026","2025",[{label:"Total",current:120,previous:100}],String),/20,0 %/);
  assert.match(reportsUiSource,/bindPeriodControls\("balance", viewBalance\)/);
  assert.match(reportsUiSource,/bindPeriodControls\("income", viewIncome\)/);
  assert.match(reportsUiSource,/bindPeriodControls\("sheet", viewSheet\)/);
  assert.match(financialUiSource,/bindPeriodControls\("pilotage", viewFinancial\)/);
  assert.match(financialUiSource,/receivables\(exerciceStart, exerciceEnd\)/);
  assert.match(financialUiSource,/suppliers\(exerciceStart, exerciceEnd\)/);
});

test("graphiques financiers : modes tableau/graphiques pour les quatre états", () => {
  for (const id of ["balance","income","sheet","pilotage"]) {
    assert.ok(chartModeControls(id).includes(`data-chart-id="${id}"`));
  }
  assert.match(reportsUiSource,/bindChartMode\("balance"\)/);
  assert.match(reportsUiSource,/bindChartMode\("income"\)/);
  assert.match(reportsUiSource,/bindChartMode\("sheet"\)/);
  assert.match(financialUiSource,/bindChartMode\("pilotage"\)/);
  assert.match(reportsUiSource,/renderHorizontalBars/);
  assert.match(financialUiSource,/renderHorizontalBars/);
  const chart = renderHorizontalBars("Test",[{label:"Banque",debit:120,credit:80}],[{key:"debit",label:"Débit"},{key:"credit",label:"Crédit"}],value=>String(value));
  assert.match(chart,/Banque/);
  assert.match(chart,/120/);
  assert.match(chart,/80/);
  assert.match(chart,/chart-bar-fill/);
  assert.match(renderHorizontalBars("Vide",[],[{key:"amount",label:"Montant"}]),/Aucune donnée/);
});

console.log("— Plans comptables —");
for (const id of Object.keys(PLANS)) {
  test(`plan ${id} : codes uniques et types valides`, () => {
    const accts = allAccounts(id);
    assert.ok(accts.length > 40, "trop peu de comptes : " + accts.length);
    const codes = new Set();
    for (const a of accts) {
      assert.ok(!codes.has(a.code), "code dupliqué " + a.code);
      codes.add(a.code);
      assert.ok(["asset", "liability", "equity", "expense", "income"].includes(a.type), "type invalide " + a.code);
    }
  });
}
test("findAccount : correspondance exacte puis par préfixe", () => {
  assert.equal(findAccount("syscohada", "401").code, "401");
  assert.equal(findAccount("syscohada", "4012").code, "401");
  assert.equal(findAccount("syscohada", ""), null);
});
test("searchAccounts par mot-clé", () => {
  const res = searchAccounts("syscohada", "client");
  assert.ok(res.length > 0 && res.some((a) => a.code === "411"));
});

console.log("— Pays —");
test("chaque plan comptable renseigné pour un pays existe", () => {
  for (const c of COUNTRIES) {
    if (c.plan) assert.ok(PLANS[c.plan], "plan inconnu " + c.plan + " pour " + c.code);
  }
  assert.ok(COUNTRIES.some(c => c.plan === "syscohada"));
  assert.ok(COUNTRIES.some(c => c.plan === "pcg"));
  assert.ok(COUNTRIES.some(c => c.plan === "nct"));
  assert.ok(COUNTRIES.some(c => c.plan === "cgnc"));
});
test("formatMoney ne lève pas d'exception", () => {
  assert.ok(typeof formatMoney(1234.5, "XOF", "fr-SN") === "string");
});

console.log("— Moteur comptable —");
function freshStore() {
  const s = newStore();
  buildAccountCache(s, allAccounts(s.settings.plan));
  return s;
}

test("écriture équilibrée acceptée", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "BAN", reference: "T1",
    lines: [
      { account: "521", label: "Banque", debit: 1000, credit: 0 },
      { account: "101", label: "Capital", debit: 0, credit: 1000 },
    ],
  });
  assert.equal(res.ok, true, res.errors.join(","));
  assert.equal(s.entries.length, 1);
  assert.equal(s.nextId, 2);
});

test("écriture déséquilibrée refusée", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "BAN",
    lines: [
      { account: "521", debit: 1000, credit: 0 },
      { account: "101", debit: 0, credit: 900 },
    ],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("non équilibrée")));
});

test("compte inconnu refusé", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "OD",
    lines: [
      { account: "9999", debit: 100, credit: 0 },
      { account: "521", debit: 0, credit: 100 },
    ],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("inconnu")));
});

test("débit et crédit simultanés refusés", () => {
  const s = freshStore();
  const res = validateEntry(s, {
    date: "2025-01-10", journal: "OD",
    lines: [
      { account: "521", debit: 100, credit: 50 },
      { account: "101", debit: 0, credit: 50 },
    ],
  });
  assert.equal(res.ok, false);
});

test("moins de deux lignes refusé", () => {
  const s = freshStore();
  const res = validateEntry(s, { date: "2025-01-10", journal: "OD", lines: [{ account: "521", debit: 100, credit: 0 }] });
  assert.equal(res.ok, false);
});

test("contrepassation inverse débits et crédits", () => {
  const s = freshStore();
  const e = postEntry(s, {
    date: "2025-01-10", journal: "BAN",
    lines: [
      { account: "521", debit: 500, credit: 0 },
      { account: "701", debit: 0, credit: 500 },
    ],
  }).entry;
  const rev = reverseEntry(s, e.id);
  assert.equal(rev.ok, true);
  assert.equal(s.entries.length, 2);
  assert.equal(s.entries[0].reversed, true);
  assert.equal(reverseEntry(s, e.id).ok, false, "une seconde contrepassation doit être refusée");
  assert.equal(reverseEntry(s, e.id, "2025-02-30").ok, false, "une date impossible doit être refusée");
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.equal(tb.totals.debit, 1000);
  const gl = ledger(s, "521");
  assert.equal(gl.totals.solde, 0);
});

test("balance générale : totaux et soldes", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-01-05", journal: "BAN",
    lines: [
      { account: "521", debit: 100000, credit: 0 },
      { account: "101", debit: 0, credit: 100000 },
    ],
  });
  postEntry(s, {
    date: "2025-01-20", journal: "ACH",
    lines: [
      { account: "601", debit: 50000, credit: 0 },
      { account: "4453", debit: 9000, credit: 0 },
      { account: "401", debit: 0, credit: 59000 },
    ],
  });
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, 159000);
  assert.equal(tb.totals.credit, 159000);
  assert.equal(tb.totals.soldeDebit, tb.totals.soldeCredit);
  const row401 = tb.rows.find((r) => r.code === "401");
  assert.equal(row401.soldeCredit, 59000);
});

test("filtre de période sur la balance", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-01-05", journal: "BAN",
    lines: [{ account: "521", debit: 1000, credit: 0 }, { account: "101", debit: 0, credit: 1000 }],
  });
  postEntry(s, {
    date: "2025-06-05", journal: "BAN",
    lines: [{ account: "521", debit: 500, credit: 0 }, { account: "701", debit: 0, credit: 500 }],
  });
  const tb = trialBalance(s, "2025-01-01", "2025-03-31");
  assert.equal(tb.totals.debit, 1000);
});

test("compte de résultat : charges, produits, résultat", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-02-01", journal: "VTE",
    lines: [{ account: "571", debit: 118000, credit: 0 }, { account: "701", debit: 0, credit: 100000 }, { account: "4431", debit: 0, credit: 18000 }],
  });
  postEntry(s, {
    date: "2025-02-02", journal: "ACH",
    lines: [{ account: "601", debit: 40000, credit: 0 }, { account: "571", debit: 0, credit: 40000 }],
  });
  const is = incomeStatement(s);
  assert.equal(is.totProduits, 100000);
  assert.equal(is.totCharges, 40000);
  assert.equal(is.resultat, 60000);
});

test("bilan équilibré avec résultat intégré", () => {
  const s = freshStore();
  postEntry(s, { date: "2025-01-01", journal: "BAN", lines: [{ account: "521", debit: 1000000, credit: 0 }, { account: "101", debit: 0, credit: 1000000 }] });
  postEntry(s, { date: "2025-02-01", journal: "VTE", lines: [{ account: "571", debit: 118000, credit: 0 }, { account: "701", debit: 0, credit: 100000 }, { account: "4431", debit: 0, credit: 18000 }] });
  postEntry(s, { date: "2025-02-02", journal: "ACH", lines: [{ account: "601", debit: 40000, credit: 0 }, { account: "571", debit: 0, credit: 40000 }] });
  const b = balanceSheet(s);
  assert.equal(b.totActif, b.totPassif, "actif " + b.totActif + " ≠ passif " + b.totPassif);
  assert.equal(b.resultat, 60000);
});

test("trésorerie (classe 5)", () => {
  const s = freshStore();
  postEntry(s, { date: "2025-01-01", journal: "CAI", lines: [{ account: "571", debit: 2000, credit: 0 }, { account: "701", debit: 0, credit: 2000 }] });
  postEntry(s, { date: "2025-01-02", journal: "BAN", lines: [{ account: "6221", debit: 800, credit: 0 }, { account: "521", debit: 0, credit: 800 }] });
  assert.equal(cashBalance(s), 1200);
});

test("détection des anomalies : doublon et compte inconnu", () => {
  const s = freshStore();
  const lines = [{ account: "521", debit: 100, credit: 0 }, { account: "701", debit: 0, credit: 100 }];
  postEntry(s, { date: "2025-01-01", journal: "VTE", reference: "X", lines });
  postEntry(s, { date: "2025-01-01", journal: "VTE", reference: "X", lines: lines.map((l) => ({ ...l })) });
  s.entries.push({ id: 99, date: "2025-01-02", journal: "OD", reference: "", reversed: false, reverseOf: null, createdAt: "", lines: [{ account: "9999", label: "", third: "", debit: 10, credit: 0 }, { account: "521", label: "", third: "", debit: 0, credit: 10 }] });
  const a = checkAnomalies(s);
  assert.ok(a.some((x) => x.type === "doublon"));
  assert.ok(a.some((x) => x.type === "compte_inconnu"));
});

test("arrondi monétaire à 2 décimales", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-01", journal: "OD",
    lines: [{ account: "521", debit: 10.005, credit: 0 }, { account: "701", debit: 0, credit: 10.005 }],
  });
  assert.equal(res.entry.lines[0].debit, 10.01);
});

test("import local de texte : une écriture par ligne", async () => {
  const { parseEntriesFromTextLocal } = await import("../js/ai.js");
  const s = freshStore();
  const arr = parseEntriesFromTextLocal(s, "2025-03-01 601 401 25000 Achat marchandises\n521 701 10000 Vente au comptant\nligne incompréhensible");
  assert.equal(arr.length, 2);
  assert.equal(arr[0].date, "2025-03-01");
  assert.equal(arr[0].lines[0].debit, 25000);
  assert.equal(arr[0].lines[1].credit, 25000);
  assert.equal(arr[1].journal, "VTE");
  const res = postEntry(s, arr[0]);
  assert.equal(res.ok, true, res.errors.join(","));
});

test("facture : HTML avec en-tête et total TTC", async () => {
  const { invoiceHTML } = await import("../js/invoice.js");
  const s = freshStore();
  const e = postEntry(s, {
    date: "2025-02-01", journal: "VTE", reference: "FCT-001",
    lines: [
      { account: "411", label: "Client Karim", third: "Karim", debit: 118000, credit: 0 },
      { account: "701", label: "Ventes", debit: 0, credit: 100000 },
      { account: "4431", label: "TVA facturée", debit: 0, credit: 18000 },
    ],
  }).entry;
  const html = invoiceHTML(s, e);
  assert.ok(html.includes("FACTURE"));
  assert.ok(html.includes("FCT-001"));
  assert.ok(html.includes("Karim"));
  assert.ok(html.includes("Total TTC"));
  assert.ok(html.includes("Total HT"));
});

test("export CSV", () => {
  const csv = toCSV([{ a: 1, b: "x;y" }]);
  assert.ok(csv.includes('"x;y"'));
});

test("données de démonstration équilibrées", async () => {
  const { demoData } = await import("../js/db.js");
  const s = freshStore();
  demoData(s);
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.ok(s.entries.length >= 8);
});

console.log("— Amortissements (finance.js) —");
test("amortissement linéaire : annuité constante, VNC nulle à la fin", async () => {
  const { amortizationSchedule } = await import("../js/finance.js");
  const sched = amortizationSchedule(10000, 5, "lineaire");
  assert.equal(sched.length, 5);
  for (const r of sched) assert.equal(r.annuite, 2000);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
});

test("amortissement dégressif : cumul final = valeur, VNC nulle", async () => {
  const { amortizationSchedule, amortRate } = await import("../js/finance.js");
  const rate = amortRate(5, "degressif");
  assert.equal(rate, 0.35);
  const sched = amortizationSchedule(10000, 5, "degressif");
  assert.equal(sched.length, 5);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
  assert.ok(sched[0].annuite === 3500, "1re annuité dégressive = 3500");
});

test("nextAnnuity : reprend après cumul déjà amorti, 0 si terminé", async () => {
  const { nextAnnuity } = await import("../js/finance.js");
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 2000 }), 2000);
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 10000 }), 0);
});

test("dotationLines : 681 débit / 28x crédit, équilibrées", async () => {
  const { dotationLines } = await import("../js/finance.js");
  const lines = dotationLines([
    { name: "Moto", account: "2455", amount: 1500000, years: 5, method: "lineaire", amortized: 0 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].account, "681");
  assert.equal(lines[1].account, "2455".replace(/^2/, "28"));
  assert.equal(lines[0].debit, lines[1].credit);
});

console.log("— Clôture & à-nouveaux —");
test("closingProposal : clôture équilibrée, résultat au compte 12, à-nouveaux équilibrés", async () => {
  const { closingProposal } = await import("../js/finance.js");
  const s = freshStore();
  postEntry(s, { date: "2025-01-05", journal: "BAN", reference: "Capital", lines: [
    { account: "521", label: "Banque", debit: 1000000, credit: 0 },
    { account: "101", label: "Capital", debit: 0, credit: 1000000 },
  ] });
  postEntry(s, { date: "2025-03-01", journal: "VTE", reference: "V1", lines: [
    { account: "521", label: "Banque", debit: 500000, credit: 0 },
    { account: "701", label: "Ventes", debit: 0, credit: 500000 },
  ] });
  postEntry(s, { date: "2025-04-01", journal: "OD", reference: "Loyer", lines: [
    { account: "6221", label: "Loyer", debit: 200000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 200000 },
  ] });
  const { closing, anew, resultat } = closingProposal(s, "2025-01-01", "2025-12-31", "2026-01-01");
  assert.ok(closing, "écriture de clôture attendue");
  assert.ok(anew, "écriture d'à-nouveaux attendue");
  assert.equal(resultat, 300000);
  const totC = closing.lines.reduce((a, l) => a + l.debit, 0);
  assert.equal(totC, closing.lines.reduce((a, l) => a + l.credit, 0), "clôture équilibrée");
  const c12 = closing.lines.find((l) => l.account === "12");
  assert.ok(c12 && c12.credit === 300000, "compte 12 créditeur du bénéfice");
  const totA = anew.lines.reduce((a, l) => a + l.debit, 0);
  assert.equal(totA, anew.lines.reduce((a, l) => a + l.credit, 0), "à-nouveaux équilibrés");
  const codes = anew.lines.map((l) => l.account);
  for (const c of ["521", "101", "12"]) assert.ok(codes.includes(c), "compte " + c + " reporté");
});

console.log("— Rapprochement bancaire —");
test("parseBankCSV : JJ/MM/AAAA, AAAA-MM-JJ, en-tête ignoré", async () => {
  const { parseBankCSV } = await import("../js/finance.js");
  const txt = "Date;Libellé;Montant\n10/01/2025;Virement client;1 000 000\n2025-01-12;Fournisseur;-500,5\nligne invalide\n";
  const rows = parseBankCSV(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2025-01-10");
  assert.equal(rows[0].amount, 1000000);
  assert.equal(rows[1].date, "2025-01-12");
  assert.equal(rows[1].amount, -500.5);
});

test("matchBankLines : rapprochement par montant à ±4 jours sur classe 5", async () => {
  const { parseBankCSV, matchBankLines } = await import("../js/finance.js");
  const s = freshStore();
  postEntry(s, { date: "2025-01-08", journal: "BAN", reference: "V1", lines: [
    { account: "521", label: "Dépôt client", debit: 1000000, credit: 0 },
    { account: "411", label: "Client", debit: 0, credit: 1000000 },
  ] });
  const rows = parseBankCSV("10/01/2025;Virement client;1000000\n20/01/2025;Inconnu;999");
  const matched = matchBankLines(s, rows);
  assert.equal(matched[0].match, 1);
  assert.equal(matched[1].match, null);
});

console.log("— Cas limites —");
test("validateBackup accepte une sauvegarde équilibrée et nettoie les sections facultatives", () => {
  const backup = {
    version: 1,
    settings: { plan: "syscohada", customAccounts: [] },
    entries: [{
      id: 1, date: "2025-01-01", journal: "BAN", reference: "Ouverture",
      lines: [
        { account: "521", debit: 1000, credit: 0 },
        { account: "101", debit: 0, credit: 1000 },
      ],
    }],
    nextId: 2,
  };
  const clean = validateBackup(backup);
  assert.equal(clean.entries.length, 1);
  assert.deepEqual(clean.thirds, []);
  assert.deepEqual(clean.assets, []);
  assert.equal(clean.nextId, 2);
});

test("validateBackup rejette date impossible, déséquilibre et montants excessifs", () => {
  const base = {
    version: 1, settings: { plan: "syscohada", customAccounts: [] }, nextId: 2,
    entries: [{
      id: 1, date: "2025-01-01", journal: "BAN",
      lines: [{ account: "521", debit: 100, credit: 0 }, { account: "101", debit: 0, credit: 100 }],
    }],
  };
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], date: "2026-99-99" }] }), /date invalide/);
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], lines: [{ account: "521", debit: 100, credit: 0 }, { account: "101", debit: 0, credit: 90 }] }] }), /déséquilibrée/);
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], lines: [{ account: "521", debit: 1e15, credit: 0 }, { account: "101", debit: 0, credit: 1e15 }] }] }), /montant invalide/);
});

test("validDate rejette les dates calendaires impossibles", () => {
  assert.equal(validDate("2026-99-99"), false);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
});

test("validateEntry refuse les montants négatifs", () => {
  const s = freshStore();
  const v = validateEntry(s, { date: "2025-01-01", journal: "OD", lines: [
    { account: "521", label: "A", debit: -100, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: -100 },
  ] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("négatifs")));
});

test("exercice à cheval : entriesInRange filtre 2025 vs 2024", () => {
  const s = freshStore();
  postEntry(s, { date: "2024-12-31", journal: "OD", reference: "N-1", lines: [
    { account: "521", label: "A", debit: 100, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: 100 },
  ] });
  postEntry(s, { date: "2025-01-02", journal: "OD", reference: "N", lines: [
    { account: "521", label: "A", debit: 50, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: 50 },
  ] });
  assert.equal(trialBalance(s, "2025-01-01", "2025-12-31").totals.debit, 50);
  assert.equal(trialBalance(s, "2024-01-01", "2024-12-31").totals.debit, 100);
});

console.log("— Fournisseurs IA —");
test("providerOf / visionModel : détection mistral, groq, gemini, custom", async () => {
  const { providerOf, visionModel } = await import("../js/ai.js");
  const mk = (ep) => ({ settings: { aiEndpoint: ep, aiModel: "m" } });
  assert.equal(providerOf(mk("https://api.mistral.ai/v1/chat/completions")), "mistral");
  assert.equal(providerOf(mk("https://api.groq.com/openai/v1/chat/completions")), "groq");
  assert.equal(providerOf(mk("https://generativelanguage.googleapis.com/v1beta")), "gemini");
  assert.equal(providerOf(mk("https://exemple.com/v1/chat/completions")), "custom");
  assert.equal(providerOf({ settings: { aiProvider: "custom", aiEndpoint: "https://api.mistral.ai/v1/chat/completions", aiModel: "m" } }), "custom",
    "le fournisseur explicitement choisi doit primer sur l'endpoint détecté");
  assert.equal(visionModel(mk("https://api.groq.com/openai/v1/chat/completions")), "meta-llama/llama-4-scout-17b-16e-instruct");
  assert.equal(visionModel(mk("https://generativelanguage.googleapis.com/v1beta")), "gemini-3.8-flash");
});

test("toGeminiBody : conversion messages texte et image", async () => {
  const { toGeminiBody } = await import("../js/ai.js");
  const body = toGeminiBody([
    { role: "system", content: "SYS" },
    { role: "user", content: "Bonjour" },
    { role: "assistant", content: "Réponse" },
    { role: "user", content: [{ type: "text", text: "Lis" }, { type: "image_url", image_url: "data:image/jpeg;base64,QUJD" }] },
  ], { json: true, temperature: 0.5 });
  assert.equal(body.systemInstruction.parts[0].text, "SYS");
  assert.equal(body.contents[0].role, "user");
  assert.equal(body.contents[1].role, "model");
  assert.deepEqual(body.contents[2].parts[1].inline_data, { mime_type: "image/jpeg", data: "QUJD" });
  assert.equal(body.generationConfig.response_mime_type, "application/json");
  assert.equal(body.generationConfig.temperature, 0.5);
});

test("chat : image_url encapsulée en {url} hors Mistral (mock fetch)", async () => {
  const { chat } = await import("../js/ai.js");
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  try {
    const s = { settings: { aiEndpoint: "https://api.groq.com/openai/v1/chat/completions", aiKey: "k", aiModel: "llama-3.3-70b-versatile", companyName: "T", country: "SN", currency: "XOF", plan: "syscohada", exerciceStart: "2025-01-01", exerciceEnd: "2025-12-31", customAccounts: [] } };
    await chat(s, [], [{ type: "text", text: "Lis" }, { type: "image_url", image_url: "data:image/jpeg;base64,QUJD" }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    const img = calls[0].body.messages[1].content.find((p) => p.type === "image_url");
    assert.deepEqual(img.image_url, { url: "data:image/jpeg;base64,QUJD" });
  } finally { globalThis.fetch = orig; }
});

test("chat Gemini : modèle retiré -> nouvelle tentative avec le modèle actuel (mock fetch)", async () => {
  const { chat } = await import("../js/ai.js");
  const urls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return { ok: false, status: 404, text: async () => JSON.stringify({ error: { code: 404, message: "models/gemini-2.0-flash is no longer available" } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) };
  };
  try {
    const s = { settings: { aiEndpoint: "https://generativelanguage.googleapis.com/v1beta", aiKey: "k", aiModel: "gemini-2.0-flash", companyName: "T", country: "SN", currency: "XOF", plan: "syscohada", exerciceStart: "2025-01-01", exerciceEnd: "2025-12-31", customAccounts: [] } };
    const r = await chat(s, [], [{ type: "text", text: "Lis" }]);
    assert.equal(r, "ok");
    assert.ok(urls[0].includes("gemini-2.0-flash"));
    assert.ok(urls[1].includes("gemini-3.8-flash"));
  } finally { globalThis.fetch = orig; }
});

console.log("— Internationalisation —");
test("i18n : t() traduit, repli sur français, langue inconnue rejetée", async () => {
  const { t, setLang, lang, LANGS } = await import("../js/i18n.js");
  setLang("fr");
  assert.equal(lang(), "fr");
  assert.equal(t("Grand livre"), "Grand livre");
  setLang("en");
  assert.equal(t("Grand livre"), "General ledger");
  assert.equal(t("Texte inexistant"), "Texte inexistant");
  setLang("es");
  assert.equal(t("Enregistrer"), "Guardar");
  setLang("ar");
  assert.notEqual(t("Paramètres"), "Paramètres");
  setLang("xx");
  assert.equal(lang(), "fr");
  setLang("fr");
  assert.equal(LANGS.length, 4);
});

test("i18n : mêmes clés pour toutes les langues", async () => {
  const { DICT } = await import("../js/i18n.js");
  const counts = Object.values(DICT).map((d) => Object.keys(d).length);
  assert.ok(counts.length >= 3, "au moins 3 langues");
  assert.equal(new Set(counts).size, 1, "toutes les langues ont le même nombre de clés");
  assert.ok(counts[0] > 100, "dictionnaire substantiel");
});


console.log("— Synchronisation comptable —");

const sourceUid = "11111111-1111-4111-8111-111111111111";
const reverseUid = "22222222-2222-4222-8222-222222222222";
test("nettoyage des secrets : clés sensibles supprimées récursivement", () => {
  const value = cleanSecrets({ settings: { apiKey: "secret", company: "MIZANE", nested: [{ accessToken: "token", label: "ok" }] } });
  assert.deepEqual(value, { settings: { company: "MIZANE", nested: [{ label: "ok" }] } });
});
test("empreinte : indépendante de l'ordre des propriétés", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});
test("instantané local : identifiants clients stables et secrets exclus", () => {
  const store = {
    settings: { plan: "syscohada", apiKey: "NE_DOIT_PAS_SORTIR", customAccounts: [{ code: "471", label: "Attente", type: "asset" }] },
    thirds: [{ name: "Client test", type: "client", phone: "", email: "" }],
    assets: [],
    entries: [{ id: 1, date: "2025-01-01", journal: "OD", reference: "T1", lines: [{ account: "521", debit: 10, credit: 0 }, { account: "101", debit: 0, credit: 10 }] }]
  };
  const first = localSnapshot(store);
  const ids = [store.settings.customAccounts[0].client_uid, store.thirds[0].client_uid, store.entries[0].client_uid];
  const second = localSnapshot(store);
  assert.deepEqual([store.settings.customAccounts[0].client_uid, store.thirds[0].client_uid, store.entries[0].client_uid], ids);
  assert.deepEqual(Object.keys(first.custom_account), Object.keys(second.custom_account));
  assert.ok(!JSON.stringify(first).includes("NE_DOIT_PAS_SORTIR"));
  assert.ok(!JSON.stringify(first).includes("apiKey"));
});
test("validation sync : refuse les UUID clients dupliqués", () => {
  const uid = "12121212-1212-4121-8121-121212121212", store = makeValidationStore();
  store.thirds = [{ client_uid: uid, name: "Client A" }, { client_uid: uid, name: "Client B" }];
  assert.ok(validateSyncStore(store).some(message => message.includes("Identifiant client en double")));
});
test("validation sync : refuse les numéros internes d'écriture dupliqués", () => {
  const store = makeValidationStore(); store.entries = [makeValidEntry(1), makeValidEntry(1)];
  assert.ok(validateSyncStore(store).some(message => message.includes("Numéro d'écriture en double")));
});
test("validation sync : bloque une écriture déséquilibrée", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[1].credit = 90; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("non équilibrée")));
});
test("validation sync : refuse un compte absent du plan comptable", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[0].account = "999999"; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("inconnu dans le plan")));
});
test("validation sync : refuse un tiers absent ou ambigu dans les lignes", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[0].third = "Tiers fantôme"; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("introuvable")));
  store.thirds = [{ client_uid: "13131313-1313-4131-8131-131313131313", name: "Tiers fantôme" }, { client_uid: "14141414-1414-4141-8141-141414141414", name: "Tiers fantôme" }];
  assert.ok(validateSyncStore(store).some(message => message.includes("ambigu")));
});
await testAsync("validation sync : aucune opération cloud si les données locales sont invalides", async () => {
  const companyId = "company-invalid-before-push", store = makeSyncStore(), entry = makeValidEntry(1);
  entry.lines[1].credit = 99; store.entries = [entry];
  const storage = memoryStorage(); storage.setItem("mizane_v1", JSON.stringify(store)); seedShadow(storage, companyId);
  const cloud = makeCloud(companyId), previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Synchronisation bloquée/);
    assert.equal(cloud.pushes, 0);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});

test("ordre des lots : écriture d'origine avant sa contrepassation", () => {
  const operations = [
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } },
    { entity_type: "third", operation: "upsert", client_uid: "33333333-3333-4333-8333-333333333333", data: {} },
    { entity_type: "entry", operation: "upsert", client_uid: sourceUid, data: { reverse_of_client_uid: null } }
  ];
  const ordered = orderOperations(operations);
  assert.equal(ordered[0].entity_type, "third");
  assert.deepEqual(ordered.slice(1).map(x => x.client_uid), [sourceUid, reverseUid]);
});
test("ordre des lots : cycle de contrepassation refusé", () => {
  assert.throws(() => orderOperations([
    { entity_type: "entry", operation: "upsert", client_uid: sourceUid, data: { reverse_of_client_uid: reverseUid } },
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } }
  ]), /dépendance circulaire/);
});
test("ordre des lots : contrepassation et suppression de l'origine refusées ensemble", () => {
  assert.throws(() => orderOperations([
    { entity_type: "entry", operation: "delete", client_uid: sourceUid, data: {} },
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } }
  ]), /écriture d'origine est supprimée/);
});


async function testAsync(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\\n    " + (e.stack || e.message)); }
}

console.log("— Résilience de la synchronisation de facturation —");
await testAsync("facturation : une réponse réseau perdue est retentée avec le même identifiant idempotent", async () => {
  const operation = { operation_uid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expected_sync_version: 7 };
  const seen = [];
  let attempts = 0;
  const result = await invokeBillingWithRetry(async () => {
    attempts++;
    seen.push(operation.operation_uid);
    if (attempts === 1) return { data: null, error: { message: "Service temporairement indisponible", context: { status: 503 } } };
    return { data: { ok: true, sync_version: 8 }, error: null };
  }, { maxAttempts: 4, baseDelayMs: 0 });
  assert.equal(attempts, 2);
  assert.deepEqual(seen, [operation.operation_uid, operation.operation_uid]);
  assert.equal(result.data.sync_version, 8);
});
await testAsync("facturation : les erreurs d'authentification et de validation ne sont pas retentées", async () => {
  for (const status of [401, 403, 422]) {
    let attempts = 0;
    const result = await invokeBillingWithRetry(async () => {
      attempts++;
      return { data: null, error: { message: "Erreur définitive", context: { status } } };
    }, { maxAttempts: 4, baseDelayMs: 0 });
    assert.equal(attempts, 1, "statut " + status);
    assert.ok(result.error);
  }
});
await testAsync("facturation : une exception réseau temporaire est retentée", async () => {
  let attempts = 0;
  const result = await invokeBillingWithRetry(async () => {
    attempts++;
    if (attempts === 1) throw new Error("Failed to send a request to the edge function");
    return { data: { ok: true }, error: null };
  }, { maxAttempts: 3, baseDelayMs: 0 });
  assert.equal(attempts, 2);
  assert.equal(result.data.ok, true);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
function makeValidationStore() {
  return { settings: { plan: "syscohada", customAccounts: [] }, thirds: [{ client_uid: "15151515-1515-4151-8151-151515151515", name: "Fournisseur Démo", type: "fournisseur" }], assets: [], entries: [], nextId: 2 };
}
function makeValidEntry(id = 1) {
  return { client_uid: `16161616-1616-4161-8161-${String(id).padStart(12, "0")}`, id, date: "2026-02-01", journal: "ACH", reference: `ACH-${id}`, reversed: false, reverseOf: null, lines: [{ account: "601", label: "Achat", third: "Fournisseur Démo", debit: 125, credit: 0 }, { account: "401", label: "Fournisseur", third: "Fournisseur Démo", debit: 0, credit: 125 }] };
}
function makeSyncStore(thirds = []) {
  return { settings: { plan: "syscohada", customAccounts: [] }, thirds: structuredClone(thirds), assets: [], entries: [], nextId: 1 };
}
function makeCloud(companyId, thirds = [], options = {}) {
  const state = {
    company_id: companyId,
    settings: { settings: { plan: "syscohada" }, sync_version: 1 },
    custom_accounts: [], thirds: structuredClone(thirds), assets: [], entries: [],
    pagination: { has_more: false, next_offset: null },
  };
  let pushes = 0;
  let failAfterApply = !!options.failAfterApply;
  const client = { functions: { invoke: async (name, { body }) => {
    if (name === "read-accounting") {
      const response = structuredClone(state);
      if (options.paginateEntries) {
        const offset = Number(body.offset) || 0;
        const limit = Number(body.limit) || 100;
        response.entries = state.entries.slice(offset, offset + limit);
        response.pagination = {
          has_more: offset + response.entries.length < state.entries.length,
          next_offset: offset + response.entries.length < state.entries.length ? offset + response.entries.length : null,
        };
      }
      return { data: response, error: null };
    }
    if (name === "push-accounting-changes") {
      pushes++;
      for (const op of body.operations) {
        if (op.entity_type === "third") {
          const index = state.thirds.findIndex(x => x.client_uid === op.client_uid);
          if (op.operation === "delete") { if (index >= 0) state.thirds.splice(index, 1); }
          else {
            const row = { client_uid: op.client_uid, name: op.data.name, third_type: op.data.third_type, phone: op.data.phone, email: op.data.email, sync_version: index >= 0 ? state.thirds[index].sync_version + 1 : 1 };
            if (index >= 0) state.thirds[index] = row; else state.thirds.push(row);
          }
        } else if (op.entity_type === "entry") {
          const index = state.entries.findIndex(x => x.client_uid === op.client_uid);
          if (op.operation === "delete") { if (index >= 0) state.entries.splice(index, 1); }
          else {
            const source = op.data.reverse_of_client_uid
              ? state.entries.find(x => x.client_uid === op.data.reverse_of_client_uid)
              : null;
            const row = {
              id: index >= 0 ? state.entries[index].id : Math.max(0, ...state.entries.map(x => x.id)) + 1,
              client_uid: op.client_uid, entry_date: op.data.entry_date, journal: op.data.journal,
              reference: op.data.reference, is_reversed: !!op.data.is_reversed,
              reverse_of_entry_id: source?.id ?? null,
              lines: structuredClone(op.data.lines || []),
              sync_version: index >= 0 ? state.entries[index].sync_version + 1 : 1,
            };
            if (index >= 0) state.entries[index] = row; else state.entries.push(row);
          }
        }
      }
      if (options.afterApply) await options.afterApply({ state, body });
      if (failAfterApply) {
        failAfterApply = false;
        return { data: null, error: { message: "Connexion interrompue après acceptation du lot" } };
      }
      return { data: { ok: true }, error: null };
    }
    throw new Error("Fonction cloud inattendue : " + name);
  } } };
  return { state, client, get pushes() { return pushes; } };
}
function seedShadow(storage, companyId, thirdRecords = []) {
  const data = {
    settings: { settings: { data: { settings: { plan: "syscohada" } } } },
    custom_account: {}, third: {}, asset: {}, entry: {},
  };
  for (const third of thirdRecords) {
    data.third[third.client_uid] = { data: {
      name: third.name, third_type: third.type, phone: third.phone || "", email: third.email || "",
    } };
  }
  const shadow = {};
  for (const kind of ["settings", "custom_account", "third", "asset", "entry"]) {
    shadow[kind] = {};
    for (const [uid, record] of Object.entries(data[kind])) {
      shadow[kind][uid] = { hash: fingerprint(record.data), version: 1 };
    }
  }
  storage.setItem("mizane_sync_shadow_v1:" + companyId, JSON.stringify(shadow));
}
await testAsync("deux appareils : une modification locale est envoyée puis récupérée", async () => {
  const companyId = "company-sync-test";
  const uid = "44444444-4444-4444-8444-444444444444";
  const baseline = [];
  const cloud = makeCloud(companyId);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId);
  seedShadow(deviceB, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceB;
    const changed = makeSyncStore([{ client_uid: uid, name: "Client ajouté sur B", type: "client", phone: "0600000000", email: "" }]);
    deviceB.setItem("mizane_v1", JSON.stringify(changed));
    const pushed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pushed.pushed, 1);
    assert.equal(cloud.state.thirds.length, 1);
    globalThis.localStorage = deviceA;
    const pulled = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pulled.pulled, 1);
    const recovered = JSON.parse(deviceA.getItem("mizane_v1"));
    assert.equal(recovered.thirds[0].name, "Client ajouté sur B");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("deux appareils : les modifications simultanées sont signalées sans écrasement", async () => {
  const companyId = "company-conflict-test";
  const uid = "55555555-5555-4555-8555-555555555555";
  const baseline = [{ client_uid: uid, name: "Client initial", type: "client", phone: "0600000000", email: "" }];
  const cloud = makeCloud(companyId, [{ client_uid: uid, name: "Client initial", third_type: "client", phone: "0600000000", email: "", sync_version: 1 }]);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId, baseline);
  seedShadow(deviceB, companyId, baseline);
  const previousStorage = globalThis.localStorage;
  try {
    const editedA = makeSyncStore([{ ...baseline[0], name: "Nom modifié sur A" }]);
    globalThis.localStorage = deviceA;
    deviceA.setItem("mizane_v1", JSON.stringify(editedA));
    await syncAccounting(cloud.client, companyId, "admin");
    const pushCount = cloud.pushes;
    const editedB = makeSyncStore([{ ...baseline[0], phone: "0611111111" }]);
    globalThis.localStorage = deviceB;
    deviceB.setItem("mizane_v1", JSON.stringify(editedB));
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Conflit simultané détecté/);
    assert.equal(cloud.pushes, pushCount, "aucun push ne doit être tenté après le conflit");
    assert.equal(cloud.state.thirds[0].name, "Nom modifié sur A");
    assert.equal(JSON.parse(deviceB.getItem("mizane_v1")).thirds[0].phone, "0611111111");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("suppression : un tiers supprimé sur un appareil disparaît sur l'autre", async () => {
  const companyId = "company-delete-test";
  const uid = "66666666-6666-4666-8666-666666666666";
  const baseline = [{ client_uid: uid, name: "Client à supprimer", type: "client", phone: "", email: "" }];
  const cloud = makeCloud(companyId, [{ client_uid: uid, name: "Client à supprimer", third_type: "client", phone: "", email: "", sync_version: 1 }]);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId, baseline);
  seedShadow(deviceB, companyId, baseline);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceB;
    deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore([])));
    const pushed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pushed.pushed, 1);
    assert.equal(cloud.state.thirds.length, 0);
    globalThis.localStorage = deviceA;
    const pulled = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pulled.pulled, 1);
    assert.deepEqual(JSON.parse(deviceA.getItem("mizane_v1")).thirds, []);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("reprise : une réponse réseau perdue après acceptation ne duplique pas le tiers", async () => {
  const companyId = "company-retry-test";
  const uid = "77777777-7777-4777-8777-777777777777";
  const cloud = makeCloud(companyId, [], { failAfterApply: true });
  const storage = memoryStorage();
  const store = makeSyncStore([{ client_uid: uid, name: "Client reprise", type: "client", phone: "", email: "" }]);
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Connexion interrompue/);
    assert.equal(cloud.state.thirds.length, 1, "le cloud a accepté le lot avant la perte de réponse");
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds.length, 1, "les données locales restent présentes");
    const resumed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(resumed.pushed, 0, "la reprise reconnaît que le cloud possède déjà la même version");
    assert.equal(cloud.pushes, 1, "aucun second envoi n'est nécessaire");
    assert.equal(cloud.state.thirds.length, 1, "aucun doublon n'est créé");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("écritures liées : l'origine est créée avant la contrepassation", async () => {
  const companyId = "company-entries-test";
  const source = "88888888-8888-4888-8888-888888888888";
  const reversal = "99999999-9999-4999-8999-999999999999";
  const cloud = makeCloud(companyId);
  const storage = memoryStorage();
  const store = makeSyncStore();
  store.entries = [
    { client_uid: source, id: 1, date: "2026-01-10", journal: "OD", reference: "ECR-001", reversed: false, reverseOf: null,
      lines: [{ account: "601", label: "Charge", third: "", debit: 250, credit: 0 }, { account: "401", label: "Fournisseur", third: "", debit: 0, credit: 250 }] },
    { client_uid: reversal, id: 2, date: "2026-01-11", journal: "OD", reference: "CONTRE-ECR-001", reversed: true, reverseOf: 1,
      lines: [{ account: "601", label: "Annulation charge", third: "", debit: 0, credit: 250 }, { account: "401", label: "Annulation fournisseur", third: "", debit: 250, credit: 0 }] },
  ];
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(result.pushed, 2);
    assert.equal(cloud.state.entries.length, 2);
    const original = cloud.state.entries.find(x => x.client_uid === source);
    const contra = cloud.state.entries.find(x => x.client_uid === reversal);
    assert.ok(original && contra);
    assert.equal(contra.reverse_of_entry_id, original.id, "la référence cloud de la contrepassation pointe vers l'origine");
    assert.equal(contra.is_reversed, true);
    for (const entry of cloud.state.entries) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      assert.equal(debit, credit, "chaque écriture reste équilibrée");
    }
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("modification locale pendant l'envoi : la synchronisation s'arrête sans écraser le stockage", async () => {
  const companyId = "company-concurrent-local-test";
  const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const storage = memoryStorage();
  const store = makeSyncStore([{ client_uid: uid, name: "Client envoyé", type: "client", phone: "", email: "" }]);
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId, [], {
    afterApply: async () => {
      const changed = makeSyncStore([{ client_uid: uid, name: "Modification locale concurrente", type: "client", phone: "", email: "" }]);
      storage.setItem("mizane_v1", JSON.stringify(changed));
    },
  });
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /modifiée dans un autre onglet/);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Modification locale concurrente");
    assert.equal(cloud.state.thirds[0].name, "Client envoyé");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("gros volume : 250 tiers sont envoyés en trois lots sans doublon", async () => {
  const companyId = "company-volume-thirds-test";
  const thirds = Array.from({ length: 250 }, (_, index) => ({
    client_uid: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Tiers ${index + 1}`, type: index % 2 ? "fournisseur" : "client", phone: "", email: "",
  }));
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore(thirds)));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const first = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(first.pushed, 250);
    assert.equal(cloud.pushes, 3, "les 250 opérations sont réparties en lots de 100 maximum");
    assert.equal(cloud.state.thirds.length, 250);
    const second = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(second.pushed, 0);
    assert.equal(cloud.state.thirds.length, 250, "une seconde synchronisation ne crée aucun doublon");
    assert.equal(new Set(cloud.state.thirds.map(x => x.client_uid)).size, 250);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("pagination cloud : 250 écritures sont toutes récupérées sur trois pages", async () => {
  const companyId = "company-pagination-entries-test";
  const entries = Array.from({ length: 250 }, (_, index) => ({
    id: index + 1,
    client_uid: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    entry_date: "2026-02-01", journal: "ACH", reference: `ACH-${index + 1}`,
    is_reversed: false, reverse_of_entry_id: null, sync_version: 1,
    lines: [
      { account_code: "601", label: "Achat", third_name: "Fournisseur Démo", debit: 125, credit: 0 },
      { account_code: "401", label: "Fournisseur", third_name: "Fournisseur Démo", debit: 0, credit: 125 },
    ],
  }));
  const cloud = makeCloud(companyId, [], { paginateEntries: true });
  cloud.state.entries = structuredClone(entries);
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore()));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await syncAccounting(cloud.client, companyId, "admin");
    const recovered = JSON.parse(storage.getItem("mizane_v1"));
    assert.equal(result.pulled, 250);
    assert.equal(recovered.entries.length, 250, "aucune page n'est ignorée");
    assert.equal(recovered.entries[249].reference, "ACH-250");
    assert.deepEqual(recovered.entries[0].lines.map(line => ({
      account: line.account, third: line.third, debit: line.debit, credit: line.credit,
    })), [
      { account: "601", third: "Fournisseur Démo", debit: 125, credit: 0 },
      { account: "401", third: "Fournisseur Démo", debit: 0, credit: 125 },
    ], "les comptes, tiers et montants des lignes sont conservés");
    for (const entry of recovered.entries) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      assert.equal(debit, credit, "chaque écriture récupérée reste équilibrée");
    }
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("séparation des entreprises : une réponse cloud d'une autre entreprise bloque la synchronisation", async () => {
  const companyId = "company-alpha-test";
  const uid = "d0000000-0000-4000-8000-000000000001";
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore([
    { client_uid: uid, name: "Donnée entreprise Alpha", type: "client", phone: "", email: "" },
  ])));
  const cloud = makeCloud(companyId);
  const isolatedClient = { functions: { invoke: async (name) => {
    if (name === "read-accounting") {
      return { data: { ...structuredClone(cloud.state), company_id: "company-beta-test" }, error: null };
    }
    throw new Error("Aucun envoi ne doit être tenté après une réponse cloud incohérente.");
  } } };
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(isolatedClient, companyId, "admin"), /Réponse cloud incohérente/);
    assert.equal(cloud.pushes, 0);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Donnée entreprise Alpha");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

await testAsync("rôle lecteur : les données locales en attente ne sont jamais envoyées au cloud", async () => {
  const companyId = "company-reader-test";
  const uid = "d0000000-0000-4000-8000-000000000002";
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore([
    { client_uid: uid, name: "Modification en lecture seule", type: "client", phone: "", email: "" },
  ])));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "reader"), /lecture seule/);
    assert.equal(cloud.pushes, 0);
    assert.equal(cloud.state.thirds.length, 0);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Modification en lecture seule");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

await testAsync("synchronisation multi-onglets : Web Locks sérialise par entreprise", async () => {
  const previousNavigator = globalThis.navigator;
  const previousStorage = globalThis.localStorage;
  let captured = null;
  globalThis.navigator = { locks: { request: async (name, options, callback) => {
    captured = { name, mode: options.mode };
    return callback();
  } } };
  globalThis.localStorage = { getItem: () => null };
  try {
    await assert.rejects(syncAccounting({}, "company-test", "admin"), /Aucune comptabilité locale/);
    assert.deepEqual(captured, { name: "mizane-accounting-sync:company-test", mode: "exclusive" });
  } finally {
    if (previousNavigator === undefined) delete globalThis.navigator;
    else globalThis.navigator = previousNavigator;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("politique de reprise : les erreurs temporaires sont reconnues", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(shouldRetryFunctionError({ status, message: "temporary" }), true, "statut " + status);
  }
  assert.equal(shouldRetryFunctionError({ status: 422, message: "Écriture invalide" }), false);
  assert.equal(shouldRetryFunctionError({ status: 401, message: "Session invalide" }), false);
  assert.equal(shouldRetryFunctionError({ message: "Network request failed" }), true);
});


console.log("— Gestion de stock —");
function freshStockStore() { return { settings: { currency: "MAD" } }; }
test("stock : article physique et service avec règles de traçabilité", () => {
  const s = freshStockStore();
  assert.equal(addProduct(s, { sku: "ART-001", name: "Carton", type: "goods", unit: "pièce", tracking: "none" }).ok, true);
  assert.equal(addProduct(s, { sku: "SRV-001", name: "Conseil", type: "service", unit: "heure", tracking: "none" }).ok, true);
  assert.equal(addProduct(s, { sku: "SRV-002", name: "Service interdit", type: "service", unit: "heure", tracking: "serial" }).ok, false);
  assert.equal(addProduct(s, { sku: "ART-001", name: "Doublon", type: "goods", unit: "pièce", tracking: "none" }).ok, false);
});
test("stock : entrée, sortie et valorisation CUMP cohérentes", () => {
  const s = freshStockStore(), stock = getStock(s);
  const p = addProduct(s, { sku: "CUMP-01", name: "Article CUMP", type: "goods", unit: "pièce", tracking: "none" }).product;
  const w = stock.warehouses[0];
  assert.equal(postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: w.id, quantity: 10, unitCost: 100 }).ok, true);
  assert.equal(postStockMovement(s, { kind: "issue", productId: p.id, warehouseId: w.id, quantity: 3 }).ok, true);
  assert.equal(stockBalance(stock, p.id, w.id), 7);
  assert.equal(productBalance(stock, p.id), 7);
  assert.equal(stockValuation(stock, p.id), 700);
});
test("stock : CUMP pondère plusieurs réceptions et conserve la valeur après sortie", () => {
  const s = freshStockStore(), stock = getStock(s);
  const p = addProduct(s, { sku: "CUMP-02", name: "CUMP multi-coûts", type: "goods", unit: "pièce", tracking: "none" }).product;
  const w = stock.warehouses[0];
  postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: w.id, quantity: 10, unitCost: 100 });
  postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: w.id, quantity: 10, unitCost: 200 });
  const out = postStockMovement(s, { kind: "issue", productId: p.id, warehouseId: w.id, quantity: 10 });
  assert.equal(out.movement.unitCost, 150);
  assert.equal(out.movement.totalCost, 1500);
  assert.equal(stockBalance(stock, p.id, w.id), 10);
  assert.equal(stockValuation(stock, p.id), 1500);
});
test("stock : transfert entre entrepôts conserve la quantité totale", () => {
  const s = freshStockStore(), stock = getStock(s);
  const p = addProduct(s, { sku: "TR-01", name: "Article transfert", type: "goods", unit: "pièce", tracking: "none" }).product;
  const w1 = stock.warehouses[0], w2 = addWarehouse(s, "Dépôt secondaire").warehouse;
  assert.equal(postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: w1.id, quantity: 10, unitCost: 12 }).ok, true);
  assert.equal(postStockMovement(s, { kind: "transfer", productId: p.id, warehouseId: w1.id, destinationWarehouseId: w2.id, quantity: 4 }).ok, true);
  assert.equal(stockBalance(stock, p.id, w1.id), 6);
  assert.equal(stockBalance(stock, p.id, w2.id), 4);
  assert.equal(productBalance(stock, p.id), 10);
});
test("stock : refus du négatif par défaut et FIFO sans couche", () => {
  const s = freshStockStore(), stock = getStock(s);
  const p = addProduct(s, { sku: "FIFO-01", name: "Article FIFO", type: "goods", unit: "pièce", tracking: "none" }).product;
  const w = stock.warehouses[0];
  stock.settings.valuationMethod = "fifo";
  assert.equal(stock.settings.allowNegative, false);
  assert.equal(postStockMovement(s, { kind: "issue", productId: p.id, warehouseId: w.id, quantity: 1 }).ok, false);
  assert.equal(postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: w.id, quantity: 5, unitCost: 20 }).ok, true);
  const out = postStockMovement(s, { kind: "issue", productId: p.id, warehouseId: w.id, quantity: 2 });
  assert.equal(out.ok, true);
  assert.equal(out.movement.totalCost, 40);
  assert.equal(stockBalance(stock, p.id, w.id), 3);
});
test("stock : service et entrepôt invalide refusés", () => {
  const s = freshStockStore();
  const p = addProduct(s, { sku: "SRV-03", name: "Prestation", type: "service", unit: "heure", tracking: "none" }).product;
  assert.equal(postStockMovement(s, { kind: "receipt", productId: p.id, warehouseId: "main", quantity: 1, unitCost: 10 }).ok, false);
  const q = addProduct(s, { sku: "PH-01", name: "Physique", type: "goods", unit: "pièce", tracking: "none" }).product;
  assert.equal(postStockMovement(s, { kind: "receipt", productId: q.id, warehouseId: "unknown", quantity: 1, unitCost: 10 }).ok, false);
});

test("stock : conversions d’unités convertissent quantité et coût vers l’unité de base", () => {
  const s=freshStockStore(), stock=getStock(s);
  const p=addProduct(s,{sku:"UNIT-01",name:"Cartons",type:"goods",unit:"pièce",tracking:"none",unitConversions:[{unit:"carton",factorToBase:12}]}).product;
  const w=stock.warehouses[0];
  const receipt=postStockMovement(s,{kind:"receipt",productId:p.id,warehouseId:w.id,quantity:2,unit:"carton",unitCost:1200});
  assert.equal(receipt.ok,true);
  assert.equal(receipt.movement.quantity,24);
  assert.equal(receipt.movement.unitCost,100);
  assert.equal(stockBalance(stock,p.id,w.id),24);
  assert.equal(stockValuation(stock,p.id),2400);
  const issue=postStockMovement(s,{kind:"issue",productId:p.id,warehouseId:w.id,quantity:1,unit:"carton"});
  assert.equal(issue.ok,true);
  assert.equal(stockBalance(stock,p.id,w.id),12);
  assert.equal(stockValuation(stock,p.id),1200);
  assert.equal(postStockMovement(s,{kind:"issue",productId:p.id,warehouseId:w.id,quantity:1,unit:"palette"}).ok,false);
});

test("stock : traçabilité par lot suit les quantités par entrepôt et reste atomique", () => {
  const s=freshStockStore(), stock=getStock(s);
  const p=addProduct(s,{sku:"LOT-01",name:"Produit par lot",type:"goods",unit:"pièce",tracking:"lot"}).product;
  const w=stock.warehouses[0];
  assert.equal(postStockMovement(s,{kind:"receipt",productId:p.id,warehouseId:w.id,quantity:10,unitCost:10,lotCode:"LOT-A"}).ok,true);
  assert.equal(postStockMovement(s,{kind:"issue",productId:p.id,warehouseId:w.id,quantity:3,lotCode:"LOT-A"}).ok,true);
  assert.equal(stock.lotBalances.find(x=>x.productId===p.id&&x.lotCode==="LOT-A").quantity,7);
  const valueBefore=stockValuation(stock,p.id);
  assert.equal(postStockMovement(s,{kind:"issue",productId:p.id,warehouseId:w.id,quantity:1,lotCode:"LOT-B"}).ok,false);
  assert.equal(stockValuation(stock,p.id),valueBefore);
  assert.equal(stockBalance(stock,p.id,w.id),7);
});

test("stock : numéros de série uniques, sorties et transferts suivis individuellement", () => {
  const s=freshStockStore(), stock=getStock(s);
  const p=addProduct(s,{sku:"SER-01",name:"Produit sérialisé",type:"goods",unit:"pièce",tracking:"serial"}).product;
  const w1=stock.warehouses[0], w2=addWarehouse(s,"Dépôt série").warehouse;
  assert.equal(addProduct(s,{sku:"SER-02",name:"Séries et conversion",type:"goods",unit:"pièce",tracking:"serial",unitConversions:[{unit:"boîte",factorToBase:2}]}).ok,false);
  assert.equal(postStockMovement(s,{kind:"receipt",productId:p.id,warehouseId:w1.id,quantity:2,unitCost:20,serialNumbers:["SN-001","SN-002"]}).ok,true);
  assert.equal(postStockMovement(s,{kind:"issue",productId:p.id,warehouseId:w1.id,quantity:1,serialNumbers:["SN-001"]}).ok,true);
  assert.equal(postStockMovement(s,{kind:"transfer",productId:p.id,warehouseId:w1.id,destinationWarehouseId:w2.id,quantity:1,serialNumbers:["SN-002"]}).ok,true);
  assert.equal(stock.serials.find(x=>x.serialNumber==="SN-001").status,"issued");
  assert.equal(stock.serials.find(x=>x.serialNumber==="SN-002").warehouseId,w2.id);
  assert.equal(postStockMovement(s,{kind:"receipt",productId:p.id,warehouseId:w1.id,quantity:1,serialNumbers:["SN-002"]}).ok,false);
  assert.equal(postStockMovement(s,{kind:"receipt",productId:p.id,warehouseId:w1.id,quantity:1.5,serialNumbers:["SN-003"]}).ok,false);
  assert.equal(stockBalance(stock,p.id,w1.id),0);
  assert.equal(stockBalance(stock,p.id,w2.id),1);
});
test("stock : navigation et synchronisation cloud sont raccordées", () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const cloud = readFileSync(new URL("../js/cloud-sync.js", import.meta.url), "utf8");
  assert.match(app, /\["stock", "Gestion de stock"\]/);
  assert.match(app, /\["purchases", "Achats"\]/);
  assert.match(app, /\["commercial-margins", "Marges commerciales"\]/);
  assert.match(app, /\["budget", "Budget et écarts"\]/);
  assert.match(app, /"stock", "purchases", "commercial-margins", "customer-followups", "budget", "tax"(?:, "notifications")?\]\s*;/);
  assert.match(cloud, /delete billingPayload\.stock/);
  assert.match(cloud, /legacyStockAvailable: Boolean\(localStore\.stock\)/);
  assert.match(cloud, /localStore\.stock = syncedBilling\.stock/);
});



test("stock : coût des sorties commerciales comptabilisé selon la valorisation réelle et sans doublon", () => {
  const store=newStore();
  store.settings.customAccounts=[
    {code:"31",label:"Stock",type:"asset"},
    {code:"603",label:"Coût des ventes",type:"expense"},
  ];
  const document={document_id:"doc-1",operation_uid:"op-1",document_date:"2026-11-24",reference:"FAC-001"};
  const movements=[
    {document_id:"doc-1",quantity_delta:-2,value_delta:-35.5,movement_date:"2026-11-24"},
    {document_id:"doc-1",quantity_delta:-1,value_delta:-20,movement_date:"2026-11-24"},
    {document_id:"other",quantity_delta:-8,value_delta:-100,movement_date:"2026-11-24"},
  ];
  const mapping={inventory:"31",cogs:"603"};
  const proposal=buildSalesStockCostJournalEntry(store,document,movements,mapping,"perpetual");
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.equal(proposal.cost,55.5);
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["603",55.5,0],["31",0,55.5]
  ]);
  const posted=postSalesStockCostJournalEntry(store,document,movements,mapping,"perpetual");
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  assert.equal(postSalesStockCostJournalEntry(store,document,movements,mapping,"perpetual").duplicate,true);
  assert.equal(store.entries.length,1,"une nouvelle tentative ne doit pas doubler le coût des ventes");
  assert.equal(buildSalesStockCostJournalEntry(store,{...document,operation_uid:"op-missing"},movements,{},"perpetual").ok,false,"les comptes doivent être configurés explicitement");
  assert.equal(buildSalesStockCostJournalEntry(store,document,movements,mapping,"periodic").skipped,true,"l'inventaire intermittent ne génère pas de coût des ventes à chaque sortie");
  assert.equal(buildSalesStockCostJournalEntry(store,document,[{...movements[0],value_delta:0}],mapping,"perpetual").ok,false,"un coût nul ne doit pas être comptabilisé");
  store.settings.closedPeriods=[{startDate:"2026-11-01",endDate:"2026-11-30",status:"closed"}];
  const blocked=postSalesStockCostJournalEntry(store,{...document,operation_uid:"op-2"},movements,mapping,"perpetual");
  assert.equal(blocked.ok,false,"une période clôturée bloque l'écriture");
  assert.equal(store.entries.length,1,"aucune écriture partielle en période clôturée");
  assert.match(stockUiSource,/COUT STOCK VENTE/);
  assert.match(stockUiSource,/reverseEntry\(store,costEntry\.id/);
  assert.match(stockUiSource,/accountingReversal\.ok/);
});

console.log("— Moteur serveur de stock —");
test("stock cloud : tables dédiées et cloisonnement company_id", () => {
  for (const table of ["stock_settings","stock_warehouses","stock_products","stock_documents","stock_document_lines","stock_movements","stock_balances","stock_valuation_layers","stock_valuation_allocations","stock_reservations","stock_audit_logs"]) {
    assert.match(stockServerMigration, new RegExp("create table public\\."+table+"\\b"));
    assert.match(stockServerMigration, new RegExp("alter table public.%I enable row level security"));
  }
  assert.match(stockServerMigration, /private\.is_active_company_member\(company_id\)/);
  assert.match(stockServerMigration, /unique\(company_id,operation_uid\)/);
  assert.match(stockServerMigration, /request_hash text not null/);
});
test("stock cloud : wrappers invoker résolvent les fonctions privées et les clés étrangères sont indexées", () => {
  assert.match(stockServerMigration, /grant usage on schema private to authenticated/i);
  assert.match(stockServerMigration, /as \$\$ select private\.stock_read_state_impl/);
  for (const index of [
    "stock_audit_logs_actor_user_id_idx","stock_audit_logs_company_id_idx",
    "stock_balances_company_warehouse_idx","stock_document_lines_company_destination_warehouse_idx",
    "stock_document_lines_company_product_idx","stock_document_lines_company_warehouse_idx",
    "stock_documents_company_reversed_by_idx","stock_documents_created_by_idx",
    "stock_movements_company_line_idx","stock_movements_company_warehouse_idx",
    "stock_reservations_company_warehouse_idx","stock_reservations_created_by_idx",
    "stock_settings_updated_by_idx","stock_valuation_allocations_company_layer_idx",
    "stock_valuation_allocations_company_movement_idx","stock_valuation_layers_company_source_movement_idx",
    "stock_valuation_layers_company_warehouse_idx"
  ]) assert.match(stockIndexesMigration, new RegExp("create index if not exists " + index));
});
test("stock cloud : écritures serveur réservées aux rôles admin et accountant", () => {
  assert.match(stockServerMigration, /m\.role in \('admin','accountant'\)/);
  assert.match(stockServerMigration, /Seul un administrateur peut modifier l’autorisation de stock négatif/);
  assert.match(stockServerMigration, /grant execute on function public\.stock_post_document[\s\S]*to authenticated/);
  assert.match(stockServerMigration, /revoke all on public\.%I from public, anon, authenticated/);
});
test("stock cloud : journal append-only, idempotence et verrou transactionnel", () => {
  assert.match(stockServerMigration, /pg_advisory_xact_lock/);
  assert.match(stockServerMigration, /operation_uid/);
  assert.match(stockServerMigration, /operation_uid déjà utilisé avec un contenu différent/);
  assert.match(stockServerMigration, /stock_movements_immutable/);
  assert.match(stockServerMigration, /stock_allocations_immutable/);
  assert.match(stockServerMigration, /stock_audit_immutable/);
});
test("stock cloud : valorisation FIFO avec allocations explicites et réservations", () => {
  assert.match(stockServerMigration, /stock_valuation_allocations/);
  assert.match(stockServerMigration, /remaining_quantity=remaining_quantity-v_take/);
  assert.match(stockServerMigration, /stock_reserve\(/);
  assert.match(stockServerMigration, /Cette sortie empiéterait sur des quantités réservées/);
  assert.match(stockServerMigration, /la méthode FIFO interdit le stock négatif/);
});
test("stock cloud : contrepassation documentée et paramètres de valorisation verrouillés", () => {
  assert.match(stockServerMigration, /stock_reverse_document\(/);
  assert.match(stockServerMigration, /Contrepassation suspendue : le recalcul exact des couches de valorisation/);
  assert.match(stockServerMigration, /La méthode de valorisation ne peut plus être changée après le premier mouvement/);
  assert.doesNotMatch(stockServerMigration, /insert into public\.accounting_entry_lines/);
});

test("stock cloud : lots, séries et conversions sont protégés côté serveur", () => {
  for (const table of ["stock_unit_conversions","stock_lots","stock_lot_balances","stock_serials"]) {
    assert.match(stockTraceabilityMigration,new RegExp("create table public\\."+table+"\\b"));
    assert.match(stockTraceabilityMigration,new RegExp("alter table public\\."+table+" enable row level security"));
  }
  assert.match(stockTraceabilityMigration,/private\.stock_prepare_document_line/);
  assert.match(stockTraceabilityMigration,/private\.stock_apply_tracking_movement/);
  assert.match(stockTraceabilityMigration,/factor_to_base/);
  assert.match(stockTraceabilityMigration,/'unit_conversions'/);
  assert.match(stockTraceabilityMigration,/v_qty:=round\(v_input_qty\*v_factor,6\)/);
  assert.match(stockTraceabilityMigration,/v_cost:=round\(v_cost\/v_factor,6\)/);
  assert.match(stockTraceabilityMigration,/Le mode de traçabilité ne peut pas être changé après le premier mouvement/);
  assert.match(stockLotFixMigration,/update public\.stock_lot_balances set quantity=quantity\+new\.quantity_delta/);
  assert.match(stockSerialGuardsMigration,/Les articles suivis par numéro de série ne peuvent pas utiliser de conversions/);
  assert.match(stockSerialGuardsMigration,/stock_serials_company_last_movement_idx/);
  assert.match(stockSerialGuardsMigration,/stock_serials_company_warehouse_idx/);
  assert.match(stockSerialNormalizeMigration,/jsonb_agg\(trim\(value\)/);
});

test("stock cloud : interface expose la saisie des lots, séries et unités alternatives", () => {
  assert.match(stockUiSource,/unit_conversions/);
  assert.match(stockUiSource,/id="sm-lot"/);
  assert.match(stockUiSource,/id="sm-serials"/);
  assert.match(stockUiSource,/id="sm-unit"/);
  assert.match(stockUiSource,/Lots disponibles/);
  assert.match(stockUiSource,/Numéros de série/);
  assert.match(stockUiSource,/const lots = cloudMode/);
  assert.doesNotMatch(stockUiSource,/value="lot" disabled/);
  assert.doesNotMatch(stockUiSource,/value="serial" disabled/);
});


test("stock cloud : RPC publiques invoker et logique privilégiée dans le schéma privé", () => {
  assert.match(stockServerMigration, /create or replace function public\.stock_read_state\(p_company_id uuid\)[\s\S]*?security invoker/i);
  assert.match(stockServerMigration, /create or replace function private\.stock_read_state_impl\(p_company_id uuid\)[\s\S]*?security definer/i);
  assert.doesNotMatch(stockServerMigration, /create or replace function public\.stock_[\s\S]*?security definer/i);
  assert.match(stockServerMigration, /revoke all on function public\.stock_read_state\(uuid\) from public,anon,authenticated/);
});
test("stock cloud : interface reliée aux RPC et ne pousse plus le stock dans la facturation", () => {
  assert.match(stockCloudSource, /supabase\.rpc\(functionName/);
  assert.match(stockCloudSource, /export function readCloudStock\(\)/);
  assert.match(stockCloudSource, /export function postCloudStockDocument/);
  assert.match(stockCloudSource, /delete billingPayload\.stock/);
  assert.match(stockUiSource, /readCloudStock\(\)/);
  assert.match(stockUiSource, /postCloudStockDocument\(/);
  assert.match(stockUiSource, /importLegacyStock/);
  assert.match(stockUiSource, /stableStockOperationUid/);
  assert.match(stockCloudSource, /mizane:legacy-stock-loaded/);
  const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(appSource, /mizane:legacy-stock-loaded/);
});
test("stock : catalogue extensible par entreprise et prix d’achat/vente HT", () => {
  assert.match(stockProductCatalogMigration,/create table if not exists public\.stock_product_families/i);
  assert.match(stockProductCatalogMigration,/create table if not exists public\.stock_product_types/i);
  assert.match(stockProductCatalogMigration,/purchase_price_ht numeric/i);
  assert.match(stockProductCatalogMigration,/sale_price_ht numeric/i);
  assert.match(stockProductCatalogMigration,/stock_save_family_impl/i);
  assert.match(stockProductCatalogMigration,/stock_save_type_impl/i);
  assert.match(stockProductCatalogMigration,/stock_save_product_catalog_impl/i);
  assert.match(stockProductCatalogMigration,/nature in \('physical','service'\)/i);
  assert.match(stockCatalogIndexesMigration,/stock_products_company_family_idx/i);
  assert.match(stockCatalogIndexesMigration,/stock_product_types_member_read/i);
  assert.match(stockCatalogGuardsMigration,/pg_advisory_xact_lock/);
  assert.match(stockCatalogGuardsMigration,/stock_unit_conversions/);
  assert.match(stockCatalogGuardsMigration,/Le mode de traçabilité ne peut pas être changé après le premier mouvement/);
  assert.match(stockCloudSource,/stock_read_catalog/);
  assert.match(stockCloudSource,/saveCloudStockFamily/);
  assert.match(stockCloudSource,/saveCloudStockType/);
  assert.match(stockUiSource,/Prix d’achat HT/);
  assert.match(stockUiSource,/Prix de vente HT/);
  assert.match(stockUiSource,/id="sp-purchase-unit"/);
  assert.match(stockUiSource,/id="sp-sale-unit"/);
  assert.match(stockUiSource,/refreshPriceUnits/);
  assert.match(stockUiSource,/sp-custom-units/);
  assert.match(stockUiSource,/purchase_price_unit:input\.purchasePriceUnit/);
  assert.match(stockUiSource,/sale_price_unit:input\.salePriceUnit/);
  assert.doesNotMatch(stockUiSource,/readonly aria-readonly="true"/);
  assert.match(stockPriceUnitsMigration,/add column if not exists purchase_price_unit text/i);
  assert.match(stockPriceUnitsMigration,/add column if not exists sale_price_unit text/i);
  assert.match(stockPriceUnitsMigration,/purchase_price_unit=v_purchase_unit/);
  assert.match(stockPriceUnitsMigration,/sale_price_unit=v_sale_unit/);
  assert.match(stockPriceUnitsMigration,/L’unité du prix d’achat doit être l’unité de base/);
  assert.match(stockPriceUnitsMigration,/L’unité du prix de vente doit être l’unité de base/);
  assert.match(stockPriceUnitsMigration,/pg_advisory_xact_lock/);
  assert.match(stockPriceUnitsMigration,/Les conversions ne peuvent plus être modifiées après le premier mouvement/);
  assert.match(stockUiSource,/saveCloudStockProduct/);
});
test("facturation : date et heure d’enregistrement automatiques visibles sur la facture", () => {
  assert.match(billingUiSource,/createdAt: source \? source\.createdAt : new Date\(\)\.toISOString\(\)/);
  assert.match(billingUiSource,/function formatRecordedAt\(value, locale = "fr"\)/);
  assert.match(billingUiSource,/timeStyle: "medium"/);
  assert.match(billingUiSource,/Enregistrée le :/);
  assert.match(billingUiSource,/<th>Enregistrée le<\/th>/);
  assert.match(billingUiSource,/formatRecordedAt\(doc\.createdAt/);
  assert.match(billingUiSource,/createdAt: new Date\(\)\.toISOString\(\),[\s\S]*sourceQuoteId: quote\.id/);
});

test("facturation : une facture ayant des écritures de règlement ne peut pas être modifiée", () => {
  assert.match(billingUiSource,/function invoiceHasAccountingEntries\(invoice\)/);
  assert.match(billingUiSource,/entry\.reference === invoiceReference \|\| String\(entry\.reference \|\| ""\)\.startsWith\(paymentPrefix\)/);
  assert.match(billingUiSource,/source && type === "invoice" && invoiceHasAccountingEntries\(source\)/);
  assert.match(billingUiSource,/Le règlement corrigé est conservé, mais sa nouvelle écriture reste à générer/);
  assert.match(billingUiSource,/ancienne écriture contrepassée ; nouvelle écriture en attente de comptabilisation/i);
});

test("facturation : les lignes de facture peuvent être liées à un article et à un entrepôt", () => {
  assert.match(billingUiSource,/stockProductId/);
  assert.match(billingUiSource,/stockWarehouseId/);
  assert.match(billingUiSource,/unit_conversions/);
  assert.match(billingUiSource,/stockLotCode/);
  assert.match(billingUiSource,/stockSerialNumbers/);
});
test("facturation : la validation déclenche une sortie de stock idempotente", () => {
  assert.match(billingUiSource,/sales_trigger/);
  assert.match(billingUiSource,/invoice_validation/);
  assert.match(billingUiSource,/sourceType:"sales_invoice"/);
  assert.match(billingUiSource,/stockPendingOperation/);
  assert.match(billingUiSource,/Réessayer le stock/);
});
test("facturation : les livraisons partielles ne postent que les lignes sélectionnées", () => {
  assert.match(billingUiSource,/function openInvoiceDelivery/);
  assert.match(billingUiSource,/sourceType:"sales_delivery"/);
  assert.match(billingUiSource,/if \(rows && !rows\[index\]\) continue/);
  assert.match(billingUiSource,/stockFulfilledQuantity/);
  assert.match(billingUiSource,/data-bill-deliver/);
});

test("facturation : réservations explicites liées à la facture, converties et idempotentes", () => {
  assert.match(billingUiSource,/data-bill-reserve-stock/);
  assert.match(billingUiSource,/async function reserveInvoiceStock/);
  assert.match(billingUiSource,/reserveCloudStock\(/);
  assert.match(billingUiSource,/sourceType:"sales_invoice"/);
  assert.match(billingUiSource,/sourceId:String\(invoice\.id\)/);
  assert.match(billingUiSource,/factor_to_base/);
  assert.match(billingUiSource,/Math\.round\(\(item\.remaining\*item\.factor\+Number\.EPSILON\)\*10000\)\/10000/);
  assert.match(billingUiSource,/async function invoiceReservationOperationUid/);
  assert.match(billingUiSource,/subtle\.digest\("SHA-256"/);
  assert.match(billingUiSource,/operationUid:await invoiceReservationOperationUid/);
  assert.match(billingUiSource,/status:"pending"/);
  assert.match(billingUiSource,/operation\.status="done"/);
  assert.match(billingUiSource,/stockReservationsCreated/);
  assert.match(billingUiSource,/stockReservationOperations/);
  assert.match(billingUiSource,/source\?\.stockReservationsCreated/);
});

test("stock : les réceptions conservent la référence et l'origine fournisseur", () => {
  assert.match(stockUiSource,/sm-supplier/);
  assert.match(stockUiSource,/const sourceType=input.kind==="receipt"\?"supplier_receipt"/);
  assert.match(stockUiSource,/Fournisseur : /);
  assert.match(stockUiSource,/Réception fournisseur/);
});

test("stock cloud : les soldes complets du serveur priment sur les 500 mouvements récents", () => {
  assert.match(stockCoreSource, /Array\.isArray\(stock\.cloudBalances\)/);
  assert.match(stockUiSource, /cloudBalances:data\?\.balances/);
});
test("stock cloud : import historique non destructif et réservation/libération", () => {
  assert.match(stockUiSource, /Importer l’ancien stock local/);
  assert.match(stockUiSource, /reserveCloudStock\(/);
  assert.match(stockUiSource, /releaseCloudStockReservation\(/);
  assert.match(stockUiSource, /stock-accounting-mode/);
  assert.match(stockServerMigration, /accounting_mode text not null default 'perpetual'/);
  assert.match(stockServerMigration, /status='released'/);
  assert.match(stockServerMigration, /duplicate',true,'reservation_id'/);
});

test("stock cloud : les sorties de vente consomment les réservations automatiquement et de façon atomique", () => {
  assert.match(stockReservationFulfillmentMigration,/p_source_type in \(\x27sales_invoice\x27,\x27sales_delivery\x27\)/);
  assert.match(stockReservationFulfillmentMigration,/order by r\.created_at,r\.id[\s\S]*?for update/);
  assert.match(stockReservationFulfillmentMigration,/status=\x27fulfilled\x27/);
  assert.match(stockReservationFulfillmentMigration,/quantity=quantity-v_reservation_take/);
  assert.match(stockReservationFulfillmentMigration,/stock\.reservation_partially_fulfilled/);
  assert.match(stockReservationFulfillmentMigration,/stock\.reservation_fulfilled/);
  assert.match(stockReservationFulfillmentMigration,/consumed_quantity/);
  assert.match(stockReservationFulfillmentMigration,/remaining_quantity/);
});

test("achats : affectation de réception validée avant tout mouvement serveur", () => {
  const order = {
    type:"order", supplierId:7,
    lines:[
      {productId:"P1",warehouseId:"W1",baseQuantity:5,receivedBase:3},
      {productId:"P1",warehouseId:"W1",baseQuantity:4,receivedBase:1},
    ],
  };
  const invoice = {
    orderId:12,supplierId:7,
    lines:[{productId:"P1",warehouseId:"W1",baseQuantity:4}],
  };
  const valid = planSupplierInvoiceReceiptAllocation(order,invoice,[{line_index:0,quantity:4}]);
  assert.equal(valid.ok,true);
  assert.equal(valid.allocations.reduce((sum,item)=>sum+item.quantity,0),4);
  assert.equal(order.lines[0].receivedBase,3);
  assert.equal(order.lines[1].receivedBase,1);
  const invalid = planSupplierInvoiceReceiptAllocation(order,invoice,[{line_index:0,quantity:6}]);
  assert.equal(invalid.ok,false);
  assert.match(invalid.error,/Aucun mouvement de stock n'a été envoyé/);
  assert.equal(invalid.allocations.length,0);
  assert.equal(order.lines[0].receivedBase,3);
  assert.equal(order.lines[1].receivedBase,1);
  const multiLine = planSupplierInvoiceReceiptAllocation(order,{
    orderId:12,supplierId:7,
    lines:[
      {productId:"P1",warehouseId:"W1",baseQuantity:2},
      {productId:"P1",warehouseId:"W1",baseQuantity:3},
    ],
  },[{line_index:0,quantity:2},{line_index:1,quantity:3}]);
  assert.equal(multiLine.ok,true);
  assert.equal(multiLine.allocations.reduce((sum,item)=>sum+item.quantity,0),5);
});

test("achats : fournisseurs, commandes, factures et rapprochement commande/facture", () => {
  assert.match(purchasesUiSource,/Nouveau fournisseur/);
  assert.match(purchasesUiSource,/Nouvelle commande fournisseur/);
  assert.match(purchasesUiSource,/Nouvelle facture fournisseur/);
  assert.match(purchaseControlsSource,/Rapprochement impossible/);
  assert.match(purchasesUiSource,/purchase_trigger/);
  assert.match(purchasesUiSource,/supplier_receipt/);
  assert.match(purchasesUiSource,/supplier_invoice/);
});
test("achats : factures multiples rapprochées cumulativement par article et entrepôt", () => {
  assert.match(purchasesUiSource,/function purchaseLineKey\(line\)/);
  assert.match(purchasesUiSource,/doc\.type === "order" && doc\.status !== "cancelled"/);
  assert.match(purchasesUiSource,/function orderLinesFor\(order, line\)/);
  assert.match(purchaseControlsSource,/alreadyInvoiced/);
  assert.match(purchaseControlsSource,/cumul des factures dépasse la quantité commandée/);
  assert.match(purchaseControlsSource,/price_mismatch/);
  assert.match(purchasesUiSource,/requireReceived:stockState\?\.settings\?\.purchase_trigger === "receipt"/);
});
test("achats : réception d'une facture répartie avant le mouvement serveur", () => {
  assert.match(purchasesUiSource,/planSupplierInvoiceReceiptAllocation\(linkedOrder, doc, pending\.lines\)/);
  assert.match(purchasesUiSource,/allocationPlan\.ok/);
  assert.match(purchasesUiSource,/allocation\.orderLine\.receivedBase = round/);
  assert.match(purchasesUiSource,/pending\.attempted = true/);
  assert.match(purchaseReceiptSource,/const capacity = Math\.max\(0, quantity\(orderLine\.baseQuantity\) - quantity\(orderLine\.receivedBase\) - alreadyPlanned\)/);
  assert.match(purchaseReceiptSource,/Aucun mouvement de stock n'a été envoyé/);
});

test("achats : une facture ultérieure ne perd pas son entrée de stock à cause des réceptions précédentes", () => {
  assert.match(purchasesUiSource,/const already=num\(line\.stockPostedBase\)/);
  assert.match(purchasesUiSource,/Chaque facture possède son propre cumul d'entrée/);
  assert.match(purchasesUiSource,/stockState\?\.settings\?\.purchase_trigger === "supplier_invoice" \? num\(line\.stockPostedBase\)/);
});

test("achats : réception partielle idempotente et traçabilité des lots/séries", () => {
  assert.match(purchasesUiSource,/operationUid:uuid\(\)/);
  assert.match(purchasesUiSource,/activeReceiptOperations/);
  assert.match(purchasesUiSource,/pendingInvoiceReceipt/);
  assert.match(purchasesUiSource,/Réessayer la même réception/);
  assert.match(purchasesUiSource,/line_index/);
  assert.match(purchasesUiSource,/Le code de lot est obligatoire/);
  assert.match(purchasesUiSource,/numéro de série est requis/);
  assert.match(purchasesUiSource,/postCloudStockDocument\(/);
});
test("achats : données fournisseurs synchronisées dans la facturation cloud sans écrasement initial", () => {
  assert.match(purchasesUiSource,/store\.billing\.purchases/);
  assert.match(purchasesUiSource,/mizane:billing-changed/);
  assert.match(billingSyncSource,/!local\.documents\.length && !local\.purchases\?\.documents\?\.length && !local\.purchases\?\.suppliers\?\.length/);
  assert.match(billingSyncSource,/Conflit lors de la première synchronisation des Achats/);
  assert.match(billingSyncSource,/Aucune version n\x27a été écrasée/);
  const appSource = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(appSource,/viewPurchases/);
  assert.match(appSource,/readerRestrictedRoutes[\s\S]*purchases/);
});

test("notifications comptables : boîte personnelle, alertes de blocage et revue admin", () => {
  assert.match(notificationsMigration, /create table if not exists public\.accounting_notifications/);
  assert.match(notificationsMigration, /recipient_user_id = \(select auth\.uid\(\)\)/);
  assert.match(notificationsMigration, /create_accounting_alert/);
  assert.match(notificationsMigration, /m\.role = 'accountant'/);
  assert.match(notificationsMigration, /review_accounting_notification/);
  assert.match(notificationsMigration, /m\.role = 'admin'/);
  assert.match(notificationsMigration, /flag_duplicate_accounting_reference/);
  assert.match(notificationsMigration, /Référence comptable déjà utilisée/);
  assert.match(accountingAnomalyReportingMigration, /report_accounting_anomalies_impl/);
  assert.match(accountingAnomalyReportingMigration, /md5\(/);
  assert.match(accountingAnomalyReportingMigration, /security invoker/i);
  assert.match(notificationsSource, /notifyDetectedAnomalies/);
  assert.match(notificationsSource, /report_accounting_anomalies/);
  assert.match(coreSource, /notifyDetectedAnomalies\(anomalies\)/);
  assert.match(notificationsSource, /notifySyncFailure/);
  assert.match(notificationsSource, /review_accounting_notification/);
  assert.match(notificationsSource, /Marquer comme lue/);
  assert.match(appSource, /notifications: viewNotifications/);
  assert.match(appSource, /getUnreadNotificationCount/);
  assert.match(appSource, /notifySyncFailure/);
});


test("facturation : comptes de stock persistés et reprises automatiques idempotentes", () => {
  assert.match(billingUiSource, /\["customer", "revenue", "tax", "bank", "cash", "fxGain", "fxLoss", "inventory", "cogs", "stockConsumption", "stockLoss", "stockAdjustmentGain", "stockAdjustmentLoss", "stockVariation"\]/);
  assert.match(billingUiSource, /async function retryPendingInvoiceStockOperations\(\)/);
  assert.match(billingUiSource, /hasInventoryAccount/);
  assert.match(billingUiSource, /hasCogsAccount/);
  assert.match(billingUiSource, /void retryPendingInvoiceStockOperations\(\)/);
  assert.match(billingUiSource, /pendingStockRetryPromise/);
  assert.match(billingUiSource, /operationUid:operation\.operationUid/);
});

test("facturation : publication atomique des écritures vente et règlements", () => {
  const store = newStore();
  store.settings.customAccounts = [
    {code:"411",label:"Clients",type:"asset"},
    {code:"701",label:"Ventes",type:"income"},
    {code:"512",label:"Banque",type:"asset"},
  ];
  store.settings.closedPeriods = [{startDate:"2026-11-01",endDate:"2026-11-30",status:"closed"}];
  const makeEntry = (date, reference) => ({
    date, journal:"VTE", reference,
    lines:[
      {account:"411",label:"Client",debit:100,credit:0},
      {account:"701",label:"Vente",debit:0,credit:100},
    ],
  });
  const initialNextId = store.nextId;
  const failed = postBillingJournalEntriesAtomically(store, [
    makeEntry("2026-10-31","FACTURE TEST"),
    makeEntry("2026-11-15","REGLEMENT TEST #1"),
  ]);
  assert.equal(failed.ok,false);
  assert.equal(failed.created,0);
  assert.equal(store.entries.length,0);
  assert.equal(store.nextId,initialNextId);
  store.settings.closedPeriods = [];
  const success = postBillingJournalEntriesAtomically(store, [
    makeEntry("2026-10-31","FACTURE TEST"),
    makeEntry("2026-11-15","REGLEMENT TEST #1"),
  ]);
  assert.equal(success.ok,true);
  assert.equal(success.created,2);
  assert.equal(store.entries.length,2);
  assert.equal(store.nextId,initialNextId+2);
});


test("facturation : avoir total non remboursé produit une écriture de régularisation équilibrée", () => {
  const store = newStore();
  store.settings.customAccounts = [
    {code:"411",label:"Clients",type:"asset"},
    {code:"701",label:"Ventes",type:"income"},
    {code:"4457",label:"TVA collectée",type:"liability"},
  ];
  store.__accountCache = {};
  const invoice = {
    id:10,type:"invoice",number:"FAC-2026-001",date:"2026-11-20",
    customerName:"Client test",exchangeRate:1,
    lines:[{description:"Prestation",quantity:1,unitPrice:100,taxRate:20}],
  };
  const creditNote = {id:11,type:"credit_note",number:"AVO-2026-0001",date:"2026-11-24"};
  const mapping = {customer:"411",revenue:"701",tax:"4457"};
  const proposal = buildFullCreditNoteJournalEntry(store,invoice,creditNote,mapping);
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.equal(proposal.entries.length,1);
  assert.equal(proposal.entries[0].reference,"AVOIR AVO-2026-0001");
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["701",100,0],["4457",20,0],["411",0,120]
  ]);
  store.settings.closedPeriods=[{startDate:"2026-11-01",endDate:"2026-11-30",status:"closed"}];
  const closedProposal = buildFullCreditNoteJournalEntry(store,invoice,creditNote,mapping);
  assert.equal(closedProposal.ok,true);
  const closed = postBillingJournalEntriesAtomically(store,closedProposal.entries);
  assert.equal(closed.ok,false);
  assert.match(closed.errors.join(" "),/clôturée/i);
  assert.equal(store.entries.length,0);
  assert.match(billingUiSource,/function canIssueFullCreditNote\(invoice\)/);
  assert.match(billingUiSource,/function issueFullCreditNote\(invoiceId\)/);
  assert.match(billingUiSource,/data-bill-credit-note/);
  assert.match(billingUiSource,/invoice\.status = "credited"/);
  assert.match(billingUiSource,/doc\.type === "credit_note" \? "AVOIR"/);
});
 

test("facturation : avoir partiel réduit le solde client et le remboursement est comptabilisé sans dépasser le crédit", () => {
  const store=newStore();
  store.settings.customAccounts=[
    {code:"411",label:"Clients",type:"asset"},
    {code:"701",label:"Ventes",type:"income"},
    {code:"4457",label:"TVA collectée",type:"liability"},
    {code:"512",label:"Banque",type:"asset"},
    {code:"53",label:"Caisse",type:"asset"},
  ];
  store.__accountCache={};
  const invoice={id:21,type:"invoice",number:"FAC-TEST-21",customerName:"Client test",exchangeRate:1,totals:{ttc:240},paidAmount:240,payments:[{id:1,amount:240}],lines:[{description:"Article A",quantity:2,unitPrice:100,taxRate:20}]};
  const note={id:22,type:"credit_note",number:"AVO-TEST-22",date:"2026-11-24",sourceInvoiceId:21,lines:[{description:"Article A",sourceLineIndex:0,quantity:1,unitPrice:100,taxRate:20}],totals:{ht:100,tax:20,ttc:120}};
  const mapping={customer:"411",revenue:"701",tax:"4457",bank:"512",cash:"53"};
  const proposal=buildCreditNoteJournalEntry(store,invoice,note,mapping);
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["701",100,0],["4457",20,0],["411",0,120]]);
  const posted=postBillingJournalEntriesAtomically(store,proposal.entries);
  assert.equal(posted.ok,true,"écriture de l’avoir partiel refusée : "+posted.errors?.join(" "));
  assert.equal(calculateOutstandingBase([invoice,note]),0,"une facture intégralement payée ne laisse plus de créance après avoir, mais peut créer un crédit client remboursable");
  const refund={id:1,date:"2026-11-24",amount:80,method:"bank",exchangeRate:1};
  const refundProposal=buildCreditNoteRefundJournalEntry(store,invoice,note,refund,mapping);
  assert.equal(refundProposal.ok,true,refundProposal.errors?.join(" "));
  assert.deepEqual(refundProposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["411",80,0],["512",0,80]]);
  const refundPosted=postBillingJournalEntriesAtomically(store,refundProposal.entries);
  assert.equal(refundPosted.ok,true,"écriture du remboursement refusée : "+refundPosted.errors?.join(" "));
  assert.equal(buildCreditNoteRefundJournalEntry(store,invoice,note,refund,mapping).ok,false,"un remboursement déjà comptabilisé ne doit pas être dupliqué");
  const unpaidInvoice={id:31,type:"invoice",totals:{ttc:240},paidAmount:50,exchangeRate:1};
  const partialNote={id:32,type:"credit_note",sourceInvoiceId:31,totals:{ttc:40}};
  assert.equal(calculateOutstandingBase([unpaidInvoice,partialNote]),150,"le solde client diminue du montant de l'avoir");

  assert.equal(buildCreditNoteRefundJournalEntry(store,invoice,note,{...refund,id:2,amount:121},mapping).ok,false,"un remboursement supérieur à la valeur de l’avoir est refusé");
  assert.match(billingUiSource,/function openPartialCreditNote/);
  assert.match(billingUiSource,/function openCreditNoteRefund/);
  assert.match(billingUiSource,/function netInvoiceReceivable/);
  assert.match(billingUiSource,/alreadyPosted/);
  assert.match(billingUiSource,/nextRefundId = Math.max/);
  assert.match(billingUiSource,/data-bill-partial-credit/);
  assert.match(billingUiSource,/data-bill-refund-credit/);
});

test("achats : facture fournisseur comptabilisée selon le mode de stock, la taxe et le taux de change", () => {
  const store = freshStore();
  store.settings.customAccounts = [
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"31",label:"Stock",type:"asset"},
    {code:"601",label:"Achats",type:"expense"},
    {code:"4453",label:"TVA récupérable",type:"asset"},
  ];
  const invoice = {
    id:44,type:"invoice",number:"FAF-2026-0044",date:"2026-11-24",supplierName:"Fournisseur test",total:100,
    accounting:{exchangeRate:2,taxRate:20,taxRecoverable:true,accounts:{supplier:"401",stock:"31",purchases:"601",inputVat:"4453"}},
  };
  const missingMapping = buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:null},"perpetual");
  assert.equal(missingMapping.ok,false,"une imputation explicite est obligatoire");
  const wrongCategory = buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:{...invoice.accounting,accounts:{...invoice.accounting.accounts,stock:"521"}}},"perpetual");
  assert.equal(wrongCategory.ok,false,"un compte bancaire ne peut pas servir de compte de stock");
  const perpetual = buildSupplierInvoiceJournalEntry(store,invoice,"perpetual");
  assert.equal(perpetual.ok,true,perpetual.errors?.join(" "));
  assert.deepEqual(perpetual.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["31",200,0],["4453",40,0],["401",0,240]
  ]);
  const posted = postSupplierInvoiceJournalEntry(store,invoice,"perpetual");
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  assert.equal(store.entries[0].journal,"ACH");
  assert.equal(postSupplierInvoiceJournalEntry(store,invoice,"perpetual").ok,false,"une facture ne peut pas être comptabilisée deux fois");
  const pcgStore = newStore();
  buildAccountCache(pcgStore, allAccounts("pcg"));
  const pcgInvoice = {...invoice,accounting:{...invoice.accounting,accounts:{supplier:"401",stock:"37",purchases:"607",inputVat:"4452"}}};
  assert.equal(buildSupplierInvoiceJournalEntry(pcgStore,pcgInvoice,"perpetual").ok,true,"le compte 4452 du PCG doit être reconnu comme TVA sur acquisitions");
  const cgncStore = newStore();
  buildAccountCache(cgncStore, allAccounts("cgnc"));
  const cgncInvoice = {...invoice,accounting:{...invoice.accounting,accounts:{supplier:"4411",stock:"314",purchases:"611",inputVat:"4456"}}};
  assert.equal(buildSupplierInvoiceJournalEntry(cgncStore,cgncInvoice,"perpetual").ok,true,"les comptes CGNC fournisseurs, stocks et TVA récupérable doivent être reconnus");
  const periodic = buildSupplierInvoiceJournalEntry(store,{...invoice,number:"FAF-2026-0045",accounting:{...invoice.accounting,taxRecoverable:false}},"periodic");
  assert.equal(periodic.ok,true,periodic.errors?.join(" "));
  assert.deepEqual(periodic.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["601",240,0],["401",0,240]
  ]);
  store.settings.closedPeriods=[{startDate:"2026-11-01",endDate:"2026-11-30",status:"closed"}];
  const blocked=postSupplierInvoiceJournalEntry(store,{...invoice,number:"FAF-2026-0046"},"perpetual");
  assert.equal(blocked.ok,false);
  assert.equal(store.entries.length,1,"une période clôturée ne doit laisser aucune écriture partielle");
});
test("achats : validation fournisseur exige les imputations et prépare la comptabilisation avant réception", () => {
  assert.match(purchasesUiSource,/pd-account-supplier/);
  assert.match(purchasesUiSource,/pd-account-stock/);
  assert.match(purchasesUiSource,/pd-account-purchases/);
  assert.match(purchasesUiSource,/pd-account-vat/);
  assert.match(purchasesUiSource,/configureSupplierAccounting/);
  assert.match(purchasesUiSource,/pac-rate/);
  assert.match(purchasesUiSource,/buildSupplierInvoiceJournalEntry/);
  assert.match(purchasesUiSource,/doc\.pendingInvoiceReceipt \|\| doc\.status !== "validating"/);
  assert.match(purchasesUiSource,/!doc\.pendingInvoiceReceipt && doc\.status === "validating"/);
  assert.match(purchasesUiSource,/postSupplierInvoiceJournalEntry/);
  assert.match(purchasesUiSource,/ACHAT FOURNISSEUR/);
  assert.match(purchaseAccountingSource,/accountMatchesPurpose/);
  assert.match(serviceWorkerSource,/mizane-v60/g);
  assert.match(serviceWorkerSource,/"js\/purchase-tax\.js"/);
  assert.match(serviceWorkerSource,/"js\/purchase-accounting\.js"/);
});

test("achats : une même référence de facture fournisseur ne peut pas être saisie deux fois", () => {
  const docs = [
    {id:1,type:"invoice",supplierId:7,reference:"FAC-2026-001",number:"FAF-2026-0001",status:"validated"},
    {id:2,type:"invoice",supplierId:8,reference:"FAC-2026-001",number:"FAF-2026-0002",status:"draft"},
    {id:3,type:"invoice",supplierId:7,reference:"FAC-ANNULEE",status:"cancelled"},
  ];
  assert.equal(findDuplicateSupplierInvoice(docs,7," fac-2026-001 ")?.id,1);
  assert.equal(findDuplicateSupplierInvoice(docs,8,"FAC-2026-001")?.id,2);
  assert.equal(findDuplicateSupplierInvoice(docs,7,"FAC-2026-001",1),null);
  assert.equal(findDuplicateSupplierInvoice(docs,7,"FAC-ANNULEE"),null);
  assert.equal(findDuplicateSupplierInvoice(docs,7,""),null);
});


test("achats : métadonnées obligatoires et valides pour une facture fournisseur", () => {
  assert.deepEqual(validateSupplierInvoiceMetadata({reference:"FAC-2026-001",date:"2026-11-24",currency:"MAD"}),{ok:true,errors:[]});
  assert.equal(validateSupplierInvoiceMetadata({reference:"",date:"2026-11-24",currency:"MAD"}).ok,false);
  assert.equal(validateSupplierInvoiceMetadata({reference:"FAC-2",date:"2026-02-30",currency:"MAD"}).ok,false);
  assert.equal(validateSupplierInvoiceMetadata({reference:"FAC-2",date:"2026-11-24",currency:"M"}).ok,false);
  assert.equal(validateSupplierInvoiceMetadata({reference:"FAC-2",date:"2026-11-24",currency:"eur"}).ok,true);
  assert.match(purchasesUiSource,/validateSupplierInvoiceMetadata/);
  assert.equal(validateSupplierInvoiceMetadata({reference:"",date:"2026-11-24",currency:"MAD"}).errors[0],"La référence de la facture fournisseur est obligatoire.");
});


test("achats : règlement groupé multi-factures, écriture unique, change et idempotence", () => {
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"512",label:"Banque",type:"asset"},
    {code:"571",label:"Caisse",type:"asset"},
    {code:"675",label:"Pertes de change",type:"expense"},
    {code:"778",label:"Gains de change",type:"income"},
  ];
  const invoices=[
    {id:91,type:"invoice",number:"FAF-G-91",supplierId:9,supplierName:"Fournisseur test",currency:"MAD",status:"validated",accountingPostedAt:"2026-11-25T10:00:00Z",total:60,accounting:{exchangeRate:1,taxRate:0,accounts:{supplier:"401"}},payments:[],creditNotes:[]},
    {id:92,type:"invoice",number:"FAF-G-92",supplierId:9,supplierName:"Fournisseur test",currency:"MAD",status:"validated",accountingPostedAt:"2026-11-25T10:00:00Z",total:40,accounting:{exchangeRate:1.1,taxRate:0,accounts:{supplier:"401"}},payments:[],creditNotes:[]},
  ];
  const allocations=[{invoiceId:91,amount:60},{invoiceId:92,amount:40}];
  const payment={date:"2026-11-25",reference:"VIR-GROUPE-001",amount:100,currency:"MAD",method:"bank",exchangeRate:1.2};
  const mapping={treasury:"512",fxLoss:"675",fxGain:"778"};
  const proposal=buildSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,payment,mapping);
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.equal(proposal.entries.length,1);
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["401",60,0],["401",44,0],["675",16,0],["512",0,120],
  ]);
  const posted=postSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,payment,mapping);
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  assert.equal(postSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,payment,mapping).ok,false,"un paiement groupé ne doit pas être comptabilisé deux fois");
  assert.equal(buildSupplierMultiInvoicePaymentJournalEntry(store,invoices,[{invoiceId:91,amount:61},{invoiceId:92,amount:40}],payment,mapping).ok,false,"une affectation ne peut dépasser le solde dû");
  assert.equal(buildSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,{...payment,amount:99},mapping).ok,false,"le montant payé doit correspondre aux affectations");
  assert.equal(buildSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,{...payment,method:"cash"}, {...mapping,treasury:"512"}).ok,false,"un paiement en espèces doit utiliser un compte de caisse");
});

test("stock : sorties manuelles et écarts d’inventaire sont comptabilisés selon les comptes configurés", () => {
  const store=newStore();
  store.settings.customAccounts=[
    {code:"31",label:"Stock",type:"asset"},
    {code:"65",label:"Consommation interne",type:"expense"},
    {code:"658",label:"Pertes de stock",type:"expense"},
    {code:"759",label:"Gains d’inventaire",type:"income"},
    {code:"659",label:"Pertes d’inventaire",type:"expense"},
  ];
  const mapping={inventory:"31",stockConsumption:"65",stockLoss:"658",stockAdjustmentGain:"759",stockAdjustmentLoss:"659"};
  const issue={id:"doc-issue",operation_uid:"uid-issue",document_type:"issue",source_type:"manual_stock",document_date:"2026-11-24",reference:"SORTIE-001"};
  const issueMoves=[{document_id:"doc-issue",quantity_delta:-2,value_delta:-150,movement_date:"2026-11-24"}];
  const consumption=buildStockOperationJournalEntry(store,issue,issueMoves,mapping,"perpetual","internal_consumption");
  assert.equal(consumption.ok,true,consumption.errors?.join(" "));
  assert.deepEqual(consumption.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["65",150,0],["31",0,150]]);
  const loss=buildStockOperationJournalEntry(store,issue,issueMoves,mapping,"perpetual","damage");
  assert.equal(loss.ok,true);
  assert.equal(loss.entries[0].lines[0].account,"658");
  assert.equal(buildStockOperationJournalEntry(store,issue,issueMoves,{...mapping,stockLoss:"31"},"perpetual","damage").ok,false);
  const count={id:"doc-count",operation_uid:"uid-count",document_type:"adjustment",source_type:"inventory_count",document_date:"2026-11-24",reference:"INV-001"};
  const countMoves=[
    {document_id:"doc-count",quantity_delta:-1,value_delta:-50,movement_date:"2026-11-24"},
    {document_id:"doc-count",quantity_delta:2,value_delta:20,movement_date:"2026-11-24"},
  ];
  const variance=buildStockOperationJournalEntry(store,count,countMoves,mapping,"perpetual");
  assert.equal(variance.ok,true,variance.errors?.join(" "));
  assert.deepEqual(variance.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["659",50,0],["31",0,50],["31",20,0],["759",0,20],
  ]);
  assert.equal(buildStockOperationJournalEntry(store,count,countMoves,mapping,"periodic").skipped,true);
  const posted=postStockOperationJournalEntry(store,issue,issueMoves,mapping,"perpetual","internal_consumption");
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  const duplicate=postStockOperationJournalEntry(store,issue,issueMoves,mapping,"perpetual","internal_consumption");
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);
  assert.equal(store.entries.length,1);
});

test("stock : file d’attente comptable synchronisée, motif obligatoire et reprise automatique", () => {
  assert.match(billingSyncSource,/pendingStockAccountingOperations/);
  assert.match(billingSyncSource,/stockOperations\.set/);
  assert.match(stockUiSource,/sm-reason/);
  assert.match(stockUiSource,/Sélectionnez le motif de la sortie/);
  assert.match(stockUiSource,/queueStockAccountingOperation/);
  assert.match(stockUiSource,/retryPendingStockAccountingOperations/);
  assert.match(billingUiSource,/stockAdjustmentGain/);
  assert.match(billingUiSource,/stockAdjustmentLoss/);
  assert.match(billingUiSource,/retryPendingStockAccountingOperations/);
});


test("stock intermittent : valorisation locale historique, transferts neutres et contrôles de positions", () => {
  const stock={
    settings:{accountingMode:"periodic"},
    movements:[
      {kind:"receipt",productId:1,warehouseId:1,quantity:10,quantityDelta:10,totalCost:100,date:"2026-01-01"},
      {kind:"issue",productId:1,warehouseId:1,quantity:2,quantityDelta:-2,totalCost:20,date:"2026-02-05"},
      {kind:"transfer",productId:1,warehouseId:1,destinationWarehouseId:2,quantity:1,quantityDelta:-1,totalCost:10,date:"2026-02-10"},
    ],
    countSessions:[],
  };
  const valuation=calculateLocalStockPeriodValuation(stock,"2026-02-01","2026-02-28");
  assert.equal(valuation.ok,true);
  assert.equal(valuation.accounting_mode,"periodic");
  assert.equal(valuation.opening_value,100);
  assert.equal(valuation.closing_value,80);
  assert.equal(valuation.opening_negative_positions,0);
  assert.equal(valuation.closing_negative_positions,0);
  assert.equal(valuation.movement_count,2);
  const blocked=calculateLocalStockPeriodValuation({...stock,countSessions:[{status:"counting"}]},"2026-02-01","2026-02-28");
  assert.equal(blocked.active_count_sessions,1);
  const transientNegative=calculateLocalStockPeriodValuation({
    settings:{accountingMode:"periodic"},
    movements:[
      {kind:"receipt",productId:2,warehouseId:1,quantity:5,quantityDelta:5,totalCost:50,date:"2026-01-01"},
      {kind:"issue",productId:2,warehouseId:1,quantity:7,quantityDelta:-7,totalCost:70,date:"2026-02-05"},
      {kind:"receipt",productId:2,warehouseId:1,quantity:5,quantityDelta:5,totalCost:50,date:"2026-02-10"},
    ],
    countSessions:[],
  },"2026-02-01","2026-02-28");
  assert.equal(transientNegative.closing_negative_positions,0);
  assert.equal(transientNegative.negative_movements,1);
  const transientBlocked=buildPeriodicStockClosingJournalEntry(newStore(),{...transientNegative,period_start:"2026-02-01",period_end:"2026-02-28"},{});
  assert.equal(transientBlocked.ok,false);
});

test("stock intermittent : comptes automatiques par plan comptable", () => {
  const syscohada=suggestStockAccounts("syscohada",allAccounts("syscohada"));
  assert.deepEqual([syscohada.inventory,syscohada.stockVariation,syscohada.stockVariationType],["31","603","expense"]);
  const pcg=suggestStockAccounts("pcg",allAccounts("pcg"));
  assert.deepEqual([pcg.inventory,pcg.stockVariation,pcg.stockVariationType],["37","713","income"]);
  const nct=suggestStockAccounts("nct",allAccounts("nct"));
  assert.deepEqual([nct.inventory,nct.stockVariation,nct.stockVariationType],["34","713","income"]);
  const cgnc=suggestStockAccounts("cgnc",allAccounts("cgnc"));
  assert.deepEqual([cgnc.inventory,cgnc.stockVariation,cgnc.stockVariationType],["314","713","income"]);
});

test("stock intermittent : variation de clôture, sens débit/crédit, idempotence et garde-fous", () => {
  const store=newStore();
  store.settings.plan="syscohada";
  buildAccountCache(store,allAccounts("syscohada"));
  const mapping=suggestStockAccounts("syscohada",allAccounts("syscohada"));
  const positive={ok:true,accounting_mode:"periodic",period_start:"2026-01-01",period_end:"2026-12-31",opening_value:1000,closing_value:1350,opening_negative_positions:0,closing_negative_positions:0,active_count_sessions:0};
  const proposal=buildPeriodicStockClosingJournalEntry(store,positive,mapping);
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["31",350,0],["603",0,350]]);
  const posted=postPeriodicStockClosingJournalEntry(store,positive,mapping);
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  const duplicate=postPeriodicStockClosingJournalEntry(store,positive,mapping);
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.duplicate,true);
  assert.equal(store.entries.length,1);
  const decreasing={...positive,period_start:"2025-01-01",period_end:"2025-12-31",opening_value:1000,closing_value:700};
  const down=buildPeriodicStockClosingJournalEntry(store,decreasing,mapping);
  assert.equal(down.ok,true);
  assert.deepEqual(down.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["603",300,0],["31",0,300]]);
  const unchanged=buildPeriodicStockClosingJournalEntry(store,{...positive,period_start:"2024-01-01",period_end:"2024-12-31",closing_value:1000},mapping);
  assert.equal(unchanged.skipped,true);
  assert.equal(buildPeriodicStockClosingJournalEntry(store,{...positive,opening_negative_positions:1},mapping).ok,false);
  assert.equal(buildPeriodicStockClosingJournalEntry(store,{...positive,active_count_sessions:1},mapping).ok,false);
  assert.equal(buildPeriodicStockClosingJournalEntry(store,{...positive,accounting_mode:"perpetual"},mapping).skipped,true);
  assert.equal(buildPeriodicStockClosingJournalEntry(store,positive,{...mapping,inventory:"603"}).ok,false);
  assert.equal(buildPeriodicStockClosingJournalEntry(store,positive,{...mapping,stockVariation:"31"}).ok,false);
});

test("stock intermittent : valorisation serveur exhaustive et intégration dans la clôture d'exercice", () => {
  assert.match(stockPeriodicValuationMigration,/stock_period_valuation/);
  assert.match(stockPeriodicValuationMigration,/private\.stock_assert_writer/);
  assert.match(stockPeriodicValuationMigration,/sum\(m\.value_delta\)/);
  assert.match(stockPeriodicValuationMigration,/movement_date < p_start_date/);
  assert.match(stockPeriodicValuationMigration,/movement_date <= p_end_date/);
  assert.match(stockPeriodicValuationMigration,/stock_count_sessions/);
  assert.match(stockPeriodicValuationMigration,/grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(stockPeriodicValuationMigration,/limit\s+500/i);
  assert.match(stockPeriodicValuationHardeningMigration,/stock_movements_periodic_valuation_idx/);
  assert.match(stockPeriodicValuationHardeningMigration,/sum\(m\.quantity_delta\) over/);
  assert.match(stockPeriodicValuationHardeningMigration,/'negative_movements'/);
  assert.match(stockPeriodicValuationSecurityMigration,/private\.stock_period_valuation_impl/);
  assert.match(stockPeriodicValuationSecurityMigration,/security invoker/i);
  assert.match(stockPeriodicValuationSecurityMigration,/grant execute[\s\S]*to authenticated/i);
  assert.match(stockCloudSource,/stock_period_valuation/);
  assert.match(opsUiSource,/postPeriodicStockAdjustment/);
  assert.match(opsUiSource,/readCloudStockPeriodValuation/);
  assert.match(opsUiSource,/closingProposal\(store,s\.exerciceStart,s\.exerciceEnd,newStart\)/);
  assert.match(billingUiSource,/suggestStockAccounts/);
  assert.match(billingUiSource,/stockVariation/);
  assert.match(serviceWorkerSource,/mizane-v60/);
});


test("achats : règlements fournisseurs partiels, change, plafonnement et idempotence", () => {
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"512",label:"Banque",type:"asset"},
    {code:"571",label:"Caisse",type:"asset"},
    {code:"675",label:"Pertes de change",type:"expense"},
    {code:"778",label:"Gains de change",type:"income"},
  ];
  const invoice={id:70,type:"invoice",number:"FAF-2026-0070",status:"validated",accountingPostedAt:"2026-11-25T10:00:00Z",date:"2026-11-20",total:100,supplierName:"Fournisseur test",accounting:{exchangeRate:2,taxRate:20,accounts:{supplier:"401"}},payments:[]};
  const partial={id:1,date:"2026-11-25",amount:40,method:"bank",exchangeRate:2,treasury:"512"};
  const proposal=buildSupplierPaymentJournalEntry(store,invoice,partial,partial);
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.equal(proposal.summary.remaining,80);
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",80,0],["512",0,80]]);
  const posted=postSupplierPaymentJournalEntry(store,invoice,partial,partial);
  assert.equal(posted.ok,true,posted.errors?.join(" "));
  assert.equal(store.entries.length,1);
  assert.equal(buildSupplierPaymentJournalEntry(store,invoice,partial,partial).ok,false,"un règlement déjà comptabilisé ne doit pas être dupliqué");
  assert.equal(buildSupplierPaymentJournalEntry(store,{...invoice,payments:[{amount:40}]},{...partial,id:2,amount:81},{...partial}).ok,false,"le cumul des règlements ne doit pas dépasser la dette TTC");
  const fxLoss=buildSupplierPaymentJournalEntry(store,invoice,{...partial,id:2,amount:10,exchangeRate:2.1,treasury:"512",fxLoss:"675"},{...partial,fxLoss:"675"});
  assert.equal(fxLoss.ok,true,fxLoss.errors?.join(" "));
  assert.deepEqual(fxLoss.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",20,0],["675",1,0],["512",0,21]]);
  const fxGain=buildSupplierPaymentJournalEntry(store,invoice,{...partial,id:3,amount:10,exchangeRate:1.9,treasury:"512",fxGain:"778"},{...partial,fxGain:"778"});
  assert.equal(fxGain.ok,true,fxGain.errors?.join(" "));
  assert.deepEqual(fxGain.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",20,0],["778",0,1],["512",0,19]]);
  assert.equal(buildSupplierPaymentJournalEntry(store,invoice,{...partial,id:4,date:"2026-02-30"},{...partial}).ok,false,"une date impossible doit être refusée");
  assert.equal(buildSupplierPaymentJournalEntry(store,invoice,{...partial,id:5,treasury:"411"},{...partial,treasury:"411"}).ok,false,"un compte client de classe 4 ne peut pas être utilisé comme trésorerie");
  assert.equal(buildSupplierPaymentJournalEntry(store,invoice,{...partial,id:6,method:"cash",treasury:"512"},{...partial,method:"cash",treasury:"512"}).ok,false,"un règlement en espèces doit utiliser un compte de caisse");
  assert.equal(buildSupplierPaymentJournalEntry(store,{...invoice,accountingPostedAt:null},partial,partial).ok,false,"une facture non comptabilisée ne peut pas être réglée");
});

test("achats : avoirs fournisseurs équilibrés et rapprochement multi-factures avec tolérance", () => {
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"31",label:"Stock marchandises",type:"asset"},
    {code:"6",label:"Achats",type:"expense"},
    {code:"3455",label:"TVA récupérable",type:"asset"},
  ];
  const invoice={id:81,type:"invoice",number:"FAF-2026-0081",supplierId:9,supplierName:"Fournisseur test",currency:"MAD",status:"validated",accountingPostedAt:"2026-11-25T10:00:00Z",total:100,accounting:{exchangeRate:1,taxRate:20,taxRecoverable:true,accounts:{supplier:"401",stock:"31",purchases:"6",inputVat:"3455"}},payments:[],creditNotes:[]};
  const credit={id:1,number:"AVF-2026-0001",date:"2026-11-25",total:30};
  const proposal=buildSupplierCreditNoteJournalEntry(store,invoice,credit,"perpetual");
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",36,0],["31",0,30],["3455",0,6]]);
  assert.equal(postSupplierCreditNoteJournalEntry(store,invoice,credit,"perpetual").ok,true);
  assert.equal(buildSupplierCreditNoteJournalEntry(store,invoice,credit,"perpetual").ok,false,"un avoir déjà comptabilisé ne doit pas être dupliqué");
  assert.equal(buildSupplierCreditNoteJournalEntry(store,{...invoice,creditNotes:[{payableAmount:110}]},{...credit,id:2},"perpetual").ok,false,"un avoir ne peut pas dépasser le solde dû");
  const invoices=[
    {...invoice,id:82,number:"FAF-82",total:60,creditNotes:[]},
    {...invoice,id:83,number:"FAF-83",total:40,creditNotes:[]},
  ];
  const match=planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:60},{invoiceId:83,amount:40}],{amount:100,currency:"MAD"},{tolerance:0});
  assert.equal(match.ok,true,match.errors?.join(" "));
  assert.equal(match.total,100);
  const tolerated=planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:60},{invoiceId:83,amount:39.75}],{amount:100,currency:"MAD"},{tolerance:0.25});
  assert.equal(tolerated.ok,true,tolerated.errors?.join(" "));
  assert.equal(tolerated.status,"matched_with_tolerance");
  assert.equal(planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:60},{invoiceId:83,amount:39}],{amount:100,currency:"MAD"},{tolerance:0.25}).ok,false);
  assert.equal(planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:60},{invoiceId:82,amount:40}],{amount:100,currency:"MAD"},{tolerance:0}).ok,false);
  assert.equal(planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:60},{invoiceId:83,amount:40}],{amount:100,currency:"EUR"},{tolerance:0}).ok,false);
  assert.equal(planSupplierMultiInvoiceReconciliation(invoices,[{invoiceId:82,amount:73},{invoiceId:83,amount:27}],{amount:100,currency:"MAD"},{tolerance:0}).ok,false);
});

test("achats : ventilation comptable des factures fournisseurs mixtes", () => {
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"31",label:"Stock marchandises",type:"asset"},
    {code:"607",label:"Achats de marchandises",type:"expense"},
    {code:"613",label:"Services extérieurs",type:"expense"},
    {code:"218",label:"Matériel et immobilisations corporelles",type:"asset"},
    {code:"3455",label:"TVA récupérable",type:"asset"},
  ];
  const invoice={
    id:901,type:"invoice",number:"FAF-MIX-901",date:"2026-11-25",status:"validated",
    supplierName:"Fournisseur mixte",total:100,
    lines:[
      {lineType:"goods",quantity:2,unitCost:30},
      {lineType:"service",description:"Installation",quantity:1,unitCost:20},
      {lineType:"fixed_asset",description:"Équipement",quantity:1,unitCost:20},
    ],
    accounting:{exchangeRate:1,taxRate:10,taxRecoverable:true,accounts:{supplier:"401",stock:"31",purchases:"607",services:"613",fixedAssets:"218",inputVat:"3455"}},
  };
  const perpetual=buildSupplierInvoiceJournalEntry(store,invoice,"perpetual");
  assert.equal(perpetual.ok,true,perpetual.errors?.join(" "));
  assert.deepEqual(perpetual.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[
    ["31",60,0],["613",20,0],["218",20,0],["3455",10,0],["401",0,110],
  ]);
  const periodic=buildSupplierInvoiceJournalEntry(store,invoice,"periodic");
  assert.equal(periodic.ok,true,periodic.errors?.join(" "));
  assert.equal(periodic.entries[0].lines[0].account,"607");
  assert.equal(periodic.entries[0].lines.at(-1).credit,110);
  const nonRecoverable=buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:{...invoice.accounting,taxRecoverable:false}},"perpetual");
  assert.equal(nonRecoverable.ok,true,nonRecoverable.errors?.join(" "));
  assert.equal(nonRecoverable.entries[0].lines.reduce((sum,line)=>sum+line.debit,0),110);
  assert.equal(buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:{...invoice.accounting,accounts:{...invoice.accounting.accounts,services:""}}},"perpetual").ok,false,"une ligne de service sans compte dédié doit bloquer la validation");
  assert.equal(buildSupplierInvoiceJournalEntry(store,{...invoice,total:99},"perpetual").ok,false,"le total doit correspondre à la somme des lignes");
});

test("achats : ventilation comptable des factures mixtes marchandises, services et immobilisations", () => {
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"31",label:"Stock marchandises",type:"asset"},
    {code:"607",label:"Achats de marchandises",type:"expense"},
    {code:"613",label:"Prestations de services",type:"expense"},
    {code:"218",label:"Matériel et immobilisations corporelles",type:"asset"},
    {code:"3455",label:"TVA récupérable",type:"asset"},
  ];
  const invoice={id:901,type:"invoice",number:"FAF-MIX-901",date:"2026-11-25",status:"validated",supplierName:"Fournisseur mixte",total:100,
    lines:[{lineType:"goods",quantity:2,unitCost:30},{lineType:"service",description:"Installation",quantity:1,unitCost:20},{lineType:"fixed_asset",description:"Équipement",quantity:1,unitCost:20}],
    accounting:{exchangeRate:1,taxRate:10,taxRecoverable:true,accounts:{supplier:"401",stock:"31",purchases:"607",services:"613",fixedAssets:"218",inputVat:"3455"}}};
  const perpetual=buildSupplierInvoiceJournalEntry(store,invoice,"perpetual");
  assert.equal(perpetual.ok,true,perpetual.errors?.join(" "));
  assert.deepEqual(perpetual.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["31",60,0],["613",20,0],["218",20,0],["3455",10,0],["401",0,110]]);
  const periodic=buildSupplierInvoiceJournalEntry(store,invoice,"periodic");
  assert.equal(periodic.ok,true,periodic.errors?.join(" "));
  assert.equal(periodic.entries[0].lines[0].account,"607");
  const nonRecoverable=buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:{...invoice.accounting,taxRecoverable:false}},"perpetual");
  assert.equal(nonRecoverable.ok,true,nonRecoverable.errors?.join(" "));
  assert.equal(nonRecoverable.entries[0].lines.reduce((sum,line)=>sum+line.debit,0),110);
  assert.equal(buildSupplierInvoiceJournalEntry(store,{...invoice,accounting:{...invoice.accounting,accounts:{...invoice.accounting.accounts,services:""}}},"perpetual").ok,false);
  assert.equal(buildSupplierInvoiceJournalEntry(store,{...invoice,total:99},"perpetual").ok,false);
});
test("achats : TVA multi-taux calculée par ligne et comptabilisée sans écart", () => {
  const store=freshStore();
  store.settings.customAccounts=[{code:"401",label:"Fournisseurs",type:"liability"},{code:"31",label:"Stock marchandises",type:"asset"},{code:"4455",label:"TVA récupérable",type:"asset"},{code:"613",label:"Services extérieurs",type:"expense"}];
  const invoice={id:990,type:"invoice",number:"FAF-TVA-990",date:"2026-11-25",supplierName:"Fournisseur multi-taux",total:150,
    lines:[{lineType:"goods",quantity:1,unitCost:100,taxRate:20},{lineType:"service",quantity:1,unitCost:50,taxRate:10}],
    accounting:{exchangeRate:1,taxRate:0,taxRecoverable:true,accounts:{supplier:"401",stock:"31",inputVat:"4455",services:"613"}}};
  const tax=supplierInvoiceTaxBreakdown(invoice);
  assert.equal(tax.ok,true,tax.errors.join(" "));
  assert.equal(tax.totalHT,150); assert.equal(tax.totalTax,25); assert.equal(tax.payable,175); assert.equal(tax.uniformTaxRate,null);
  const proposal=buildSupplierInvoiceJournalEntry(store,invoice,"perpetual");
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["31",100,0],["613",50,0],["4455",25,0],["401",0,175]]);
  assert.equal(supplierInvoiceTaxBreakdown({...invoice,lines:[{quantity:1,unitCost:100,taxRate:120}]}).ok,false);
});
test("achats : avoir détaillé sur facture mixte et multi-taux, TVA et ventilation par nature",()=>{
  const store=freshStore();
  store.settings.customAccounts=[
    {code:"401",label:"Fournisseurs",type:"liability"},
    {code:"31",label:"Stock marchandises",type:"asset"},
    {code:"613",label:"Services extérieurs",type:"expense"},
    {code:"3455",label:"TVA récupérable",type:"asset"},
  ];
  const invoice={id:991,type:"invoice",number:"FAF-CN-991",supplierId:9,supplierName:"Fournisseur mixte",currency:"MAD",status:"validated",accountingPostedAt:"2026-11-25T10:00:00Z",total:150,
    lines:[{lineType:"goods",quantity:1,unitCost:100,taxRate:20},{lineType:"service",description:"Installation",quantity:1,unitCost:50,taxRate:10}],
    accounting:{exchangeRate:1,taxRate:0,taxRecoverable:true,accounts:{supplier:"401",stock:"31",services:"613",inputVat:"3455"}},payments:[],creditNotes:[]};
  const credit={id:2,number:"AVF-MIX-991",date:"2026-11-25",total:50,lines:[{lineIndex:0,amount:40},{lineIndex:1,amount:10}]};
  const proposal=buildSupplierCreditNoteJournalEntry(store,invoice,credit,"perpetual");
  assert.equal(proposal.ok,true,proposal.errors?.join(" "));
  assert.equal(proposal.summary.baseTax,9);
  assert.equal(proposal.summary.payableAmount,59);
  assert.deepEqual(proposal.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",59,0],["31",0,40],["613",0,10],["3455",0,9]]);
  assert.equal(buildSupplierCreditNoteJournalEntry(store,invoice,{...credit,id:3,number:"AVF-OVER",lines:[{lineIndex:0,amount:101}],total:101},"perpetual").ok,false);
  const nonRecoverable=buildSupplierCreditNoteJournalEntry(store,{...invoice,accounting:{...invoice.accounting,taxRecoverable:false}},{...credit,id:4,number:"AVF-NR"},"perpetual");
  assert.equal(nonRecoverable.ok,true,nonRecoverable.errors?.join(" "));
  assert.deepEqual(nonRecoverable.entries[0].lines.map(line=>[line.account,line.debit,line.credit]),[["401",59,0],["31",0,48],["613",0,11]]);
});
test("achats : suggestions automatiques d’imputation valides sur les quatre plans comptables", () => {
  for (const planId of ["cgnc", "syscohada", "pcg", "nct"]) {
    const store = newStore();
    store.settings.plan = planId;
    buildAccountCache(store, allAccounts(planId));
    const suggestion = suggestSupplierInvoiceAccounts(store, "perpetual");
    assert.equal(suggestion.complete, true, planId + " : comptes manquants " + suggestion.missing.join(", "));
    assert.equal(suggestion.planId, planId);
    for (const key of ["supplier", "stock", "purchases", "inputVat", "services", "fixedAssets"]) assert.ok(suggestion.accounts[key], planId + " : compte " + key + " proposé");
    const invoice = {
      id: 910, type: "invoice", number: "AUTO-" + planId.toUpperCase(), date: "2026-11-25", total: 160, supplierName: "Fournisseur test",
      lines: [
        { lineType: "goods", amount: 100, taxRate: 20 },
        { lineType: "service", amount: 40, taxRate: 10 },
        { lineType: "fixed_asset", amount: 20, taxRate: 20 },
      ],
      accounting: { exchangeRate: 1, taxRate: 0, taxRecoverable: true, accounts: suggestion.accounts },
    };
    for (const mode of ["perpetual", "periodic"]) {
      const proposal = buildSupplierInvoiceJournalEntry(store, invoice, mode);
      assert.equal(proposal.ok, true, planId + "/" + mode + " : " + proposal.errors.join(" "));
      const debit = proposal.entries[0].lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = proposal.entries[0].lines.reduce((sum, line) => sum + line.credit, 0);
      assert.equal(debit, credit, planId + "/" + mode + " : écriture équilibrée");
      assert.equal(proposal.summary.baseHT, 160);
      assert.equal(proposal.summary.baseTax, 28);
    }
  }
});

test("achats : une imputation personnalisée valide est prioritaire sur la suggestion du plan", () => {
  const store = freshStore();
  store.settings.customAccounts = [{ code: "401X", label: "Fournisseurs personnalisés", type: "liability" }];
  const suggestion = suggestSupplierInvoiceAccounts(store);
  assert.equal(suggestion.accounts.supplier, "401X");
  assert.equal(suggestion.labels.supplier, "Fournisseurs personnalisés");
});

test("achats : rapport de contrôle bloque les doublons, écarts de prix et dépassements de commande/réception", () => {
  const order = { id: 10, type: "order", supplierId: 7, lines: [
    { productId: "P1", warehouseId: "W1", quantity: 5, factor: 1, baseQuantity: 5, unitCost: 10, baseUnitCost: 10, receivedBase: 4 },
  ] };
  const invoice = { id: 11, type: "invoice", orderId: 10, supplierId: 7, reference: "FAC-11", total: 20, status: "draft",
    lines: [{ lineType: "goods", productId: "P1", warehouseId: "W1", quantity: 2, factor: 1, baseQuantity: 2, unitCost: 10, baseUnitCost: 10 }] };
  const valid = buildSupplierInvoiceControlReport({ documents: [], invoice, order, requireReceived: true });
  assert.equal(valid.ok, true, valid.errors.map(item => item.message).join(" "));
  assert.equal(valid.checks.some(item => item.code === "order_match"), true);

  const duplicate = buildSupplierInvoiceControlReport({
    documents: [{ id: 12, type: "invoice", supplierId: 7, reference: " fac-11 ", number: "FAF-12", status: "validated" }],
    invoice, order, requireReceived: false,
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.errors.some(item => item.code === "duplicate_invoice"), true);

  const priceMismatch = buildSupplierInvoiceControlReport({ documents: [], invoice: { ...invoice, lines: [{ ...invoice.lines[0], unitCost: 11, baseUnitCost: 11 }] }, order });
  assert.equal(priceMismatch.errors.some(item => item.code === "price_mismatch"), true);

  const previousInvoice = { id: 9, type: "invoice", orderId: 10, status: "validated", lines: [{ ...invoice.lines[0], quantity: 4, baseQuantity: 4 }] };
  const orderedExceeded = buildSupplierInvoiceControlReport({ documents: [previousInvoice], invoice, order });
  assert.equal(orderedExceeded.errors.some(item => item.code === "ordered_quantity_exceeded"), true);

  const receivedExceeded = buildSupplierInvoiceControlReport({ documents: [], invoice: { ...invoice, lines: [{ ...invoice.lines[0], quantity: 5, baseQuantity: 5 }], total: 50 }, order, requireReceived: true });
  assert.equal(receivedExceeded.errors.some(item => item.code === "received_quantity_exceeded"), true);

  const wrongTotal = buildSupplierInvoiceControlReport({ documents: [], invoice: { ...invoice, total: 19 }, order });
  assert.equal(wrongTotal.errors.some(item => item.code === "invoice_total_mismatch"), true);
});

test("achats : facture sans commande signalée sans blocage et rapport sans mutation", () => {
  const invoice = { id: 20, type: "invoice", supplierId: 2, reference: "FAC-20", total: 30, lines: [{ lineType: "service", description: "Conseil", quantity: 1, unitCost: 30 }] };
  const before = structuredClone(invoice);
  const report = buildSupplierInvoiceControlReport({ documents: [], invoice });
  assert.equal(report.ok, true);
  assert.equal(report.warnings.some(item => item.code === "unlinked_order"), true);
  assert.deepEqual(invoice, before, "le contrôle ne doit jamais modifier la facture");
});


test("échéances fournisseurs : calcul des délais, ancienneté et tranches de retard", () => {
  assert.equal(addSupplierPaymentTerms("2026-11-25", 30), "2026-12-25");
  assert.equal(addSupplierPaymentTerms("2026-11-25", 0), "2026-11-25");
  assert.equal(addSupplierPaymentTerms("date-invalide", 30), "");
  assert.equal(addSupplierPaymentTerms("2026-02-30", 30), "");
  assert.match(purchasesUiSource,/addSupplierPaymentTerms\(dueDate,0\)/);
  assert.match(purchasesUiSource,/addSupplierPaymentTerms\(value,0\)/);
  assert.equal(addSupplierPaymentTerms("2026-11-25", -1), "");
  assert.equal(supplierPayableAge({ dueDate: "2026-11-20" }, "2026-11-25"), 5);
  assert.equal(classifySupplierPayable({ dueDate: "2026-11-25", balance: 50 }, "2026-11-25").bucket, "due_today");
  assert.equal(classifySupplierPayable({ dueDate: "2026-10-25", balance: 50 }, "2026-11-25").bucket, "overdue_31_60");
  assert.equal(classifySupplierPayable({ dueDate: "2026-12-01", balance: 50 }, "2026-11-25").bucket, "upcoming");
  assert.equal(classifySupplierPayable({ dueDate: "2026-11-25", balance: 0 }, "2026-11-25").bucket, "settled");
});

test("échéances fournisseurs : échéancier et prévision de trésorerie par devise", () => {
  const invoices = [
    { id: 1, type: "invoice", status: "validated", accountingPostedAt: "x", dueDate: "2026-11-20", balance: 100, currency: "MAD", number: "F1", supplierName: "A" },
    { id: 2, type: "invoice", status: "validated", accountingPostedAt: "x", dueDate: "2026-12-05", balance: 250, currency: "EUR", number: "F2", supplierName: "B" },
    { id: 3, type: "invoice", status: "validated", accountingPostedAt: "x", balance: 75, currency: "MAD", number: "F3" },
    { id: 4, type: "invoice", status: "draft", dueDate: "2026-11-25", balance: 999, currency: "MAD" },
    { id: 5, type: "invoice", status: "validated", accountingPostedAt: "x", dueDate: "2026-11-25", balance: 0, currency: "MAD" },
  ];
  const schedule = buildSupplierPayablesSchedule(invoices, "2026-11-25");
  assert.equal(schedule.totals.invoices, 3);
  assert.equal(schedule.totals.overdue, 1);
  assert.equal(schedule.totals.upcoming, 1);
  assert.equal(schedule.buckets.undated.amountByCurrency.MAD, 75);
  const forecast = supplierCashOutflowForecast(invoices, "2026-11-25", 30);
  assert.equal(forecast.ok, true);
  assert.deepEqual(forecast.amountByCurrency, { EUR: 250 });
  assert.equal(supplierCashOutflowForecast(invoices, "2026-11-25", 366).ok, false);
});

test("marges commerciales : coût réel des sorties, conversion en devise comptable et marge par article", () => {
  const report = buildCommercialMarginReport({
    startDate: "2026-11-01", endDate: "2026-11-30", baseCurrency: "MAD",
    invoices: [{
      id: 10, type: "invoice", status: "issued", date: "2026-11-10",
      baseCurrency: "MAD", currency: "EUR", exchangeRate: 10,
      stockDocuments: [{ documentId: "stock-1" }],
      lines: [
        { stockProductId: "p1", description: "Produit A", quantity: 2, unitPrice: 15 },
        { stockProductId: "p1", description: "Produit A", quantity: 1, unitPrice: 15 },
      ],
    }],
    creditNotes: [],
    products: [{ id: "p1", name: "Produit A", sku: "A-01" }],
    movements: [
      { document_id: "stock-1", product_id: "p1", quantity_delta: -3, value_delta: -180 },
      { document_id: "other", product_id: "p1", quantity_delta: -1, value_delta: -50 },
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].units, 3);
  assert.equal(report.rows[0].revenue, 450);
  assert.equal(report.rows[0].cost, 180);
  assert.equal(report.rows[0].margin, 270);
  assert.equal(report.rows[0].marginRate, 60);
  assert.equal(report.totals.invoices, 1);
  assert.equal(report.rows[0].sku, "A-01");
  assert.equal(report.rows[0].missingCostLines, 0);
  assert.equal(report.totals.byCurrency.MAD.margin, 270);
});

test("marges commerciales : absence de coût signalée et devises non fusionnées", () => {
  const report = buildCommercialMarginReport({
    startDate: "2026-11-01", endDate: "2026-11-30",
    invoices: [
      { id: 1, type: "invoice", status: "issued", date: "2026-11-02", baseCurrency: "MAD", exchangeRate: 1, lines: [{ stockProductId: "p1", quantity: 1, unitPrice: 100 }] },
      { id: 2, type: "invoice", status: "issued", date: "2026-11-03", baseCurrency: "EUR", exchangeRate: 1, lines: [{ stockProductId: "p2", quantity: 1, unitPrice: 50 }] },
    ],
    products: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }],
    movements: [],
  });
  assert.equal(report.rows.length, 2);
  assert.equal(report.totals.missingCostLines, 2);
  assert.equal(report.rows.every(row => row.marginRate === null), true);
  assert.deepEqual(report.baseCurrencies.sort(), ["EUR", "MAD"]);
  assert.deepEqual(Object.keys(report.totals.byCurrency).sort(), ["EUR", "MAD"]);
  assert.equal(buildCommercialMarginReport({ startDate: "2026-02-30", endDate: "2026-03-01" }).ok, false);
});

test("performances commerciales : tendances mensuelles et classements par devise", () => {
  const report = buildCommercialPerformanceReport({
    startDate: "2026-10-01", endDate: "2026-11-30",
    invoices: [
      { id: "oct", type: "invoice", status: "issued", date: "2026-10-10", baseCurrency: "MAD", exchangeRate: 1, stockDocuments: [{ documentId: "oct-stock" }], lines: [{ stockProductId: "p1", quantity: 2, unitPrice: 100 }] },
      { id: "nov", type: "invoice", status: "issued", date: "2026-11-10", baseCurrency: "MAD", exchangeRate: 1, stockDocuments: [{ documentId: "nov-stock" }], lines: [{ stockProductId: "p1", quantity: 3, unitPrice: 100 }, { stockProductId: "p2", quantity: 1, unitPrice: 200 }] },
      { id: "eur", type: "invoice", status: "issued", date: "2026-11-12", baseCurrency: "EUR", exchangeRate: 1, stockDocuments: [{ documentId: "eur-stock" }], lines: [{ stockProductId: "p2", quantity: 1, unitPrice: 50 }] },
    ],
    creditNotes: [
      { id: "cn", type: "credit_note", sourceInvoiceId: "oct", date: "2026-11-05", lines: [{ stockProductId: "p1", quantity: 1, unitPrice: 100 }] },
    ],
    movements: [
      { document_id: "oct-stock", product_id: "p1", quantity_delta: -2, value_delta: -100 },
      { document_id: "nov-stock", product_id: "p1", quantity_delta: -3, value_delta: -150 },
      { document_id: "nov-stock", product_id: "p2", quantity_delta: -1, value_delta: -80 },
      { document_id: "eur-stock", product_id: "p2", quantity_delta: -1, value_delta: -20 },
    ],
    products: [{ id: "p1", name: "Produit A" }, { id: "p2", name: "Produit B" }],
  });
  assert.equal(report.ok, true);
  assert.equal(report.monthly.length, 3);
  assert.equal(report.monthly.find(row => row.month === "2026-10").revenue, 100);
  assert.equal(report.monthly.find(row => row.month === "2026-11" && row.currency === "MAD").revenue, 500);
  assert.equal(report.monthly.find(row => row.month === "2026-11" && row.currency === "EUR").revenue, 50);
  assert.equal(report.rankings.MAD.byMargin[0].productId, "p1");
  assert.equal(report.rankings.EUR.byMargin[0].productId, "p2");
  assert.equal(report.totalsByCurrency.MAD.margin, 270);
  assert.equal(report.totalsByCurrency.EUR.margin, 30);
});

test("performances commerciales : refuse une période invalide", () => {
  const report = buildCommercialPerformanceReport({ startDate: "2026-02-30", endDate: "2026-03-01" });
  assert.equal(report.ok, false);
  assert.equal(report.monthly.length, 0);
});

test("tableau de bord stratégique : agrège les ventes, achats et retards sans mélanger les devises", () => {
  const snapshot = buildStrategicDashboardSnapshot({
    settings: { currency: "MAD" },
    billing: {
      documents: [
        { id: 1, type: "invoice", status: "validated", currency: "MAD", date: "2026-11-01", dueDate: "2026-11-10", totals: { ttc: 120 }, payments: [{ amount: 20 }], stockDocuments: [{ documentId: "sale-1" }], lines: [{ stockProductId: 1, quantity: 1, unitPrice: 100 }] },
        { id: 2, type: "invoice", status: "validated", currency: "EUR", date: "2026-11-02", dueDate: "2026-12-02", totals: { ttc: 50 } },
      ],
      purchases: { documents: [{ id: 3, type: "invoice", status: "validated", currency: "MAD", totals: { ttc: 75 } }] },
    },
    stock: { products: [{ id: 1, name: "Article", active: true, type: "goods", minimumStock: 5, unit: "unité" }], warehouses: [{ id: "main" }], movements: [{ productId: 1, warehouseId: "main", quantityDelta: 2 }, { document_id: "sale-1", product_id: 1, quantity_delta: -1, value_delta: -60 }] },
  }, "2026-11-25");
  assert.equal(snapshot.sales.invoices, 2);
  assert.equal(snapshot.sales.amountByCurrency.MAD, 120);
  assert.equal(snapshot.sales.amountByCurrency.EUR, 50);
  assert.equal(snapshot.purchases.amountByCurrency.MAD, 75);
  assert.equal(snapshot.receivables.overdueCount, 1);
  assert.equal(snapshot.receivables.overdueByCurrency.MAD, 100);
  assert.equal(snapshot.inventory.products, 1);
  assert.equal(snapshot.inventory.lowStock[0].quantity, 2);
  assert.equal(snapshot.profitability.MAD.margin, 40);
});

test("prévisions financières : projections cumulées et ventilation stricte par devise", () => {
  const report = buildFinancialForecast({
    baseCurrency: "MAD", openingCash: 1000, asOf: "2026-11-25",
    receivables: [{ id: "f1", dueDate: "2026-12-10", currency: "EUR", originalAmount: 100, baseAmount: 1100, customer: "Client A" }, { id: "f2", dueDate: "2026-11-20", currency: "MAD", originalAmount: 50, baseAmount: 50 }],
    payables: [{ id: "p1", dueDate: "2026-12-15", currency: "EUR", originalAmount: 50, baseAmount: 550, supplier: "Fournisseur B" }],
    manual: [{ id: "m1", date: "2026-11-26", label: "Loyer", amount: 25, direction: "out" }, { id: "m2", date: "2026-11-27", label: "Flux EUR non converti", amount: 500, direction: "in", currency: "EUR" }],
  });
  assert.equal(report.ok, true);
  assert.equal(report.projections.find(item => item.days === 30).amount, 1575);
  assert.equal(report.projections.find(item => item.days === 30).inflows, 1150);
  assert.equal(report.projections.find(item => item.days === 30).outflows, 575);
  assert.deepEqual(report.receivablesByCurrency, { EUR: 100, MAD: 50 });
  assert.deepEqual(report.payablesByCurrency, { EUR: 50 });
  assert.equal(report.events.some(item => item.id === "m2"), false);
  assert.equal(report.monthly[0].outflows, 25);
  assert.equal(report.monthly[0].inflows, 50);
  assert.equal(report.monthly[1].inflows, 1100);
  assert.equal(report.monthly[1].outflows, 550);
  assert.deepEqual(groupFinancialAmounts([{currency:"MAD",amount:10},{currency:"EUR",amount:7},{currency:"MAD",amount:2}]), {MAD:12,EUR:7});
  assert.equal(buildFinancialForecast({baseCurrency:"MAD",openingCash:0,asOf:"2026-02-30"}).ok, false);
});

test("budgets : comparaison mensuelle, écarts favorables et alertes sans écriture", () => {
  const report = buildBudgetReport({
    startDate: "2026-01-01", endDate: "2026-02-28", currency: "MAD",
    lines: [
      { account: "60", type: "expense", monthlyAmount: 100, label: "Charges" },
      { account: "70", type: "income", monthlyAmount: 200, label: "Produits" },
    ],
    entries: [
      { date: "2026-01-15", lines: [{ account: "601", debit: 80, credit: 0 }, { account: "701", debit: 0, credit: 150 }] },
      { date: "2026-02-15", lines: [{ account: "601", debit: 30, credit: 10 }, { account: "701", debit: 0, credit: 0 }] },
      { date: "2025-12-31", lines: [{ account: "601", debit: 999, credit: 0 }] },
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.months.length, 2);
  assert.equal(report.totals.budgetExpenses, 200);
  assert.equal(report.totals.actualExpenses, 100);
  assert.equal(report.totals.expenseVariance, 100);
  assert.equal(report.totals.budgetIncome, 400);
  assert.equal(report.totals.actualIncome, 150);
  assert.equal(report.totals.incomeVariance, -250);
  assert.equal(report.totals.netBudget, 200);
  assert.equal(report.totals.netActual, 50);
  assert.equal(report.months[1].actualExpenses, 20);
  assert.equal(report.alerts.some(item => item.month === "2026-02" && item.type === "income_shortfall"), true);
  assert.equal(validateBudgetLines([{account:"6",type:"expense",monthlyAmount:10},{account:"60",type:"expense",monthlyAmount:20}]).ok, false);
  assert.equal(buildBudgetReport({startDate:"2026-02-30",endDate:"2026-12-31"}).ok, false);
});

test("créances clients : balance âgée, règlements, avoirs et séparation des devises", () => {
  const report = buildReceivablesReport({
    asOf: "2026-11-25", baseCurrency: "MAD",
    documents: [
      { id: 1, type: "invoice", status: "validated", number: "F-001", customerName: "Client A", date: "2026-10-01", dueDate: "2026-11-01", currency: "MAD", exchangeRate: 1, totals: { ttc: 1000 }, payments: [{ amount: 200 }] },
      { id: 2, type: "invoice", status: "validated", number: "F-002", customerName: "Client A", date: "2026-11-10", dueDate: "2026-12-10", currency: "EUR", exchangeRate: 11, totals: { ttc: 100 } },
      { id: 3, type: "invoice", status: "validated", customerName: "Client B", date: "2026-09-01", dueDate: "2026-08-01", currency: "MAD", totals: { ttc: 500 } },
      { id: 4, type: "credit_note", status: "validated", sourceInvoiceId: 3, currency: "MAD", totals: { ttc: 100 } },
      { id: 5, type: "invoice", status: "draft", customerName: "Brouillon", date: "2026-11-01", dueDate: "2026-11-05", currency: "MAD", totals: { ttc: 900 } },
      { id: 6, type: "invoice", status: "validated", customerName: "Soldée", date: "2026-11-01", dueDate: "2026-11-05", currency: "MAD", totals: { ttc: 200 }, paidAmount: 200 },
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.rows.length, 3);
  assert.equal(report.rows.find(row => row.invoiceId === 1).outstandingAmount, 800);
  assert.equal(report.rows.find(row => row.invoiceId === 1).bucket, "1_30");
  assert.equal(report.rows.find(row => row.invoiceId === 3).outstandingAmount, 400);
  assert.equal(report.rows.find(row => row.invoiceId === 3).bucket, "over_90");
  assert.equal(report.byCurrency.MAD.outstanding, 1200);
  assert.equal(report.byCurrency.EUR.outstanding, 100);
  assert.equal(report.byCurrency.EUR.baseOutstanding, 1100);
  assert.equal(report.totals.overdueInvoices, 2);
  assert.equal(report.totals.outstandingBase, 2300);
  assert.equal(report.byCustomer.find(item => item.customer === "Client A" && item.currency === "MAD").outstanding, 800);
  assert.equal(buildReceivablesReport({ asOf: "2026-02-30" }).ok, false);
});

console.log(`\nRésultat : ${passed} test(s) réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
