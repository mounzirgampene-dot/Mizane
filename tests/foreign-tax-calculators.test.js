import { strict as assert } from "node:assert";
import { calculateFranceIS, calculateFranceIR, calculateBelgiumIS, calculateBelgiumIR, calculateForeignWithholding } from "../js/foreign-tax-calculators.js";
const fr=calculateFranceIS({fiscalProfit:100000,reducedRateEligible:true}); assert.equal(fr.grossTax,20750);
assert.equal(calculateFranceIR({annualTaxableIncome:40000,householdParts:1}).annualTax,5103.99);
assert.equal(calculateBelgiumIS({fiscalProfit:150000,smallCompanyEligible:true}).grossTax,32500);
const be=calculateBelgiumIR({annualTaxableIncome:40000}); assert.equal(be.annualTax,11129);
assert.equal(calculateForeignWithholding({countryCode:"FR",ruleCode:"FR_NONRESIDENT_DIVIDENDS",baseAmount:10000,date:"2026-06-01"}).taxAmount,1280);
console.log("Lot 24 — calculateurs France et Belgique : OK");
