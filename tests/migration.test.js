import assert from "node:assert/strict";
import { newStore, postEntry, buildAccountCache } from "../js/accounting.js";
import { applyPlanMigration, planMigrationPreview, undoPlanMigration } from "../js/plans/migration.js";
const source={id:"source",accounts:[["100","Capital","equity"],["600","Achats","expense"]]};
const target={id:"target",accounts:[["101","Capital cible","equity"],["610","Achats cible","expense"]]};
const store=newStore();store.settings.plan="source";buildAccountCache(store,source.accounts.map(([code,label,type])=>({code,label,type})));
postEntry(store,{date:"2026-01-10",journal:"OD",reference:"Facture achat",lines:[{account:"600",label:"Facture fournisseur F-01",debit:100,credit:0},{account:"100",label:"Règlement",debit:0,credit:100}]});
const original=structuredClone(store.entries);
const mapping={id:"source-target",label:"Source vers cible",sourcePlanId:"source",targetPlanId:"target",status:"approved",approvedAt:"2026-11-26T12:00:00.000Z",approvalEvents:[{at:"2026-11-26T12:00:00.000Z",actor:null}],rules:[
{id:"r1",relation:"exact",sourceCodes:["600"],targetCodes:["610"],status:"approved"},
{id:"r2",relation:"exact",sourceCodes:["100"],targetCodes:["101"],status:"approved"}
]};
const preview=planMigrationPreview(store,{sourcePlan:source,targetPlan:target,mapping});
assert.equal(preview.canApply,true);assert.equal(preview.migratedEntryCount,1);
const applied=applyPlanMigration(store,{sourcePlan:source,targetPlan:target,mapping});
assert.equal(applied.migratedEntryCount,1);assert.equal(store.settings.plan,"target");
assert.deepEqual(store.entries[0].lines.map(l=>l.account),["610","101"]);
assert.equal(store.entries[0].lines[0].label,"Facture fournisseur F-01");
assert.deepEqual(store.entries[0].client_uid,original[0].client_uid);
assert.equal(store.settings.planMigrationHistory.length,1);
assert.equal(store.settings.planMigrationHistory[0].events[0].type,"approved");
assert.equal(store.settings.planMigrationHistory[0].approvedAt,"2026-11-26T12:00:00.000Z");
const undone=undoPlanMigration(store,applied.record.id);
assert.equal(undone.restoredEntryCount,1);assert.equal(store.settings.plan,"source");
assert.deepEqual(store.entries,original);
assert.equal(store.settings.planMigrationHistory[0].status,"undone");
assert.equal(store.settings.planMigrationHistory[0].events.at(-1).type,"undone");
const again=applyPlanMigration(store,{sourcePlan:source,targetPlan:target,mapping});
store.entries[0].reference="edited after migration";
assert.throws(()=>undoPlanMigration(store,again.record.id),/écritures ont changé/);
const broken=newStore();broken.settings.plan="source";buildAccountCache(broken,source.accounts.map(([code,label,type])=>({code,label,type})));
postEntry(broken,{date:"2026-01-10",journal:"OD",reference:"x",lines:[{account:"600",debit:100,credit:0},{account:"100",debit:0,credit:100}]});
assert.throws(()=>applyPlanMigration(broken,{sourcePlan:source,targetPlan:target,mapping:{...mapping,rules:[{...mapping.rules[0],status:"draft"},mapping.rules[1]]}}),/approuvés/);
const collision=newStore();collision.settings.plan="source";collision.settings.customAccounts=[{code:"101",label:"Doublon",type:"equity"}];buildAccountCache(collision,source.accounts.map(([code,label,type])=>({code,label,type})));
postEntry(collision,{date:"2026-01-10",journal:"OD",reference:"x",lines:[{account:"600",debit:100,credit:0},{account:"100",debit:0,credit:100}]});
assert.throws(()=>applyPlanMigration(collision,{sourcePlan:source,targetPlan:target,mapping}),/Collision/);
console.log("✓ Migration transactionnelle, conservation des écritures, sauvegarde et retour arrière.");
