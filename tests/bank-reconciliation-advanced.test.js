import assert from "node:assert/strict";
import { analyzeBankLine, buildBankReconciliationReport, bankReconciliationReportHTML, confirmBankMatchSuggestion } from "../js/bank-reconciliation-advanced.js";
const store={settings:{currency:"MAD"},entries:[
{id:1,date:"2026-11-25",reference:"VIR CLIENT ALPHA",lines:[{account:"5121",label:"Virement ALPHA",debit:600,credit:0,currency:"MAD"}]},
{id:2,date:"2026-11-25",reference:"VIR CLIENT BETA",lines:[{account:"5121",label:"Virement BETA",debit:400,credit:0,currency:"MAD"}]},
{id:3,date:"2026-11-26",reference:"PAIEMENT",lines:[{account:"5121",label:"Paiement fournisseur",debit:0,credit:900,currency:"MAD"}]},
{id:4,date:"2026-11-25",reference:"AUTRE DEVISE",lines:[{account:"5121",label:"Virement ALPHA",debit:1000,credit:0,currency:"EUR"}]},
{id:5,date:"2026-11-25",reversed:true,lines:[{account:"5121",debit:1000,credit:0,currency:"MAD"}]}
]};
const groupedLine={date:"2026-11-25",label:"Virement client alpha beta",amount:1000,currency:"MAD",status:"unmatched"};
const grouped=analyzeBankLine(groupedLine,store,2);
assert.ok(grouped.suggestions.some(item=>item.type==="grouped"&&item.allocations.length===2),"détecte une combinaison exacte de deux écritures");
const groupedSuggestion=grouped.suggestions.find(item=>item.type==="grouped");
const confirmed=confirmBankMatchSuggestion(groupedLine,groupedSuggestion,{days:2,lines:[groupedLine]},store);
assert.equal(confirmed.status,"matched");assert.equal(confirmed.matches.length,2);assert.equal(confirmed.matches.reduce((sum,item)=>sum+item.amount,0),1000);assert.equal(confirmed.matchMethod,"grouped");
const partialLine={date:"2026-11-25",label:"Paiement partiel",amount:300,currency:"MAD",status:"unmatched"};
const partial=analyzeBankLine(partialLine,store,2);
assert.ok(partial.suggestions.some(item=>item.type==="partial"));
const partialSuggestion=partial.suggestions.find(item=>item.type==="partial");
const partialConfirmed=confirmBankMatchSuggestion(partialLine,partialSuggestion,{days:2,lines:[partialLine]},store);
assert.equal(partialConfirmed.partial,true);assert.equal(partialConfirmed.partialRemaining,600);
assert.equal(analyzeBankLine({...groupedLine,currency:"USD"},store,2).suggestions.length,0);
assert.equal(analyzeBankLine({...groupedLine,date:"2026-12-30"},store,2).suggestions.length,0);
const fee=analyzeBankLine({date:"2026-11-25",label:"Commission bancaire",amount:-25,currency:"MAD",status:"unmatched"},store,2);
assert.equal(fee.feeCandidate,true);assert.equal(fee.diagnosis.type,"bank_fee");
const report=buildBankReconciliationReport({id:"session-1",createdAt:"2026-11-26",sourceFile:"releve.ofx",sourceFormat:"ofx",days:2,duplicateRows:1,parseWarnings:["ligne 4"],lines:[groupedLine,{date:"2026-11-25",label:"Commission bancaire",amount:-25,currency:"MAD",status:"unmatched"}]},store);
assert.equal(report.totals.count,2);assert.equal(report.totals.unmatched,2);assert.equal(report.totals.fees,1);assert.equal(report.totals.duplicates,1);
assert.match(bankReconciliationReportHTML(report),/Synthèse par devise/);assert.match(bankReconciliationReportHTML(report),/Commission bancaire/);
const staleStore={settings:{currency:"MAD"},entries:[{id:8,date:"2026-11-25",lines:[{account:"512",debit:100,credit:0,currency:"MAD"}]}]};
const staleLine={date:"2026-11-25",label:"test",amount:100,currency:"MAD",status:"unmatched"};
const staleSuggestion=analyzeBankLine(staleLine,staleStore,1).suggestions[0];staleStore.entries[0].lines[0].debit=80;
assert.throws(()=>confirmBankMatchSuggestion(staleLine,staleSuggestion,{lines:[staleLine]},staleStore),/total|disponible|correspond/i);
const allocatedStore={settings:{currency:"MAD"},entries:[{id:20,date:"2026-11-25",lines:[{account:"512",debit:500,credit:0,currency:"MAD"}]}]};
const alreadyAllocated={date:"2026-11-25",label:"Règlement antérieur",amount:300,currency:"MAD",status:"matched",match:20,matches:[{entryId:20,account:"512",amount:300}]};
const secondBankLine={date:"2026-11-25",label:"Nouveau règlement",amount:250,currency:"MAD",status:"unmatched"};
assert.equal(analyzeBankLine(secondBankLine,allocatedStore,1,{days:1,lines:[alreadyAllocated,secondBankLine]}).suggestions.length,0,"ne propose pas de dépasser le solde restant");
console.log("✓ Rapprochement avancé : regroupements, paiements partiels, devises, dates, frais, écarts, rapport et validation traçable.");
