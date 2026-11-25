import { strict as assert } from "node:assert";
import { calculateRegionalIS, calculateRegionalWithholding, getRegionalWithholdingOptions } from "../js/regional-african-tax-calculators.js";

const bj=calculateRegionalIS({countryCode:"BJ",fiscalProfit:10000000,turnover:50000000,industry:"industrial"});
assert.equal(bj.ok,true);
assert.equal(bj.rate,25);
assert.equal(bj.corporateTax,2500000);
assert.equal(bj.minimumTax,500000);
assert.equal(bj.amountDue,2500000);
const bjMin=calculateRegionalIS({countryCode:"BJ",fiscalProfit:0,turnover:100000000,sector:"building"});
assert.equal(bjMin.minimumTax,3000000);
const bjWht=calculateRegionalWithholding({countryCode:"BJ",ruleCode:"BJ_AIB_SERVICES_REGISTERED",baseAmount:100000,date:"2026-11-25"});
assert.equal(bjWht.taxAmount,3000);
assert.equal(getRegionalWithholdingOptions("BJ").length,4);

const bf=calculateRegionalIS({countryCode:"BF",fiscalProfit:10000000,turnover:100000000});
assert.equal(bf.corporateTax,2750000);
assert.equal(bf.minimumTax,500000);
const bfWht=calculateRegionalWithholding({countryCode:"BF",ruleCode:"BF_NONRESIDENT",baseAmount:100000,date:"2026-11-25"});
assert.equal(bfWht.taxAmount,20000);
assert.equal(getRegionalWithholdingOptions("BF").length,5);

const ml=calculateRegionalIS({countryCode:"ML",fiscalProfit:10000000,turnover:100000000});
assert.equal(ml.corporateTax,3000000);
assert.equal(ml.minimumTax,1000000);
assert.equal(calculateRegionalIS({countryCode:"XX",fiscalProfit:100}).ok,false);
assert.equal(calculateRegionalWithholding({countryCode:"ML",ruleCode:"x",baseAmount:100,date:"2026-01-01"}).ok,false);
assert.equal(calculateRegionalWithholding({countryCode:"BJ",ruleCode:"BJ_AIB_SERVICES_REGISTERED",baseAmount:100,date:"2026-02-30"}).ok,false);
console.log("Lot 26 — calculateurs régionaux Bénin, Burkina Faso et Mali : OK");
