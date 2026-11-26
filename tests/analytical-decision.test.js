import { strict as assert } from "node:assert";
import { buildAnalyticalDecisionReport } from "../js/analytical-advanced-core.js";
const centers=[{id:"c1",name:"Production",type:"cost"},{id:"c2",name:"Commercial",type:"mixed"}];
const projects=[{id:"p1",name:"Projet Alpha",department:"Fabrication"},{id:"p2",name:"Projet Beta",department:"Ventes"}];
const entries=[
 {id:1,date:"2026-01-10",currency:"MAD",lines:[{account:"601",debit:1000,credit:0},{account:"701",debit:0,credit:2500}]},
 {id:2,date:"2026-01-11",currency:"MAD",lines:[{account:"613",debit:400,credit:0}]},
 {id:3,date:"2026-01-12",currency:"EUR",lines:[{account:"601",debit:100,credit:0}]},
 {id:4,date:"2026-01-13",currency:"MAD",reversed:true,lines:[{account:"601",debit:900,credit:0}]},
];
const allocations=[
 {id:"a1",entryId:1,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
 {id:"a2",entryId:1,lineIndex:1,centerId:"c2",projectId:"p2",percentage:100},
 {id:"a3",entryId:2,lineIndex:0,centerId:"c1",projectId:"p1",percentage:50,costNature:"indirect"},
 {id:"a4",entryId:3,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
 {id:"a5",entryId:4,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
];
const accountTypes={"601":"expense","613":"expense","701":"income"};
const report=buildAnalyticalDecisionReport({centers,projects,allocations,entries,accountTypes,startDate:"2026-01-01",endDate:"2026-12-31"});
const mad=report.currencies.find(x=>x.currency==="MAD"),eur=report.currencies.find(x=>x.currency==="EUR");
assert.equal(mad.income,2500);
assert.equal(mad.directCosts,1000);
assert.equal(mad.indirectCosts,200);
assert.equal(mad.unclassifiedCosts,200);
assert.equal(mad.result,1100);
assert.equal(mad.coverageRate,100);
assert.equal(mad.unclassifiedRate,14.29);
assert.equal(eur.directCosts,100);
assert.equal(report.byDepartment.find(x=>x.name==="Fabrication"&&x.currency==="MAD").directCosts,1000);
assert.equal(report.byDepartment.find(x=>x.name==="Fabrication"&&x.currency==="MAD").indirectCosts,200);
assert.equal(report.byDepartment.find(x=>x.name==="Ventes"&&x.currency==="MAD").income,2500);
assert.equal(report.byCenter.find(x=>x.name==="Production"&&x.currency==="EUR").directCosts,100);
assert.equal(report.byCenter.find(x=>x.name==="Production"&&x.currency==="MAD").result,-1200);
const filtered=buildAnalyticalDecisionReport({centers,projects,allocations,entries,accountTypes,startDate:"2026-01-10",endDate:"2026-01-10"});
assert.equal(filtered.currencies.length,1);
assert.equal(filtered.currencies[0].income,2500);
assert.equal(filtered.currencies[0].directCosts,1000);
console.log("✓ Tableau analytique décisionnel : départements, centres, natures de coûts, couverture et devises.");
