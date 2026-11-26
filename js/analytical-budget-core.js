// MIZANE — Pilotage budgétaire analytique intégré.
// Budgets et réalisations séparés par devise et axe. Aucun montant n'est converti.
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const m=String(value||"").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if(!m)return false;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
  return d.toISOString().slice(0,10)===value;
};
const currencyOf=(value,fallback)=>String(value||fallback||"MAD").trim().toUpperCase();
const dimensionKey=(type,id)=>String(type||"")+":"+String(id||"");

export function validateAnalyticalBudgets(lines=[],{centers=[],projects=[],accounts=[],baseCurrency="MAD"}={}){
 const errors=[],normalized=[],seen=new Set();
 const accountMap=new Map(accounts.map(a=>[String(a.code),a]));
 for(const [i,line] of (Array.isArray(lines)?lines:[]).entries()){
  const account=String(line?.account||"").trim(),type=String(line?.type||""),monthlyAmount=Number(line?.monthlyAmount);
  const dimensionType=String(line?.dimensionType||""),dimensionId=String(line?.dimensionId||"");
  const currency=currencyOf(line?.currency,baseCurrency);
  if(!/^\\d{1,12}$/.test(account))errors.push("Ligne "+(i+1)+" : compte invalide.");
  if(!["expense","income"].includes(type))errors.push("Ligne "+(i+1)+" : nature comptable invalide.");
  const known=accountMap.get(account);
  if(known&&known.type!==type)errors.push("Ligne "+(i+1)+" : la nature ne correspond pas au compte.");
  if(!Number.isFinite(monthlyAmount)||monthlyAmount<=0||monthlyAmount>999999999999)errors.push("Ligne "+(i+1)+" : budget mensuel positif requis.");
  if(!["department","center","project"].includes(dimensionType))errors.push("Ligne "+(i+1)+" : axe analytique invalide.");
  if(!dimensionId)errors.push("Ligne "+(i+1)+" : axe analytique obligatoire.");
  if(dimensionType==="center"&&!centers.some(x=>String(x.id)===dimensionId))errors.push("Ligne "+(i+1)+" : centre analytique introuvable.");
  if(dimensionType==="project"&&!projects.some(x=>String(x.id)===dimensionId))errors.push("Ligne "+(i+1)+" : projet introuvable.");
  if(dimensionType==="department"&&!projects.some(x=>String(x.department||"").trim()===dimensionId))errors.push("Ligne "+(i+1)+" : département introuvable.");
  if(!/^[A-Z]{3}$/.test(currency))errors.push("Ligne "+(i+1)+" : devise ISO à trois lettres requise.");
  const key=[account,type,dimensionKey(dimensionType,dimensionId),currency].join("|");
  if(seen.has(key))errors.push("Une ligne budgétaire identique existe déjà pour cet axe et cette devise.");
  for(const prior of normalized){
   if(prior.type===type&&prior.dimensionType===dimensionType&&prior.dimensionId===dimensionId&&prior.currency===currency&&(account.startsWith(prior.account)||prior.account.startsWith(account)))errors.push("Les comptes "+account+" et "+prior.account+" se chevauchent sur le même axe.");
  }
  if(account&&["expense","income"].includes(type)&&Number.isFinite(monthlyAmount)&&monthlyAmount>0&&["department","center","project"].includes(dimensionType)&&dimensionId&&/^[A-Z]{3}$/.test(currency)){
   seen.add(key);normalized.push({id:String(line.id||"").slice(0,100),account,type,monthlyAmount:round2(monthlyAmount),label:String(line.label||account).slice(0,120),dimensionType,dimensionId,currency});
  }
 }
 return{ok:errors.length===0,errors,lines:normalized};
}

export function buildAnalyticalBudgetReport({lines=[],entries=[],allocations=[],centers=[],projects=[],accounts=[],startDate,endDate,asOf,baseCurrency="MAD"}={}){
 if(!validDate(startDate)||!validDate(endDate)||startDate>endDate||!validDate(asOf)||asOf<startDate)return{ok:false,errors:["Période budgétaire ou date de référence invalide."],dimensions:[],currencies:[],lines:[],alerts:[]};
 const validation=validateAnalyticalBudgets(lines,{centers,projects,accounts,baseCurrency});
 if(!validation.ok)return{ok:false,errors:validation.errors,dimensions:[],currencies:[],lines:[],alerts:[]};
 const months=[],cursor=new Date(startDate+"T00:00:00Z");
 cursor.setUTCDate(1);
 while(cursor.toISOString().slice(0,10)<=endDate){
  const key=cursor.toISOString().slice(0,7),first=key+"-01";
  const last=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,0)).toISOString().slice(0,10);
  if(last>=startDate&&first<=endDate)months.push(key);
  cursor.setUTCMonth(cursor.getUTCMonth()+1);
 }
 const dimName=(type,id)=>{
  if(type==="center")return centers.find(x=>String(x.id)===id)?.name||"Centre supprimé";
  if(type==="project"){const p=projects.find(x=>String(x.id)===id);return p?.name||"Projet supprimé";}
  return id;
 };
 const monthMap=new Map(months.map(m=>[m,{}]));
 const rows=validation.lines.map(line=>{
  const key=[line.account,line.type,line.dimensionType,line.dimensionId,line.currency].join("|");
  const actualByMonth=Object.fromEntries(months.map(m=>[m,0]));
  const relevant=allocations.filter(a=>{
   const e=entries.find(x=>String(x.id)===String(a.entryId)),l=e?.lines?.[Number(a.lineIndex)];
   if(!e||!l||e.reversed||!validDate(e.date)||e.date<startDate||e.date>endDate)return false;
   if(currencyOf(e.currency,baseCurrency)!==line.currency||!String(l.account||"").startsWith(line.account))return false;
   if(line.dimensionType==="center")return String(a.centerId)===line.dimensionId;
   if(line.dimensionType==="project")return String(a.projectId||"")===line.dimensionId;
   const p=projects.find(x=>String(x.id)===String(a.projectId));
   return String(p?.department||"").trim()===line.dimensionId;
  });
  for(const a of relevant){
   const e=entries.find(x=>String(x.id)===String(a.entryId)),l=e.lines[Number(a.lineIndex)];
   const pct=Number(a.percentage),debit=Number(l.debit||0),credit=Number(l.credit||0);
   if(!Number.isFinite(pct)||pct<=0||pct>100||!Number.isFinite(debit)||!Number.isFinite(credit))continue;
   const actual=line.type==="expense"?debit-credit:credit-debit;
   const m=String(e.date).slice(0,7);
   if(Object.hasOwn(actualByMonth,m))actualByMonth[m]=round2(actualByMonth[m]+actual*pct/100);
  }
  const monthly=months.map(month=>({month,budget:line.monthlyAmount,actual:actualByMonth[month],variance:round2(line.type==="expense"?line.monthlyAmount-actualByMonth[month]:actualByMonth[month]-line.monthlyAmount)}));
  const budgetTotal=round2(line.monthlyAmount*months.length),actualTotal=round2(monthly.reduce((s,x)=>s+x.actual,0)),variance=round2(line.type==="expense"?budgetTotal-actualTotal:actualTotal-budgetTotal);
  const elapsed=months.filter(m=>m<=asOf.slice(0,7)),remaining=months.filter(m=>m>asOf.slice(0,7));
  const actualToDate=round2(monthly.filter(x=>x.month<=asOf.slice(0,7)).reduce((s,x)=>s+x.actual,0));
  const budgetToDate=round2(line.monthlyAmount*elapsed.length),runRate=elapsed.length?round2(actualToDate/elapsed.length):0;
  const projected=round2(actualToDate+runRate*remaining.length),projectedVariance=round2(line.type==="expense"?budgetTotal-projected:projected-budgetTotal);
  const ratio=budgetTotal>0?round2(projected/budgetTotal*100):null;
  const severity=ratio===null?"info":line.type==="expense"?(ratio>110?"critical":ratio>102?"warning":"ok"):(ratio<90?"critical":ratio<98?"warning":"ok");
  return{...line,key,dimensionName:dimName(line.dimensionType,line.dimensionId),budgetTotal,actualTotal,variance,varianceRate:budgetTotal?round2(variance/budgetTotal*100):null,actualToDate,budgetToDate,projected,projectedVariance,executionRate:budgetTotal?round2(actualToDate/budgetToDate*100):null,forecastExecutionRate:ratio,severity,monthly};
 });
 const grouped=new Map();
 for(const row of rows){
  const key=[row.dimensionType,row.dimensionId,row.currency].join("|");
  if(!grouped.has(key))grouped.set(key,{dimensionType:row.dimensionType,dimensionId:row.dimensionId,name:row.dimensionName,currency:row.currency,budget:0,actual:0,variance:0,projected:0,projectedVariance:0,expensesBudget:0,expensesActual:0,incomeBudget:0,incomeActual:0,lineCount:0});
  const g=grouped.get(key);g.budget=round2(g.budget+row.budgetTotal);g.actual=round2(g.actual+row.actualTotal);g.variance=round2(g.variance+row.variance);g.projected=round2(g.projected+row.projected);g.projectedVariance=round2(g.projectedVariance+row.projectedVariance);g.lineCount++;
  if(row.type==="expense"){g.expensesBudget=round2(g.expensesBudget+row.budgetTotal);g.expensesActual=round2(g.expensesActual+row.actualTotal);}else{g.incomeBudget=round2(g.incomeBudget+row.budgetTotal);g.incomeActual=round2(g.incomeActual+row.actualTotal);}
 }
 const dimensions=[...grouped.values()].map(g=>({...g,resultBudget:round2(g.incomeBudget-g.expensesBudget),resultActual:round2(g.incomeActual-g.expensesActual),resultVariance:round2((g.incomeActual-g.expensesActual)-(g.incomeBudget-g.expensesBudget)),marginRate:g.incomeActual?round2((g.incomeActual-g.expensesActual)/g.incomeActual*100):null})).sort((a,b)=>a.name.localeCompare(b.name,"fr")||a.currency.localeCompare(b.currency));
 const currencies=[...new Set(rows.map(x=>x.currency))].map(currency=>{
  const subset=rows.filter(x=>x.currency===currency),sum=k=>round2(subset.reduce((s,x)=>s+x[k],0));
  const incomeBudget=sum("budgetTotal")-sum("budgetTotal"); // replaced below with typed sums
  const expenses=subset.filter(x=>x.type==="expense"),income=subset.filter(x=>x.type==="income");
  const eb=round2(expenses.reduce((s,x)=>s+x.budgetTotal,0)),ea=round2(expenses.reduce((s,x)=>s+x.actualTotal,0)),ib=round2(income.reduce((s,x)=>s+x.budgetTotal,0)),ia=round2(income.reduce((s,x)=>s+x.actualTotal,0));
  const ep=round2(expenses.reduce((s,x)=>s+x.projected,0)),ip=round2(income.reduce((s,x)=>s+x.projected,0));
  return{currency,budgetExpenses:eb,actualExpenses:ea,budgetIncome:ib,actualIncome:ia,expenseVariance:round2(eb-ea),incomeVariance:round2(ia-ib),budgetResult:round2(ib-eb),actualResult:round2(ia-ea),projectedExpenses:ep,projectedIncome:ip,projectedResult:round2(ip-ep),projectedExpenseVariance:round2(eb-ep),projectedIncomeVariance:round2(ip-ib)};
 });
 const alerts=rows.filter(x=>["warning","critical"].includes(x.severity)).map(x=>({key:x.key,dimensionName:x.dimensionName,dimensionType:x.dimensionType,currency:x.currency,account:x.account,type:x.type,severity:x.severity,projectedVariance:x.projectedVariance,forecastExecutionRate:x.forecastExecutionRate}));
 const monthly=months.map(month=>{
  const subset=rows.flatMap(r=>r.monthly.filter(x=>x.month===month).map(x=>({...x,type:r.type,currency:r.currency})));
  const byCurrency={};
  for(const x of subset){if(!byCurrency[x.currency])byCurrency[x.currency]={budgetExpenses:0,actualExpenses:0,budgetIncome:0,actualIncome:0};const k=x.type==="expense"?"Expenses":"Income";byCurrency[x.currency]["budget"+k]=round2(byCurrency[x.currency]["budget"+k]+x.budget);byCurrency[x.currency]["actual"+k]=round2(byCurrency[x.currency]["actual"+k]+x.actual);}
  return{month,byCurrency};
 });
 return{ok:true,errors:[],period:{startDate,endDate,asOf},months:monthly,dimensions,currencies,lines:rows,alerts,elapsedMonths:months.filter(m=>m<=asOf.slice(0,7)).length,remainingMonths:months.filter(m=>m>asOf.slice(0,7)).length};
}
