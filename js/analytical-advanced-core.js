// MIZANE — Moteur avancé de comptabilité analytique.
const r2=n=>Math.round((Number(n||0)+Number.EPSILON)*100)/100;
export function validateAllocationKey(key,centers=[]){const errors=[];if(!String(key?.name||"").trim()||key.name.length>100)errors.push("Nom de clé obligatoire (100 caractères maximum).");if(!Array.isArray(key?.shares)||!key.shares.length)errors.push("La clé doit contenir au moins un centre.");const seen=new Set();let total=0;for(const s of key?.shares||[]){const c=centers.find(x=>x.id===s.centerId),p=Number(s.percentage);if(!c)errors.push("Centre inexistant.");if(seen.has(s.centerId))errors.push("Centre dupliqué dans la clé.");seen.add(s.centerId);if(!Number.isFinite(p)||p<=0||p>100)errors.push("Chaque part doit être comprise entre 0 et 100, strictement.");total+=Number.isFinite(p)?p:0;}if(Math.abs(total-100)>1e-6)errors.push("La somme des parts doit être égale à 100 %.");return{ok:!errors.length,errors,total:r2(total)};}
export function applyAllocationKey({key,entryId,lineIndex,centers=[],allocations=[],entries=[],accountTypes={},projectId=null}={}){const v=validateAllocationKey(key,centers);if(!v.ok)return{ok:false,errors:v.errors,allocations:[]};if(allocations.some(x=>String(x.entryId)===String(entryId)&&Number(x.lineIndex)===Number(lineIndex)&&x.allocationKeyId===key.id))return{ok:false,errors:["Clé déjà appliquée à cette ligne."],allocations:[]};const e=entries.find(x=>String(x.id)===String(entryId)),l=e?.lines?.[Number(lineIndex)];if(!e||e.reversed||!l)return{ok:false,errors:["Ligne absente ou contrepassée."],allocations:[]};const type=accountTypes[String(l.account)];if(!["expense","income"].includes(type))return{ok:false,errors:["Seules les charges et les produits sont admissibles."],allocations:[]};const used=allocations.filter(x=>String(x.entryId)===String(entryId)&&Number(x.lineIndex)===Number(lineIndex)).reduce((s,x)=>s+Number(x.percentage||0),0);if(used>=99.999999)return{ok:false,errors:["La ligne ne comporte plus de part disponible."],allocations:[]};for(const s of key.shares){const c=centers.find(x=>x.id===s.centerId);if((c.type==="cost"&&type!=="expense")||(c.type==="profit"&&type!=="income"))return{ok:false,errors:["Type de centre incompatible : "+c.name+"."],allocations:[]};}const now=new Date().toISOString();return{ok:true,errors:[],allocations:key.shares.map((s,i)=>({id:"al-key-"+Date.now().toString(36)+"-"+i+"-"+Math.random().toString(36).slice(2,6),entryId,lineIndex:Number(lineIndex),centerId:s.centerId,projectId:projectId||null,percentage:r2((100-used)*Number(s.percentage)/100),allocationKeyId:key.id,allocationKeyName:key.name,createdAt:now}))};}
export function calculateBreakEven({sellingPrice=0,variableCost=0,fixedCosts=0,actualUnits=0}={}){const p=Number(sellingPrice),v=Number(variableCost),f=Number(fixedCosts),u=Number(actualUnits),errors=[];if(![p,v,f,u].every(Number.isFinite))errors.push("Valeurs numériques requises.");if(p<=0)errors.push("Prix de vente unitaire supérieur à zéro requis.");if(v<0||f<0||u<0)errors.push("Coûts et quantités non négatifs requis.");if(p<=v)errors.push("Le prix doit dépasser le coût variable unitaire.");if(errors.length)return{ok:false,errors};const m=r2(p-v),n=Math.ceil(f/m),s=r2(u-n);return{ok:true,contributionPerUnit:m,contributionRate:r2(m/p*100),breakEvenUnits:n,breakEvenRevenue:r2(n*p),estimatedResult:r2(u*m-f),marginOfSafetyUnits:s,marginOfSafetyRate:u>0?r2(s/u*100):null,status:u>=n?"above":"below"};}

const validDate = value => /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value||"")) && !Number.isNaN(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
export function validateAnalyticalProject(project,projects=[]){
 const errors=[],name=String(project?.name||"").trim(),quantity=project?.quantity;
 if(!name||name.length>120)errors.push("Le nom du projet est obligatoire (120 caractères maximum).");
 if(projects.some(p=>p.id!==project?.id&&String(p.name).toLocaleLowerCase()===name.toLocaleLowerCase()))errors.push("Un projet porte déjà ce nom.");
 if(quantity!==null&&quantity!==undefined&&quantity!==""&&(!Number.isFinite(Number(quantity))||Number(quantity)<=0))errors.push("La quantité de référence doit être strictement positive.");
 if(quantity!==null&&quantity!==undefined&&quantity!==""&&!String(project?.unitLabel||"").trim())errors.push("L'unité de la quantité est obligatoire.");
 return{ok:errors.length===0,errors};
}
export function buildProjectAnalyticalReport({projects=[],allocations=[],entries=[],accountTypes={},startDate="",endDate="",baseCurrency="MAD"}={}){
 const grouped=new Map(),issues=[];
 for(const a of allocations){
  if(!a.projectId)continue;
  const e=entries.find(x=>String(x.id)===String(a.entryId)),line=e?.lines?.[Number(a.lineIndex)],project=projects.find(x=>x.id===a.projectId);
  if(!project||!e||!line||e.reversed){issues.push({allocationId:a.id,message:"Affectation de projet orpheline ou liée à une écriture contrepassée."});continue;}
  if((startDate&&e.date<startDate)||(endDate&&e.date>endDate))continue;
  const pct=Number(a.percentage),type=accountTypes[String(line.account)];
  if(!Number.isFinite(pct)||pct<=0||pct>100||!["expense","income"].includes(type)){issues.push({allocationId:a.id,message:"Affectation de projet invalide."});continue;}
  const currency=String(e.currency||baseCurrency||"MAD").toUpperCase();
  const key=project.id+"::"+currency;
  if(!grouped.has(key))grouped.set(key,{projectId:project.id,name:project.name,activity:project.activity||"",department:project.department||"",quantity:project.quantity===null||project.quantity===undefined||project.quantity===""?null:Number(project.quantity),unitLabel:project.unitLabel||"",currency,income:0,expenses:0,allocations:0});
  const row=grouped.get(key),signed=type==="expense"?Number(line.debit||0)-Number(line.credit||0):Number(line.credit||0)-Number(line.debit||0),amount=r2(signed*pct/100);
  if(type==="expense")row.expenses=r2(row.expenses+amount);else row.income=r2(row.income+amount);
  row.allocations++;
 }
 const rows=[...grouped.values()].map(row=>{const result=r2(row.income-row.expenses);return{...row,result,costPerUnit:row.quantity? r2(row.expenses/row.quantity):null,incomePerUnit:row.quantity?r2(row.income/row.quantity):null,resultPerUnit:row.quantity?r2(result/row.quantity):null,marginRate:row.income? r2(result/row.income*100):null};}).sort((a,b)=>a.name.localeCompare(b.name,"fr")||a.currency.localeCompare(b.currency));
 return{ok:true,period:{startDate,endDate},rows,issues};
}
export function buildProjectComparison({projects=[],allocations=[],entries=[],accountTypes={},currentStart="",currentEnd="",compareStart="",compareEnd="",baseCurrency="MAD"}={}){
 const errors=[];
 if(!validDate(compareStart)||!validDate(compareEnd)||compareStart>compareEnd)errors.push("La période de comparaison doit comporter deux dates valides et cohérentes.");
 if(currentStart&&(!validDate(currentStart)||!validDate(currentEnd)||currentStart>currentEnd))errors.push("La période de référence est invalide.");
 if(errors.length)return{ok:false,errors,rows:[]};
 const current=buildProjectAnalyticalReport({projects,allocations,entries,accountTypes,startDate:currentStart,endDate:currentEnd,baseCurrency});
 const comparison=buildProjectAnalyticalReport({projects,allocations,entries,accountTypes,startDate:compareStart,endDate:compareEnd,baseCurrency});
 const index=rows=>new Map(rows.map(row=>[row.projectId+"::"+row.currency,row]));
 const a=index(current.rows),b=index(comparison.rows),keys=new Set([...a.keys(),...b.keys()]);
 const rows=[...keys].map(key=>{const x=a.get(key),y=b.get(key),p=projects.find(item=>item.id===(x||y).projectId),zero={income:0,expenses:0,result:0};const cur=x||{...zero},prev=y||{...zero};return{projectId:p.id,name:p.name,currency:(x||y).currency,current:{income:cur.income,expenses:cur.expenses,result:cur.result},comparison:{income:prev.income,expenses:prev.expenses,result:prev.result},variance:r2(cur.result-prev.result)};}).sort((x,y)=>x.name.localeCompare(y.name,"fr")||x.currency.localeCompare(y.currency));
 return{ok:true,rows,currentPeriod:{startDate:currentStart,endDate:currentEnd},comparisonPeriod:{startDate:compareStart,endDate:compareEnd}};
}
