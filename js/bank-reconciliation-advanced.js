// MIZANE — Analyse avancée, suggestions prudentes et rapports de rapprochement bancaire.
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const currencyOf = (line, store) => String(line.currency || store.settings?.currency || "").trim().toUpperCase();
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const words = value => new Set(normalize(value).split(/\s+/).filter(word => word.length > 2));
function labelSimilarity(a,b) { const left=words(a),right=words(b); if(!left.size||!right.size)return 0; let common=0;for(const word of left)if(right.has(word))common++;return Math.round(common/Math.max(left.size,right.size)*15); }
function dateDistance(a,b) { const left=Date.parse(a),right=Date.parse(b);return Number.isFinite(left)&&Number.isFinite(right)?Math.abs(left-right)/86400000:Infinity; }
function allocationsUsed(session,currentLine,candidate) {
  let used=0;
  for(const line of session?.lines||[]) {
    if(line===currentLine)continue;
    const matches=Array.isArray(line.matches)?line.matches:[];
    if(matches.length) { for(const item of matches) if(Number(item.entryId)===Number(candidate.entryId)&&String(item.account)===candidate.account&&Number(item.lineIndex??-1)===candidate.lineIndex)used+=Math.abs(Number(item.amount)||0); }
    else if(Number(line.match)===Number(candidate.entryId)) used+=Math.abs(Number(line.matchedAmount)||Math.abs(Number(line.amount)||0));
  }
  return round(used);
}
function candidatesFor(line,store,days,session) {
  const bankAmount=round(line.amount),bankCurrency=currencyOf(line,store),maxDays=Math.max(0,Number(days)||0),result=[];
  for(const entry of store.entries||[]) {
    if(entry.reversed||entry.reverseOf)continue;
    for(let lineIndex=0;lineIndex<(entry.lines||[]).length;lineIndex++) {
      const journalLine=entry.lines[lineIndex];
      if(!String(journalLine.account||"").startsWith("5"))continue;
      const signed=round((Number(journalLine.debit)||0)-(Number(journalLine.credit)||0));
      if(!signed||Math.sign(signed)!==Math.sign(bankAmount))continue;
      const currency=currencyOf(journalLine,store);
      if(currency!==bankCurrency)continue;
      const delta=dateDistance(entry.date,line.date);
      if(!Number.isFinite(delta)||delta>maxDays)continue;
      const candidate={entryId:entry.id,account:String(journalLine.account),lineIndex,date:entry.date,label:journalLine.label||entry.reference||"",signedAmount:signed,remaining:Math.max(0,round(Math.abs(signed)-allocationsUsed(session,line,{entryId:entry.id,account:String(journalLine.account),lineIndex}))),delta,currency};
      if(candidate.remaining>0.001)result.push(candidate);
    }
  }
  return result.sort((a,b)=>a.delta-b.delta||labelSimilarity(line.label,b.label)-labelSimilarity(line.label,a.label));
}
function confidence(line,items,type) {
  const delta=Math.min(...items.map(item=>item.delta));
  const dateScore=delta<=1?25:delta<=3?18:delta<=7?10:5;
  const labelScore=Math.max(...items.map(item=>labelSimilarity(line.label,item.label)));
  const base=type==="exact"?58:type==="grouped"?65:type==="partial"?42:20;
  return Math.min(99,base+dateScore+labelScore);
}
function makeSuggestion(type,items,line,confidenceValue,reason) {
  return {id:type+":"+items.map(item=>item.entryId+"-"+item.lineIndex).join(","),type,confidence:confidenceValue,reason,allocations:items.map(item=>({entryId:item.entryId,account:item.account,lineIndex:item.lineIndex,date:item.date,amount:round(type==="partial"?Math.abs(line.amount):item.remaining),currency:item.currency,label:item.label})),currency:items[0]?.currency||""};
}
export function analyzeBankLine(line,store,days=4,session=null) {
  const candidates=candidatesFor(line,store,days,session),target=Math.abs(round(line.amount)),suggestions=[];
  const exact=candidates.filter(item=>Math.abs(item.remaining-target)<=0.001);
  if(exact.length===1)suggestions.push(makeSuggestion("exact",exact,line,confidence(line,exact,"exact"),"Montant exact, devise identique et date compatible."));
  else if(exact.length>1)for(const item of exact.slice(0,3))suggestions.push(makeSuggestion("exact",[item],line,Math.max(45,confidence(line,[item],"exact")-25),"Plusieurs écritures ont le même montant : vérification manuelle nécessaire."));
  const pool=candidates.filter(item=>item.remaining<target-0.001).slice(0,24),combinations=[];let visits=0;
  const walk=(start,chosen,total)=>{
    if(++visits>6000||combinations.length>=12)return;
    if(chosen.length>=2&&Math.abs(round(total)-target)<=0.001){combinations.push([...chosen]);return;}
    if(chosen.length===4||total>=target)return;
    for(let i=start;i<pool.length;i++){const next=round(total+pool[i].remaining);if(next<=target+0.001)walk(i+1,[...chosen,pool[i]],next);if(visits>6000||combinations.length>=12)return;}
  };
  walk(0,[],0);
  const uniqueCombos=combinations.filter(combo=>!combo.some(item=>exact.some(single=>single.entryId===item.entryId&&single.lineIndex===item.lineIndex)));
  if(uniqueCombos.length===1)suggestions.push(makeSuggestion("grouped",uniqueCombos[0],line,confidence(line,uniqueCombos[0],"grouped"),"Plusieurs écritures réunies donnent exactement le montant bancaire."));
  else if(uniqueCombos.length>1)for(const combo of uniqueCombos.slice(0,2))suggestions.push(makeSuggestion("grouped",combo,line,Math.max(45,confidence(line,combo,"grouped")-25),"Plusieurs combinaisons sont possibles : choisir après contrôle."));
  const partial=candidates.filter(item=>item.remaining>target+0.001);
  if(partial.length===1)suggestions.push(makeSuggestion("partial",[partial[0]],line,confidence(line,[partial[0]],"partial"),"Règlement partiel possible ; le solde comptable restera ouvert."));
  else if(partial.length>1)for(const item of partial.slice(0,2))suggestions.push(makeSuggestion("partial",[item],line,Math.max(40,confidence(line,[item],"partial")-20),"Plusieurs écritures peuvent couvrir ce paiement partiel."));
  const discrepancies=candidates.map(item=>({...item,difference:round(Math.abs(item.remaining-target))})).filter(item=>item.difference>0.001).sort((a,b)=>a.difference-b.difference||a.delta-b.delta).slice(0,3);
  const diagnosis=diagnose(line),best=suggestions.sort((a,b)=>b.confidence-a.confidence)[0]||null;
  return {diagnosis,suggestions,confidence:best?.confidence||0,bestType:best?.type||null,discrepancies:discrepancies.map(item=>({entryId:item.entryId,account:item.account,date:item.date,difference:item.difference,entryAmount:item.signedAmount,currency:item.currency,deltaDays:Math.round(item.delta)})),feeCandidate:diagnosis.type==="bank_fee"&&line.status!=="matched",unmatched:line.status!=="matched"};
}
function diagnose(line) {
  const label=normalize(line.label);
  if(/frais|commission|agios|tenue de compte|frais bancaire/.test(label))return {type:"bank_fee",label:"Frais ou commission bancaire",hint:"Charge bancaire probable à vérifier"};
  if(/interet crediteur|interets recus|produit financier/.test(label))return {type:"financial_income",label:"Produit financier possible",hint:"Produit financier à vérifier"};
  if(/virement recu|versement|remise|encaissement|reglement client/.test(label)||Number(line.amount)>0)return {type:"receipt",label:"Encaissement possible",hint:"Identifier le client ou le produit"};
  if(/achat|paiement|prelevement|retrait|fournisseur|loyer/.test(label)||Number(line.amount)<0)return {type:"payment",label:"Décaissement possible",hint:"Identifier la charge ou le fournisseur"};
  return {type:"unknown",label:"Opération à qualifier",hint:"Choisir le compte de contrepartie"};
}
export function confirmBankMatchSuggestion(line,suggestion,session,store) {
  if(!suggestion||!["exact","grouped","partial"].includes(suggestion.type)||!Array.isArray(suggestion.allocations)||!suggestion.allocations.length)throw new Error("Suggestion de rapprochement invalide.");
  const target=Math.abs(round(line.amount)),allocations=[];let total=0,remainingAfter=0;
  for(const proposed of suggestion.allocations) {
    const entry=(store.entries||[]).find(item=>Number(item.id)===Number(proposed.entryId)),journalLine=entry?.lines?.[Number(proposed.lineIndex)];
    if(!entry||entry.reversed||entry.reverseOf||!journalLine||String(journalLine.account)!==String(proposed.account))throw new Error("Une écriture proposée a changé ou n'existe plus.");
    const signed=round((Number(journalLine.debit)||0)-(Number(journalLine.credit)||0)),currency=currencyOf(journalLine,store);
    if(Math.sign(signed)!==Math.sign(Number(line.amount))||currency!==currencyOf(line,store))throw new Error("Le sens ou la devise de l'écriture ne correspond plus au relevé.");
    const candidate={entryId:entry.id,account:String(journalLine.account),lineIndex:Number(proposed.lineIndex)};
    const already=allocationsUsed(session,line,candidate)+allocations.filter(item=>item.entryId===entry.id&&item.account===candidate.account&&item.lineIndex===candidate.lineIndex).reduce((sum,item)=>sum+item.amount,0);
    const available=round(Math.abs(signed)-already),requested=round(proposed.amount);
    if(requested<=0||requested>available+0.001)throw new Error("Le montant disponible sur une écriture est insuffisant.");
    total=round(total+requested);remainingAfter=round(remainingAfter+available-requested);
    allocations.push({entryId:entry.id,account:candidate.account,lineIndex:candidate.lineIndex,date:entry.date,amount:requested});
  }
  if(Math.abs(total-target)>0.001)throw new Error("Le total des écritures proposées ne correspond pas exactement au relevé.");
  if(suggestion.type==="exact"&&allocations.length!==1)throw new Error("Suggestion exacte invalide.");
  if(suggestion.type==="partial"&&allocations.length!==1)throw new Error("Suggestion partielle invalide.");
  return {...line,match:allocations[0].entryId,matchAccount:[...new Set(allocations.map(item=>item.account))].join(", "),matchDate:allocations[0].date,matches:allocations,matchedAmount:target,partial:remainingAfter>0.001,partialRemaining:remainingAfter,status:"matched",manuallyMatched:true,matchMethod:suggestion.type,matchConfidence:suggestion.confidence};
}
export function buildBankReconciliationReport(session,store) {
  const lines=session.lines||[],currencies={};let matched=0,unmatched=0,fees=0,discrepancies=0;
  const details=lines.map(line=>{
    const analysis=analyzeBankLine(line,store,session.days||4,session),currency=currencyOf(line,store)||"—";
    currencies[currency]||={count:0,matched:0,unmatched:0,bankTotal:0,matchedTotal:0};
    const bucket=currencies[currency];bucket.count++;bucket.bankTotal=round(bucket.bankTotal+Number(line.amount||0));
    if(line.status==="matched"){matched++;bucket.matched++;bucket.matchedTotal=round(bucket.matchedTotal+Number(line.amount||0));}else{unmatched++;bucket.unmatched++;}
    if(analysis.feeCandidate)fees++;if(analysis.discrepancies.length)discrepancies++;
    return {date:line.date,label:line.label,amount:round(line.amount),currency,status:line.status,match:line.matches?.map(item=>"#"+item.entryId).join(" + ")||(line.match?"#"+line.match:""),diagnosis:analysis.diagnosis.label,confidence:analysis.confidence,method:line.matchMethod||(line.manuallyMatched?"manual":"suggested"),suggestion:analysis.suggestions[0]?.reason||"",difference:analysis.discrepancies[0]?.difference||0};
  });
  return {sessionId:session.id||"",createdAt:session.createdAt||"",sourceFile:session.sourceFile||"Saisie manuelle",sourceFormat:session.sourceFormat||"manual",days:session.days||0,totals:{count:lines.length,matched,unmatched,fees,discrepancies,duplicates:session.duplicateRows||0,rejected:session.parseWarnings?.length||0},currencies,details};
}
export function bankReconciliationReportHTML(report) {
  const currencyRows=Object.entries(report.currencies).map(([currency,item])=>"<tr><td>"+escapeHTML(currency)+"</td><td>"+item.count+"</td><td>"+item.matched+"</td><td>"+item.unmatched+"</td><td>"+item.bankTotal.toFixed(2)+"</td><td>"+item.matchedTotal.toFixed(2)+"</td></tr>").join("");
  const detailRows=report.details.map(item=>"<tr><td>"+escapeHTML(item.date)+"</td><td>"+escapeHTML(item.label)+"</td><td>"+item.amount.toFixed(2)+" "+escapeHTML(item.currency)+"</td><td>"+escapeHTML(item.status==="matched"?"Rapprochée":"À vérifier")+"</td><td>"+escapeHTML(item.match)+"</td><td>"+escapeHTML(item.diagnosis)+"</td><td>"+item.confidence+"%</td><td>"+(item.difference?item.difference.toFixed(2):"—")+"</td></tr>").join("");
  return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Rapport de rapprochement bancaire</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}h2{font-size:16px;margin-top:24px}p{color:#4b5563}.kpis{display:flex;gap:18px;flex-wrap:wrap}.kpis span{border:1px solid #cbd5e1;padding:9px 12px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#eef2f7}@media print{body{margin:12mm}tr{break-inside:avoid}h2{break-after:avoid}}</style></head><body><h1>Rapport de rapprochement bancaire</h1><p>Relevé : "+escapeHTML(report.sourceFile)+" · Format : "+escapeHTML(report.sourceFormat)+" · Créé le : "+escapeHTML(report.createdAt)+" · Tolérance : ±"+report.days+" jour(s)</p><div class=\"kpis\"><span>Opérations : <b>"+report.totals.count+"</b></span><span>Rapprochées : <b>"+report.totals.matched+"</b></span><span>À vérifier : <b>"+report.totals.unmatched+"</b></span><span>Frais probables : <b>"+report.totals.fees+"</b></span><span>Écarts : <b>"+report.totals.discrepancies+"</b></span><span>Doublons ignorés : <b>"+report.totals.duplicates+"</b></span></div><h2>Synthèse par devise</h2><table><thead><tr><th>Devise</th><th>Opérations</th><th>Rapprochées</th><th>À vérifier</th><th>Total relevé</th><th>Total rapproché</th></tr></thead><tbody>"+currencyRows+"</tbody></table><h2>Détail des opérations</h2><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th><th>État</th><th>Écriture(s)</th><th>Nature indicative</th><th>Confiance</th><th>Écart</th></tr></thead><tbody>"+detailRows+"</tbody></table><p>Rapport indicatif. Les suggestions ne constituent pas une validation comptable. Les frais et écarts doivent être contrôlés avant toute régularisation.</p></body></html>";
}
