import { strict as assert } from "node:assert";
import {
  calculateMoroccoIS, calculateMoroccoIR, calculateMoroccoIRProfessional, calculateMoroccoWithholding,
  buildMoroccoTaxCalendar, reconcileTaxLedger, validateTaxDeclaration,
} from "../js/tax-compliance-core.js";

const is = calculateMoroccoIS({ accountingResult: 500000, additions: 20000, deductions: 10000, rateCategory: "standard", cmGeneralBase: 2000000, cmReducedBase: 100000, advancePayments: 20000 });
assert.equal(is.ok, true);
assert.equal(is.fiscalProfit, 510000);
assert.equal(is.calculatedIS, 102000);
assert.equal(is.minimumContribution, 5150);
assert.equal(is.netDue, 82000);
assert.equal(calculateMoroccoIS({ accountingResult: -50000, cmGeneralBase: 100000, rateCategory: "standard" }).minimumContribution, 3000);
assert.equal(calculateMoroccoIS({ accountingResult: 100000, cmRate: 0.15 }).ok, false);

const ir = calculateMoroccoIR({ annualNetTaxableIncome: 120000, dependents: 2 });
assert.equal(ir.ok, true);
assert.equal(ir.grossAnnualTax, 18800);
assert.equal(ir.familyReduction, 1200);
assert.equal(ir.annualTax, 17600);
assert.equal(ir.monthlyEquivalent, 1466.67);
assert.equal(calculateMoroccoIR({ annualNetTaxableIncome: -1 }).ok, false);
const irPro = calculateMoroccoIRProfessional({ fiscalProfit: 100000, minimumContributionBase: 500000, cmRate: 0.25, dependents: 1 });
assert.equal(irPro.ok, true);
assert.equal(irPro.annualIR, 11400);
assert.equal(irPro.minimumContribution, 1500);
assert.equal(irPro.netDue, 11400);
assert.equal(calculateMoroccoIRProfessional({ fiscalProfit: 10000, minimumContributionBase: 100000, cmRate: 4 }).minimumContribution, 4000);
assert.equal(calculateMoroccoIRProfessional({ fiscalProfit: 10000, minimumContributionBase: 100000, cmRate: 3 }).ok, false);

const wht = calculateMoroccoWithholding({ ruleCode: "MA_WHT_SERVICE_COMPANY_5", baseAmount: 10000, date: "2026-06-01", payerEligible: true });
assert.equal(wht.ok, true);
assert.equal(wht.taxAmount, 500);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_SERVICE_COMPANY_5", baseAmount: 10000, date: "2026-06-01" }).ok, false);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_DIVIDENDS_EXEMPT", baseAmount: 10000, date: "2026-06-01", payerEligible: true }).taxAmount, 0);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_DIVIDENDS_2025", baseAmount: 10000, date: "2025-06-01" }).taxAmount, 1250);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_DIVIDENDS_2026", baseAmount: 10000, date: "2026-06-01" }).taxAmount, 1125);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_DIVIDENDS_2027", baseAmount: 10000, date: "2027-06-01" }).taxAmount, 1000);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_DIVIDENDS_2026", baseAmount: 10000, date: "2027-06-01" }).ok, false);
assert.equal(calculateMoroccoWithholding({ ruleCode: "CUSTOM", baseAmount: 1000, date: "2026-01-01", customRate: 7 }).ok, false);
assert.equal(calculateMoroccoWithholding({ ruleCode: "MA_WHT_NONRESIDENT_10", baseAmount: 1000, date: "2026-01-01", applyTreaty: true, treatyRate: "" }).ok, false);

const calendar = buildMoroccoTaxCalendar({ fiscalStart: "2025-01-01", fiscalEnd: "2025-12-31", year: 2026, vatRegime: "none", includeIsAdvances: false, withholdingMonths: ["2026-01", "2026-12"] });
assert.equal(calendar.ok, true);
assert.equal(calendar.items.find(x => x.id === "IS_ANNUAL_2025").dueDate, "2026-03-31");
assert.equal(calendar.items.find(x => x.id === "PAYROLL_ANNUAL_2026").dueDate, "2026-02-28");
assert.equal(buildMoroccoTaxCalendar({ fiscalEnd: "2026-01-31", year: 2027, vatRegime: "none", includeIsAdvances: false, includePayrollAnnual: false }).items[0].dueDate, "2026-04-30");
assert.equal(calendar.items.find(x => x.id === "WHT_2026-01").dueDate, "2026-02-28");
assert.equal(calendar.items.find(x => x.id === "WHT_2026-12").dueDate, "2027-01-31");


const monthlyCalendar = buildMoroccoTaxCalendar({ fiscalStart: "2026-01-01", fiscalEnd: "2026-12-31", year: 2026, vatRegime: "monthly" });
assert.equal(monthlyCalendar.items.filter(x => x.taxType === "TVA").length, 12);
assert.equal(monthlyCalendar.items.find(x => x.id === "VAT_MA_2026-01").dueDate, "2026-02-28");
assert.equal(monthlyCalendar.items.find(x => x.id === "VAT_MA_2026-12").dueDate, "2027-01-31");
assert.equal(monthlyCalendar.items.find(x => x.id === "IS_ADVANCE_2026-03-31").dueDate, "2026-03-31");
assert.equal(monthlyCalendar.items.find(x => x.id === "IS_ADVANCE_2026-06-30").dueDate, "2026-06-30");
assert.equal(monthlyCalendar.items.find(x => x.id === "IS_ADVANCE_2026-09-30").dueDate, "2026-09-30");
assert.equal(monthlyCalendar.items.find(x => x.id === "IS_ADVANCE_2026-12-31").dueDate, "2026-12-31");
assert.equal(monthlyCalendar.items.find(x => x.id === "IS_ANNUAL_2026").dueDate, "2027-03-31");
assert.ok(monthlyCalendar.items.find(x => x.id === "VAT_MA_2026-01").requiredDocuments.length >= 3);
const quarterlyCalendar = buildMoroccoTaxCalendar({ fiscalStart: "2026-01-01", fiscalEnd: "2026-12-31", year: 2026, vatRegime: "quarterly", includeIsAdvances: false, includePayrollAnnual: false });
assert.equal(quarterlyCalendar.items.filter(x => x.taxType === "TVA").length, 4);
assert.equal(quarterlyCalendar.items.find(x => x.id === "VAT_MA_2026-T1").dueDate, "2026-04-30");
assert.equal(quarterlyCalendar.items.find(x => x.id === "VAT_MA_2026-T4").dueDate, "2027-01-31");
assert.equal(buildMoroccoTaxCalendar({ fiscalEnd: "2026-12-31", year: 2026, vatRegime: "yearly" }).ok, false);

const reconciliation = reconcileTaxLedger({ entries: [{ lines: [{ account: "4455", debit: 100, credit: 500 }] }], accounts: { TVA: ["4455"] }, declared: { TVA: 400 } });
assert.equal(reconciliation.results[0].ledgerBalance, 400);
assert.equal(reconciliation.results[0].status, "balanced");
assert.equal(validateTaxDeclaration({ taxType: "IS", period: "2025", dueDate: "2026-03-31", amount: 1000, status: "paid" }).ok, false);
assert.equal(validateTaxDeclaration({ taxType: "IS", period: "2025", dueDate: "2026-03-31", amount: 1000, status: "paid", paymentDate: "2026-03-20" }).ok, true);

console.log("Lot 22 — conformité fiscale Maroc : OK");
