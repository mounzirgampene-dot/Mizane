// MIZANE — Suivi des relances et engagements clients.
import { store, $app, router, toast, esc, saveNow } from "./state.js";
import { formatMoney } from "./countries.js";
import { renderBarChart } from "./charts.js";
import { buildCustomerFollowupQueue, appendCustomerFollowup, FOLLOWUP_CHANNELS, FOLLOWUP_STATUSES } from "./customer-followups-core.js";
const today=()=>new Date().toISOString().slice(0,10);
const fmt=(amount,currency)=>formatMoney(amount,currency||store.settings.currency,store.settings.locale);
const billingDocuments=()=>Array.isArray(store.billing?.documents)?store.billing.documents:[];
const getFollowups=()=>{
 if(!store.billing||typeof store.billing!=="object")store.billing={documents:[]};
 if(!store.billing.customerFollowups||typeof store.billing.customerFollowups!=="object")store.billing.customerFollowups={};
 return store.billing.customerFollowups;
};
export function viewCustomerFollowups(){
 const asOf=today(),followups=getFollowups();
 const queue=buildCustomerFollowupQueue({documents:billingDocuments(),followups,asOf,baseCurrency:store.settings.currency||"MAD"});
 const selectedId=new URLSearchParams(location.search).get("invoice");
 const selected=queue.rows.find(row=>String(row.invoiceId)===String(selectedId))||queue.rows[0]||null;
 const ageBuckets=[{label:"À échéance / non échues",test:r=>r.overdueDays<=0},{label:"1 à 30 jours",test:r=>r.overdueDays>=1&&r.overdueDays<=30},{label:"31 à 60 jours",test:r=>r.overdueDays>=31&&r.overdueDays<=60},{label:"61 à 90 jours",test:r=>r.overdueDays>=61&&r.overdueDays<=90},{label:"Plus de 90 jours",test:r=>r.overdueDays>90}];
 const agingRows=ageBuckets.map(bucket=>({label:bucket.label,count:queue.rows.filter(bucket.test).length}));
 const followupCharts=renderBarChart("Répartition des créances par ancienneté",agingRows,[{key:"count",label:"Factures"}],value=>String(Math.round(value)));
 const rowsHTML=queue.rows.map(row=>"<tr><td><strong>"+esc(row.customer)+"</strong><br><span class='muted'>"+esc(row.number)+" · "+esc(row.currency)+"</span></td><td>"+esc(row.dueDate)+"</td><td>"+(row.overdueDays?row.overdueDays+" j":"—")+"</td><td>"+(row.promiseOverdue?"<span class='errors'>Promesse dépassée</span>":esc(row.followupStatusLabel))+"</td><td>"+(row.nextDate?esc(row.nextDate):"À planifier")+"</td><td class='num'>"+fmt(row.outstandingAmount,row.currency)+"</td><td><button class='small secondary' data-followup-select='"+esc(row.invoiceId)+"'>Suivre</button></td></tr>").join("");
 const optionsHTML=queue.rows.map(row=>"<option value='"+esc(row.invoiceId)+"' "+(selected&&String(row.invoiceId)===String(selected.invoiceId)?"selected":"")+">"+esc(row.customer)+" — "+esc(row.number)+" — "+fmt(row.outstandingAmount,row.currency)+"</option>").join("");
 const historyHTML=selected&&selected.events.length
  ?"<div class='table-wrap'><table><thead><tr><th>Date</th><th>Canal</th><th>Résultat</th><th>Compte rendu</th><th>Prochaine action</th></tr></thead><tbody>"+[...selected.events].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(event=>"<tr><td>"+esc(event.date)+"</td><td>"+esc(FOLLOWUP_CHANNELS[event.channel]||event.channel)+"</td><td>"+esc(FOLLOWUP_STATUSES[event.status]||event.status)+"</td><td>"+esc(event.note)+"</td><td>"+esc(event.nextDate||"—")+"</td></tr>").join("")+"</tbody></table></div>"
  :"<p class='muted'>Aucun contact consigné pour cette facture.</p>";
 let html="<h1>Relances et suivi clients</h1><p class='muted'>Organisez les contacts, consignez les échanges et planifiez les prochaines actions. MIZANE ne transmet aucun message automatiquement.</p>";
 if(!billingDocuments().length)html+="<div class='card'><p>Aucune facture client n'est disponible dans la facturation.</p><button data-route='billing'>Ouvrir la facturation</button></div>";
 html+="<div class='grid cols-3'><div class='card kpi'><div class='value'>"+queue.totals.invoices+"</div><div class='label'>Créances ouvertes</div></div><div class='card kpi'><div class='value'>"+queue.totals.overdue+"</div><div class='label'>Factures échues</div></div><div class='card kpi'><div class='value'>"+queue.totals.dueToday+"</div><div class='label'>Actions à effectuer</div></div></div>";
 html+="<div class='grid cols-2'><div class='card kpi'><div class='value'>"+queue.totals.promisesOverdue+"</div><div class='label'>Promesses dépassées</div></div><div class='card kpi'><div class='value'>"+queue.totals.scheduled+"</div><div class='label'>Actions programmées</div></div></div>";
 html+=followupCharts;
 if(queue.totals.invoices){
  html+="<div class='card'><h2>Priorités de recouvrement</h2><div class='table-wrap'><table><thead><tr><th>Client / facture</th><th>Échéance</th><th>Retard</th><th>Statut</th><th>Prochaine action</th><th class='num'>Solde</th><th></th></tr></thead><tbody>"+rowsHTML+"</tbody></table></div></div>";
  html+="<div class='card'><h2>Consigner un contact</h2><p><strong>"+esc(selected.customer)+"</strong> · "+esc(selected.number)+" · Solde : <strong>"+fmt(selected.outstandingAmount,selected.currency)+"</strong></p><form id='customer-followup-form'><label for='followup-invoice'>Facture</label><select id='followup-invoice'>"+optionsHTML+"</select><div class='row'><div><label for='followup-date'>Date du contact</label><input id='followup-date' type='date' value='"+asOf+"' required></div><div><label for='followup-channel'>Canal</label><select id='followup-channel'>"+Object.entries(FOLLOWUP_CHANNELS).map(([key,label])=>"<option value='"+key+"'>"+label+"</option>").join("")+"</select></div></div><label for='followup-status'>Résultat du contact</label><select id='followup-status'>"+Object.entries(FOLLOWUP_STATUSES).map(([key,label])=>"<option value='"+key+"'>"+label+"</option>").join("")+"</select><div id='followup-promise-wrap' class='hidden'><label for='followup-promise-date'>Date promise de paiement</label><input id='followup-promise-date' type='date'></div><label for='followup-next-date'>Prochaine action (facultatif)</label><input id='followup-next-date' type='date'><label for='followup-note'>Compte rendu</label><textarea id='followup-note' rows='3' maxlength='2000' required placeholder='Personne contactée, réponse, engagement, difficulté rencontrée…'></textarea><div class='actions'><button type='submit'>Enregistrer le contact</button></div></form></div>";
  html+="<div class='card'><h2>Historique des contacts — "+esc(selected.number)+"</h2>"+historyHTML+"</div>";
 }else html+="<div class='card'><p>Aucune créance ouverte à suivre à la date du jour.</p><button data-route='billing'>Consulter la facturation</button></div>";
 $app.innerHTML=html;
 const status=document.getElementById("followup-status"),promiseWrap=document.getElementById("followup-promise-wrap");
 status?.addEventListener("change",()=>{
  promiseWrap.classList.toggle("hidden",status.value!=="promesse");
  if(status.value!=="promesse")document.getElementById("followup-promise-date").value="";
 });
 document.querySelectorAll("[data-followup-select]").forEach(button=>button.addEventListener("click",()=>{
  const url=new URL(location.href);url.searchParams.set("invoice",button.dataset.followupSelect);history.replaceState(null,"",url);router.render();
 }));
 document.getElementById("followup-invoice")?.addEventListener("change",event=>{
  const url=new URL(location.href);url.searchParams.set("invoice",event.target.value);history.replaceState(null,"",url);router.render();
 });
 document.getElementById("customer-followup-form")?.addEventListener("submit",event=>{
  event.preventDefault();
  const invoiceId=document.getElementById("followup-invoice").value;
  const input={date:document.getElementById("followup-date").value,channel:document.getElementById("followup-channel").value,status:document.getElementById("followup-status").value,promiseDate:document.getElementById("followup-promise-date").value,nextDate:document.getElementById("followup-next-date").value,note:document.getElementById("followup-note").value};
  const result=appendCustomerFollowup(followups[String(invoiceId)]||[],input);
  if(!result.ok)return toast(result.errors[0],5000);
  followups[String(invoiceId)]=result.events;saveNow();toast("Contact client enregistré dans l'historique.");
  const url=new URL(location.href);url.searchParams.set("invoice",invoiceId);history.replaceState(null,"",url);router.render();
 });
}
