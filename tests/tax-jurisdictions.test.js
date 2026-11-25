import { strict as assert } from "node:assert";
import { getTaxCountryProfile, getActiveTaxRules, calculateTaxLine, buildVatReport } from "../js/tax-core.js";
const expected={FR:{currency:"EUR",rates:[20,10,5.5,2.1]},BE:{currency:"EUR",rates:[21,12,6]},SN:{currency:"XOF",rates:[18]},CI:{currency:"XOF",rates:[18,9]}};
for(const [code,spec] of Object.entries(expected)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.status,"active",code);
 assert.equal(p.currency,spec.currency,code);
 assert.deepEqual(p.rules.filter(x=>x.taxType==="VAT").map(x=>x.rate),spec.rates,code);
 assert.deepEqual(p.calculationModules,["VAT",...(code==="FR"||code==="BE"?["IS","IR","WITHHOLDING"]:[])],code+" : modules fiscaux activés");
 assert.ok(p.legalSources.length>=2,code+" : sources officielles");
 assert.ok(p.rules.every(x=>x.legalReference&&x.validFrom),code+" : références et dates");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : règles IS détaillées non activées dans le moteur de lignes");
}
assert.equal(getActiveTaxRules("CI","VAT","2026-01-16").some(x=>x.rate===9),false);
assert.equal(getActiveTaxRules("CI","VAT","2026-01-17").some(x=>x.rate===9),true);
assert.equal(calculateTaxLine({countryCode:"FR",taxCode:"FR_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).taxAmount,20);
assert.equal(calculateTaxLine({countryCode:"BE",taxCode:"BE_VAT_6",baseAmount:100,date:"2026-11-25",eligibilityConfirmed:true}).taxAmount,6);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-17",eligibilityConfirmed:true}).taxAmount,9);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-16",eligibilityConfirmed:true}).ok,false);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-17"}).ok,false);
const report=buildVatReport({countryCode:"SN",startDate:"2026-01-01",endDate:"2026-12-31",salesDocuments:[{id:1,type:"invoice",status:"issued",date:"2026-03-01",currency:"XOF",lines:[{amount:100000,taxRate:18}]}]});
assert.equal(report.ok,true);
assert.equal(report.byCurrency.XOF.outputVat,18000);
assert.equal(getTaxCountryProfile("CI").taxFacts.length,0);
assert.equal(getTaxCountryProfile("ZZ").status,"not_configured");
console.log("Lot 23 — juridictions fiscales internationales : OK");
