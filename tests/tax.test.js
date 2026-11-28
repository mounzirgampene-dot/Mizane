import { strict as assert } from "node:assert";
import { buildVatReport, calculateTaxLine, getActiveTaxRules, getTaxCountryProfile, validateTaxRule } from "../js/tax-core.js";

const profile = getTaxCountryProfile("MA");
assert.equal(profile.status, "active");
assert.equal(profile.currency, "MAD");
assert.equal(getActiveTaxRules("MA", "VAT", "2026-01-01").some(rule => rule.rate === 20), true);
assert.equal(getActiveTaxRules("MA", "VAT", "2026-01-01").some(rule => rule.rate === 10), true);
assert.equal(getActiveTaxRules("MA", "VAT", "2025-12-31").length, 0);
assert.equal(getTaxCountryProfile("FR").status, "active");

const calculated = calculateTaxLine({ countryCode: "MA", taxCode: "MA_VAT_STANDARD", date: "2026-02-01", baseAmount: 1000 });
assert.equal(calculated.ok, true);
assert.equal(calculated.taxAmount, 200);
assert.equal(calculated.totalAmount, 1200);
assert.equal(calculateTaxLine({ countryCode: "MA", taxCode: "MA_VAT_STANDARD", date: "2025-12-31", baseAmount: 100 }).ok, false);
assert.equal(validateTaxRule({ code: "MA_BAD", countryCode: "MA", taxType: "VAT", rate: 101, validFrom: "2026-01-01", label: "Erreur" }).ok, false);

const salesDocuments = [
  { id: 1, type: "invoice", status: "issued", date: "2026-02-10", currency: "MAD", lines: [{ quantity: 2, unitPrice: 100, taxRate: 20 }] },
  { id: 2, type: "credit_note", status: "issued", date: "2026-02-12", currency: "MAD", lines: [{ quantity: 1, unitPrice: 100, taxRate: 10 }] },
  { id: 3, type: "invoice", status: "draft", date: "2026-02-13", currency: "MAD", lines: [{ quantity: 1, unitPrice: 999, taxRate: 20 }] },
  { id: 4, type: "invoice", status: "issued", date: "2026-02-14", currency: "EUR", lines: [{ quantity: 1, unitPrice: 50, taxRate: 0 }] },
];
const purchaseDocuments = [
  { id: 5, type: "invoice", status: "validated", date: "2026-02-15", currency: "MAD", lines: [
    { quantity: 1, unitCost: 100, taxRate: 20, taxDeductible: true },
    { quantity: 1, unitCost: 50, taxRate: 10 },
    { quantity: 1, unitCost: 10, taxCode: "MA_VAT_STANDARD", taxRate: 10 },
  ] },
];
const beforeSales = structuredClone(salesDocuments);
const beforePurchases = structuredClone(purchaseDocuments);
const report = buildVatReport({ countryCode: "MA", startDate: "2026-02-01", endDate: "2026-02-28", salesDocuments, purchaseDocuments });
assert.equal(report.ok, true);
assert.equal(report.documentsCount, 4);
assert.equal(report.byCurrency.MAD.salesBase, 100);
assert.equal(report.byCurrency.MAD.outputVat, 30);
assert.equal(report.byCurrency.MAD.purchaseBase, 160);
assert.equal(report.byCurrency.MAD.inputVat, 26);
assert.equal(report.byCurrency.MAD.deductibleInputVat, 20);
assert.equal(report.byCurrency.MAD.netVatPayable, 10);
assert.equal(report.byCurrency.EUR.unclassifiedBase, 50);
assert.equal(report.warnings.some(item => item.code === "zero_rate_unqualified"), true);
assert.equal(report.warnings.some(item => item.code === "tax_code_rate_mismatch"), true);
assert.deepEqual(salesDocuments, beforeSales);
assert.deepEqual(purchaseDocuments, beforePurchases);
assert.equal(buildVatReport({ countryCode: "MA", startDate: "2026-02-30", endDate: "2026-03-01" }).ok, false);
assert.equal(buildVatReport({ countryCode: "FR", startDate: "2026-02-01", endDate: "2026-02-28" }).ok, true);

console.log("Lot 22 — tests du moteur fiscal : OK");
