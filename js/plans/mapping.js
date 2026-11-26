// MIZANE — Versions, correspondances inter-plans et simulation sans mutation.
const ID=/^[a-z0-9][a-z0-9._-]{1,79}$/i, DATE=/^\d{4}-\d{2}-\d{2}$/;
const VSTATUS=new Set(["draft","verified","superseded","archived"]), RSTATUS=new Set(["draft","reviewed","approved"]), REL=new Set(["exact","one-to-many","many-to-one","unmapped"]);
const text=(v,n,k,req=false)=>{const s=String(v??"").trim();if(req&&!s)throw Error(k+" obligatoire.");if(s.length>n)throw Error(k+" trop long.");return s;};
const dateOK=v=>{if(!v)return true;if(!DATE.test(v))return false;const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
function plan(c,id,label){const p=c?.[id];if(!p||!Array.isArray(p.accounts))throw Error(label+" inconnu ou sans comptes.");return p;}
function accountMap(p){return new Map(p.accounts.map(a=>Array.isArray(a)?[String(a[0]),{code:String(a[0]),label:String(a[1]),type:String(a[2])}]:[String(a.code),a]));}
export function validatePlanVersion(v,c){
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Fiche de version invalide.");
 const planId=text(v.planId,80,"Référentiel",true);plan(c,planId,"Référentiel");
 const versionId=text(v.versionId,80,"Version",true);if(!ID.test(versionId))throw Error("Identifiant de version invalide.");
 const effectiveFrom=text(v.effectiveFrom,10,"Date d'effet"),effectiveTo=text(v.effectiveTo,10,"Date de fin");
 if(!dateOK(effectiveFrom)||!dateOK(effectiveTo))throw Error("Date de version invalide.");
 if(effectiveFrom&&effectiveTo&&effectiveTo<effectiveFrom)throw Error("La date de fin précède la date d'effet.");
 const sourceUrl=text(v.sourceUrl,1000,"URL source");if(sourceUrl&&!/^https:\/\//i.test(sourceUrl))throw Error("La source doit être une URL HTTPS.");
 return {id:planId+"@"+versionId,planId,versionId,label:text(v.label,120,"Libellé",true),effectiveFrom,effectiveTo,authority:text(v.authority,180,"Autorité"),sourceLabel:text(v.sourceLabel,180,"Source"),sourceUrl,status:VSTATUS.has(v.status)?v.status:"draft",notes:text(v.notes,1000,"Notes"),createdAt:String(v.createdAt||new Date().toISOString()),updatedAt:String(v.updatedAt||new Date().toISOString())};
}
export function validatePlanVersions(input,c){if(input==null)return [];if(!Array.isArray(input)||input.length>500)throw Error("Maximum 500 versions.");const ids=new Set();return input.map(v=>{const x=validatePlanVersion(v,c);if(ids.has(x.id))throw Error("Version dupliquée : "+x.id);ids.add(x.id);return x;});}
export function validatePlanMapping(m,c,versions=[]){
 if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Fiche de correspondance invalide.");
 const id=text(m.id,80,"Identifiant",true);if(!ID.test(id))throw Error("Identifiant invalide.");
 const sourcePlanId=text(m.sourcePlanId,80,"Plan source",true),targetPlanId=text(m.targetPlanId,80,"Plan cible",true);if(sourcePlanId===targetPlanId)throw Error("Les plans doivent être différents.");
 const src=accountMap(plan(c,sourcePlanId,"Plan source")),dst=accountMap(plan(c,targetPlanId,"Plan cible"));
 const sourceVersionId=text(m.sourceVersionId,80,"Version source"),targetVersionId=text(m.targetVersionId,80,"Version cible");
 if(sourceVersionId&&!versions.some(v=>v.planId===sourcePlanId&&v.versionId===sourceVersionId))throw Error("Version source introuvable.");
 if(targetVersionId&&!versions.some(v=>v.planId===targetPlanId&&v.versionId===targetVersionId))throw Error("Version cible introuvable.");
 if(!Array.isArray(m.rules)||m.rules.length>10000)throw Error("Règles invalides.");
 const ids=new Set(),used=new Set();
 const rules=m.rules.map((r,i)=>{
  const rid=text(r.id||"rule-"+(i+1),80,"Identifiant règle",true);if(!ID.test(rid)||ids.has(rid))throw Error("Identifiant de règle dupliqué ou invalide.");ids.add(rid);
  const relation=REL.has(r.relation)?r.relation:"exact",sourceCodes=[...new Set((r.sourceCodes||[]).map(String))],targetCodes=[...new Set((r.targetCodes||[]).map(String))];
  if(!sourceCodes.length||sourceCodes.some(x=>!src.has(x)))throw Error("Règle "+rid+" : compte source absent.");
  for(const code of sourceCodes){if(used.has(code))throw Error("Compte source affecté à plusieurs règles : "+code);used.add(code);}
  if(relation==="unmapped"){if(targetCodes.length)throw Error("Une règle non rapprochée ne doit pas avoir de cible.");}
  else{
   if(!targetCodes.length||targetCodes.some(x=>!dst.has(x)))throw Error("Règle "+rid+" : compte cible absent.");
   if(relation==="exact"&&(sourceCodes.length!==1||targetCodes.length!==1))throw Error("Correspondance exacte : un compte vers un compte.");
   if(relation==="one-to-many"&&(sourceCodes.length!==1||targetCodes.length<2))throw Error("Correspondance un-vers-plusieurs invalide.");
   if(relation==="many-to-one"&&(sourceCodes.length<2||targetCodes.length!==1))throw Error("Correspondance plusieurs-vers-un invalide.");
   for(const a of sourceCodes)for(const b of targetCodes)if(src.get(a).type!==dst.get(b).type)throw Error("Types comptables incompatibles : "+a+" → "+b);
  }
  const allocations=(r.allocations||[]).map(a=>({targetCode:String(a.targetCode),percent:Number(a.percent)}));
  if(relation==="one-to-many"&&(allocations.length!==targetCodes.length||allocations.some(a=>!targetCodes.includes(a.targetCode)||!Number.isFinite(a.percent)||a.percent<=0)||new Set(allocations.map(a=>a.targetCode)).size!==targetCodes.length||Math.abs(allocations.reduce((s,a)=>s+a.percent,0)-100)>1e-6))throw Error("La répartition doit couvrir les cibles et totaliser 100 %.");
  if(relation!=="one-to-many"&&allocations.length)throw Error("Répartition réservée au un-vers-plusieurs.");
  return {id:rid,relation,sourceCodes,targetCodes,allocations,status:RSTATUS.has(r.status)?r.status:"draft",note:text(r.note,500,"Note"),sourceRef:text(r.sourceRef,500,"Justification")};
 });
 return {id,sourcePlanId,targetPlanId,sourceVersionId,targetVersionId,label:text(m.label,120,"Libellé",true),status:RSTATUS.has(m.status)?m.status:"draft",rules,createdAt:String(m.createdAt||new Date().toISOString()),updatedAt:String(m.updatedAt||new Date().toISOString())};
}
export function validatePlanMappings(input,c,versions=[]){if(input==null)return [];if(!Array.isArray(input)||input.length>200)throw Error("Maximum 200 correspondances.");const ids=new Set();return input.map(m=>{const x=validatePlanMapping(m,c,versions);if(ids.has(x.id))throw Error("Correspondance dupliquée : "+x.id);ids.add(x.id);return x;});}
export function dryRunPlanMigration({entries=[],sourcePlan,targetPlan,mapping,sourceVersionId="",targetVersionId=""}){
 const errors=[],warnings=[],unmapped=[],migrated=[];if(!sourcePlan||!targetPlan||!mapping)return {ok:false,canApply:false,errors:["Plans ou correspondance manquants."],warnings,unmapped,entries:[]};
 if(mapping.sourcePlanId!==sourcePlan.id||mapping.targetPlanId!==targetPlan.id)errors.push("Correspondance incompatible avec les plans.");
 if(mapping.sourceVersionId&&mapping.sourceVersionId!==sourceVersionId)errors.push("Version source incompatible.");
 if(mapping.targetVersionId&&mapping.targetVersionId!==targetVersionId)errors.push("Version cible incompatible.");
 const dst=accountMap(targetPlan),rules=new Map();for(const r of mapping.rules||[]){if(r.status==="approved")for(const c of r.sourceCodes)rules.set(c,r);else warnings.push("Règle "+r.id+" ignorée : non approuvée.");}
 for(const entry of entries){const lines=[],issues=[];for(const line of entry.lines||[]){const r=rules.get(String(line.account));if(!r||r.relation==="unmapped"){unmapped.push({entryId:entry.id,account:String(line.account)});issues.push("Compte "+line.account+" non rapproché.");continue;}
 const dest=r.relation==="one-to-many"?r.allocations:[{targetCode:r.targetCodes[0],percent:100}];let dUsed=0,cUsed=0;
 dest.forEach((d,i)=>{const last=i===dest.length-1,debit=last?Number(line.debit||0)-dUsed:Math.round(Number(line.debit||0)*d.percent)/100,credit=last?Number(line.credit||0)-cUsed:Math.round(Number(line.credit||0)*d.percent)/100;dUsed+=debit;cUsed+=credit;const a=dst.get(d.targetCode);if(!a){issues.push("Cible "+d.targetCode+" absente.");return;}lines.push({...line,account:d.targetCode,label:a.label,debit:Math.round(debit*100)/100,credit:Math.round(credit*100)/100});});}
 const debit=Math.round(lines.reduce((s,l)=>s+l.debit,0)*100)/100,credit=Math.round(lines.reduce((s,l)=>s+l.credit,0)*100)/100;if(Math.abs(debit-credit)>.01)issues.push("Écriture simulée déséquilibrée.");
 if(issues.length)errors.push("Écriture "+entry.id+" bloquée : "+[...new Set(issues)].join(" "));else migrated.push({...entry,lines});}
 return {ok:errors.length===0,canApply:errors.length===0&&unmapped.length===0,errors,warnings,unmapped,entries:migrated,sourceEntryCount:entries.length,migratedEntryCount:migrated.length,blockedEntryCount:entries.length-migrated.length};
}
