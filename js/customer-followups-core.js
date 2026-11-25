// MIZANE — Suivi des créances clients.
import { buildReceivablesReport } from "./receivables-core.js";
const validDate = value => {
 const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!m)return false;
 return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toISOString().slice(0,10)===value;
};
export const FOLLOWUP_STATUSES={a_relancer:"À relancer",promesse:"Promesse de paiement",litige:"En litige",suspendu:"Suivi suspendu"};
export const FOLLOWUP_CHANNELS={telephone:"Téléphone",email:"E-mail",courrier:"Courrier",visite:"Visite",autre:"Autre"};
export function validateFollowupEvent(input={}) {
 const errors=[];
 if(!validDate(input.date))errors.push("La date du contact est invalide.");
 if(!Object.hasOwn(FOLLOWUP_CHANNELS,input.channel))errors.push("Le canal de contact est invalide.");
 if(!Object.hasOwn(FOLLOWUP_STATUSES,input.status))errors.push("Le statut de suivi est invalide.");
 if(!String(input.note||"").trim())errors.push("Ajoutez un compte rendu du contact.");
 if(String(input.note||"").length>2000)errors.push("Le compte rendu ne doit pas dépasser 2 000 caractères.");
 if(input.nextDate&&!validDate(input.nextDate))errors.push("La prochaine date de suivi est invalide.");
 if(input.status==="promesse"&&!validDate(input.promiseDate))errors.push("Une promesse de paiement doit comporter une date prévue.");
 if(input.status!=="promesse"&&input.promiseDate)errors.push("La date de promesse n'est applicable qu'au statut promesse.");
 if(input.nextDate&&input.nextDate<input.date)errors.push("La prochaine action ne peut pas précéder le contact enregistré.");
 return {ok:errors.length===0,errors};
}
export function appendCustomerFollowup(existing=[],input={}) {
 const validation=validateFollowupEvent(input);
 if(!validation.ok)return {ok:false,errors:validation.errors,events:Array.isArray(existing)?existing:[]};
 const event={id:String(input.id||("followup-"+Date.now()+"-"+Math.random().toString(36).slice(2,8))),date:input.date,channel:input.channel,status:input.status,note:String(input.note).trim(),nextDate:input.nextDate||"",promiseDate:input.promiseDate||"",createdAt:input.createdAt||new Date().toISOString()};
 return {ok:true,errors:[],event,events:[...(Array.isArray(existing)?existing:[]),event]};
}
export function buildCustomerFollowupQueue({documents=[],followups={},asOf=new Date().toISOString().slice(0,10),baseCurrency="MAD"}={}) {
 const report=buildReceivablesReport({documents,asOf,baseCurrency});
 if(!report.ok)return {...report,rows:[],totals:{invoices:0,overdue:0,dueToday:0,scheduled:0,promisesOverdue:0}};
 const rows=report.rows.map(row=>{
  const events=Array.isArray(followups[String(row.invoiceId)])?followups[String(row.invoiceId)]:[];
  const last=events.length?[...events].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||"").localeCompare(String(a.createdAt||"")))[0]:null;
  // Seul le dernier suivi fait foi : une nouvelle action peut annuler
  // une ancienne échéance ou remplacer une promesse de paiement.
  const nextDate=validDate(last?.nextDate)?last.nextDate:"";
  const promiseDate=last?.status==="promesse"&&validDate(last?.promiseDate)?last.promiseDate:"";
  const status=last?.status||"a_relancer";
  return {...row,events,lastContact:last?.date||"",lastChannel:last?.channel||"",followupStatus:status,followupStatusLabel:FOLLOWUP_STATUSES[status]||FOLLOWUP_STATUSES.a_relancer,nextDate,promiseDate,actionDue:Boolean(nextDate&&nextDate<=asOf&&status!=="suspendu"),promiseOverdue:Boolean(status==="promesse"&&promiseDate&&promiseDate<asOf&&row.outstandingAmount>0)};
 });
 rows.sort((a,b)=>Number(b.promiseOverdue)-Number(a.promiseOverdue)||Number(b.actionDue)-Number(a.actionDue)||Number(b.overdue)-Number(a.overdue)||b.overdueDays-a.overdueDays||b.outstandingAmount-a.outstandingAmount);
 return {ok:true,errors:[],rows,byCurrency:report.byCurrency,byCustomer:report.byCustomer,totals:{invoices:rows.length,overdue:rows.filter(row=>row.overdue).length,dueToday:rows.filter(row=>row.actionDue).length,scheduled:rows.filter(row=>row.nextDate&&row.nextDate>asOf).length,promisesOverdue:rows.filter(row=>row.promiseOverdue).length}};
}
