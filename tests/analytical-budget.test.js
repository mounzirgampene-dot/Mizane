import { strict as assert } from "node:assert";
import { buildAnalyticalBudgetReport, validateAnalyticalBudgets } from "../js/analytical-budget-core.js";
const centers=[{id:"c1",name:"Production",type:"cost"}];
const projects=[{id:"p1",name:"Alpha",department:"Fabrication"},{id:"p2",name:"Beta",department:"Ventes"}];
const accounts=[{code:"601",type:"expense"},{code:"701",type:"income"},{code:"613",type:"expense"}];
const entries=[
 {id:1,date:"2026-01-10",currency:"MAD",lines:[{account:"601",debit:1000,credit:0},{account:"701",debit:0,credit:2500}]},
 {id:2,date:"2026-02-10",currency:"MAD",lines:[{account:"601",debit:500,credit:0}]},
 {id:3,date:"2026-01-15",currency:"EUR",lines:[{account:"601",debit:100,credit:0}]},
 {id:4,date:"2026-02-20",currency:"MAD",reversed:true,lines:[{account:"601",debit:900,credit:0}]},
];
const allocations=[
 {id:"a1",entryId:1,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
 {id:"a2",entryId:1,lineIndex:1,centerId:"c1",projectId:"p1",percentage:100},
 {id:"a3",entryId:2,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"indirect"},
 {id:"a4",entryId:3,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
 {id:"a5",entryId:4,lineIndex:0,centerId:"c1",projectId:"p1",percentage:100,costNature:"direct"},
];
const lines=[
 {id:"b1",account:"601",type:"expense",monthlyAmount:1000,label:"Achats",dimensionType:"center",dimensionId:"c1",currency:"MAD"},
 {id:"b2",account:"701",type:"income",monthlyAmount:2000,label:"Ventes",dimensionType:"project",dimensionId:"p1",currency:"MAD"},
 {id:"b3",account:"601",type:"expense",monthlyAmount:100,label:"Achats EUR",dimensionType:"project",dimensionId:"p1",currency:"EUR"},
 {id:"b4",account:"601",type:"expense",monthlyAmount:1000,label:"Achats département",dimensionType:"department",dimensionId:"Fabrication",currency:"MAD"},
];
const args={lines,entries,allocations,centers,projects,accounts,startDate:"2026-01-01",endDate:"2026-03-31",asOf:"2026-02-28",baseCurrency:"MAD"};
const report=buildAnalyticalBudgetReport(args);
assert.equal(report.ok,true);
const madCenter=report.lines.find(x=>x.id==="b1");
assert.equal(madCenter.budgetTotal,3000);
assert.equal(madCenter.actualTotal,1500);
assert.equal(madCenter.variance,1500);
assert.equal(madCenter.actualToDate,1500);
assert.equal(madCenter.projected,2250);
assert.equal(madCenter.severity,"ok");
const eur=report.lines.find(x=>x.id==="b3");
assert.equal(eur.actualTotal,100);
assert.equal(eur.currency,"EUR");
const project=report.lines.find(x=>x.id==="b2");
assert.equal(project.actualTotal,2500);
const department=report.lines.find(x=>x.id==="b4");
assert.equal(department.actualTotal,1500);
assert.equal(report.dimensions.find(x=>x.dimensionType==="center").actual,1500);
assert.equal(report.currencies.find(x=>x.currency==="MAD").actualExpenses,1500);
assert.equal(report.currencies.find(x=>x.currency==="EUR").actualExpenses,100);
assert.equal(report.lines.some(x=>x.actualTotal>=2400&&x.account==="601"),false);
assert.equal(validateAnalyticalBudgets([...lines,{...lines[0],id:"duplicate"}],{centers,projects,accounts}).ok,false);
assert.equal(validateAnalyticalBudgets([{...lines[0],dimensionId:"missing"}],{centers,projects,accounts}).ok,false);
assert.equal(buildAnalyticalBudgetReport({...args,asOf:"invalid"}).ok,false);
assert.equal(buildAnalyticalBudgetReport({...args,allocations:[]}).lines.find(x=>x.id==="b1").actualTotal,0);
console.log("✓ Pilotage budgétaire analytique : axes, budgets, écarts, prévisions, alertes, périodes et devises.");
