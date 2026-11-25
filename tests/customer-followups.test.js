import assert from "node:assert/strict";
import { appendCustomerFollowup, buildCustomerFollowupQueue, validateFollowupEvent } from "../js/customer-followups-core.js";
const invoice={id:12,type:"invoice",status:"validated",number:"F-012",customerName:"Client Test",date:"2026-10-01",dueDate:"2026-10-15",currency:"MAD",totals:{ttc:1500},payments:[{amount:500}]};
const input={date:"2026-11-20",channel:"telephone",status:"promesse",promiseDate:"2026-11-22",nextDate:"2026-11-23",note:"Le client confirme le règlement."};
assert.equal(validateFollowupEvent(input).ok,true);
const added=appendCustomerFollowup([],input);
assert.equal(added.ok,true);
assert.equal(added.events.length,1);
assert.equal(added.event.status,"promesse");
assert.equal(appendCustomerFollowup([],{...input,promiseDate:""}).ok,false);
assert.equal(appendCustomerFollowup([],{...input,note:" "}).ok,false);
assert.equal(appendCustomerFollowup([],{...input,channel:"sms"}).ok,false);
assert.equal(appendCustomerFollowup([],{...input,nextDate:"2026-11-19"}).ok,false);
const queue=buildCustomerFollowupQueue({asOf:"2026-11-25",baseCurrency:"MAD",documents:[invoice],followups:{"12":added.events}});
assert.equal(queue.ok,true);
assert.equal(queue.rows.length,1);
assert.equal(queue.rows[0].outstandingAmount,1000);
assert.equal(queue.rows[0].followupStatus,"promesse");
assert.equal(queue.rows[0].promiseOverdue,true);
assert.equal(queue.rows[0].actionDue,true);

// Un contact plus récent sans prochaine action efface l'ancien rendez-vous.
const rescheduled=appendCustomerFollowup(added.events,{...input,date:"2026-11-24",status:"a_relancer",promiseDate:"",nextDate:"",note:"Nouveau contact, aucun rappel planifié."});
const rescheduledQueue=buildCustomerFollowupQueue({asOf:"2026-11-25",documents:[invoice],followups:{"12":rescheduled.events}});
assert.equal(rescheduledQueue.rows[0].nextDate,"");
assert.equal(rescheduledQueue.rows[0].promiseDate,"");
assert.equal(rescheduledQueue.rows[0].actionDue,false);
assert.equal(rescheduledQueue.rows[0].promiseOverdue,false);

// Une nouvelle promesse remplace l'ancienne, même si elle est plus éloignée.
const renewed=appendCustomerFollowup(added.events,{...input,date:"2026-11-24",promiseDate:"2026-11-30",nextDate:"",note:"Nouvelle date de paiement convenue."});
const renewedQueue=buildCustomerFollowupQueue({asOf:"2026-11-25",documents:[invoice],followups:{"12":renewed.events}});
assert.equal(renewedQueue.rows[0].promiseDate,"2026-11-30");
assert.equal(renewedQueue.rows[0].promiseOverdue,false);
assert.equal(renewedQueue.rows[0].nextDate,"");

const noEvents=buildCustomerFollowupQueue({asOf:"2026-11-25",documents:[invoice]});
assert.equal(noEvents.rows[0].followupStatus,"a_relancer");
assert.equal(noEvents.totals.overdue,1);
assert.equal(buildCustomerFollowupQueue({asOf:"2026-02-30"}).ok,false);
console.log("✓ Lot 21 — suivi et relances clients");
