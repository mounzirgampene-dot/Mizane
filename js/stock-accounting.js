// MIZANE — Comptabilisation des mouvements de stock et du coût des ventes.
import { validateEntry } from "./accounting.js";
import { postBillingJournalEntriesAtomically } from "./billing-accounting.js";

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function accountsFor(targetStore) {
  const values = [
    ...(targetStore.__accountCache ? Object.entries(targetStore.__accountCache).map(([code, account]) => ({ code, ...account })) : []),
    ...((targetStore.settings && targetStore.settings.customAccounts) || []),
  ];
  return [...new Map(values.map(account => [String(account.code), account])).values()];
}

function existingReference(targetStore, reference) {
  return (targetStore.entries || []).find(entry => entry.reference === reference);
}

function requireAccount(accounts, code, type, _label) {
  const selected = String(code || "").trim();
  return selected && accounts.some(account => String(account.code) === selected && account.type === type)
    ? selected
    : "";
}

export function buildSalesStockCostJournalEntry(targetStore, document, movements, mapping = {}, accountingMode = "perpetual") {
  if (accountingMode === "periodic") return { ok:true, skipped:true, entries:[], cost:0, errors:[] };
  if (!document?.document_id || !Array.isArray(movements) || !movements.length) {
    return { ok:false, entries:[], errors:["Mouvement de stock introuvable pour la comptabilisation du coût des ventes."] };
  }
  const related = movements.filter(item => String(item.document_id) === String(document.document_id) && Number(item.quantity_delta) < 0);
  if (!related.length) return { ok:false, entries:[], errors:["Aucune sortie valorisée n'est associée au document de stock."] };
  const cost = round2(related.reduce((sum,item) => sum + Math.abs(Number(item.value_delta || 0)),0));
  if (!(cost > 0) || !Number.isFinite(cost)) {
    return { ok:false, entries:[], cost, errors:["Le coût de sortie est nul ou non valorisé ; aucune écriture automatique n'a été créée."] };
  }
  const reference = "COUT STOCK VENTE " + String(document.operation_uid || document.document_id);
  const existing = existingReference(targetStore,reference);
  if (existing) return { ok:true, duplicate:true, entries:[], cost, reference, existing };
  const accounts = accountsFor(targetStore);
  const inventory = requireAccount(accounts,mapping.inventory,"asset","stock");
  const cogs = requireAccount(accounts,mapping.cogs,"expense","coût des ventes");
  if (!inventory) return {ok:false,entries:[],cost,errors:["Configurez un compte de stock (actif) dans les paramètres de facturation."]};
  if (!cogs) return {ok:false,entries:[],cost,errors:["Configurez un compte de coût des ventes (charge) dans les paramètres de facturation."]};
  const entry = {
    date:document.document_date || related[0].movement_date,
    journal:"OD",reference,
    lines:[
      {account:cogs,label:"Coût des marchandises sorties — "+String(document.reference || document.document_id),third:"",debit:cost,credit:0},
      {account:inventory,label:"Diminution du stock — "+String(document.reference || document.document_id),third:"",debit:0,credit:cost},
    ],
  };
  const validation = validateEntry(targetStore,entry);
  if (!validation.ok) return {ok:false,entries:[],cost,errors:validation.errors};
  return {ok:true,entries:[entry],cost,reference,errors:[]};
}

const ISSUE_REASONS = new Set(["internal_consumption","damage","loss","theft","expiry","other"]);

export function buildStockOperationJournalEntry(targetStore, document, movements, mapping = {}, accountingMode = "perpetual", reasonCode = "other") {
  const sourceType = String(document?.source_type || "");
  const documentType = String(document?.document_type || "");
  if (accountingMode === "periodic") return {ok:true,skipped:true,entries:[],errors:[]};
  if (!["manual_stock","inventory_count"].includes(sourceType) || !["issue","adjustment"].includes(documentType)) {
    return {ok:true,skipped:true,entries:[],errors:[]};
  }
  if (!document?.id || !document?.operation_uid || !Array.isArray(movements)) {
    return {ok:false,entries:[],errors:["Document ou mouvements de stock introuvables pour la comptabilisation."]};
  }
  const related = movements.filter(item => String(item.document_id) === String(document.id));
  if (!related.length) return {ok:false,entries:[],errors:["Aucun mouvement n'est associé à cette opération de stock."]};
  const negative = round2(related.filter(item=>Number(item.quantity_delta)<0).reduce((sum,item)=>sum+Math.abs(Number(item.value_delta||0)),0));
  const positive = round2(related.filter(item=>Number(item.quantity_delta)>0).reduce((sum,item)=>sum+Math.abs(Number(item.value_delta||0)),0));
  if (!(negative>0 || positive>0) || !Number.isFinite(negative+positive)) {
    return {ok:false,entries:[],errors:["La valeur réelle des mouvements est nulle ou indisponible ; aucune écriture approximative n'a été créée."]};
  }
  const reference = (sourceType==="inventory_count" ? "ECART INVENTAIRE " : documentType==="adjustment" ? "AJUSTEMENT STOCK " : "SORTIE STOCK ") + String(document.operation_uid);
  const existing = existingReference(targetStore,reference);
  if(existing) return {ok:true,duplicate:true,entries:[],reference,existing};
  const accounts=accountsFor(targetStore);
  const inventory=requireAccount(accounts,mapping.inventory,"asset","stock");
  if(!inventory) return {ok:false,entries:[],errors:["Configurez un compte de stock (actif) dans les paramètres de facturation."]};
  const lines=[];
  const add=(account,label,debit,credit)=>{if(debit>0||credit>0)lines.push({account,label,third:"",debit,credit});};
  if(documentType==="issue"){
    if(!ISSUE_REASONS.has(reasonCode)) return {ok:false,entries:[],errors:["Le motif de la sortie manuelle est invalide."]};
    const expenseKey=reasonCode==="internal_consumption"?"stockConsumption":"stockLoss";
    const expenseLabel=reasonCode==="internal_consumption"?"consommation interne":"pertes et dépréciations de stock";
    const expense=requireAccount(accounts,mapping[expenseKey],"expense",expenseLabel);
    if(!expense) return {ok:false,entries:[],errors:[reasonCode==="internal_consumption"?"Configurez le compte de consommation interne (charge).":"Configurez le compte de pertes de stock (charge)."]};
    if(positive>0) return {ok:false,entries:[],errors:["Une sortie manuelle contient un mouvement positif inattendu."]};
    add(expense,expenseLabel+" — "+String(document.reference||document.id),negative,0);
    add(inventory,"Diminution du stock — "+String(document.reference||document.id),0,negative);
  } else {
    if(negative>0){
      const loss=requireAccount(accounts,mapping.stockAdjustmentLoss,"expense","pertes d'inventaire");
      if(!loss) return {ok:false,entries:[],errors:["Configurez le compte de pertes d'inventaire (charge)."]};
      add(loss,"Écart négatif d'inventaire — "+String(document.reference||document.id),negative,0);
      add(inventory,"Diminution du stock — "+String(document.reference||document.id),0,negative);
    }
    if(positive>0){
      const gain=requireAccount(accounts,mapping.stockAdjustmentGain,"income","gains d'inventaire");
      if(!gain) return {ok:false,entries:[],errors:["Configurez le compte de gains d'inventaire (produit)."]};
      add(inventory,"Augmentation du stock — "+String(document.reference||document.id),positive,0);
      add(gain,"Écart positif d'inventaire — "+String(document.reference||document.id),0,positive);
    }
  }
  const entry={date:document.document_date||related[0].movement_date,journal:"OD",reference,lines};
  const validation=validateEntry(targetStore,entry);
  if(!validation.ok)return {ok:false,entries:[],errors:validation.errors};
  return {ok:true,entries:[entry],reference,negative,positive,errors:[]};
}

export function postStockOperationJournalEntry(targetStore,document,movements,mapping={},accountingMode="perpetual",reasonCode="other"){
  const proposal=buildStockOperationJournalEntry(targetStore,document,movements,mapping,accountingMode,reasonCode);
  if(!proposal.ok||proposal.skipped||proposal.duplicate)return {...proposal,created:0};
  const posted=postBillingJournalEntriesAtomically(targetStore,proposal.entries);
  return {...posted,reference:proposal.reference,negative:proposal.negative,positive:proposal.positive};
}

export function queueStockAccountingOperation(targetStore,{documentId,operationUid,sourceType,documentType,reasonCode="other"}){
  if(!targetStore)return null;
  targetStore.billing ||= {};
  const queue=targetStore.billing.pendingStockAccountingOperations ||= [];
  const existing=queue.find(item=>item.operationUid===operationUid);
  if(existing)return existing;
  const now=new Date().toISOString();
  const operation={documentId:String(documentId),operationUid:String(operationUid),sourceType,documentType,reasonCode,status:"pending",createdAt:now,updatedAt:now,lastError:""};
  queue.push(operation);
  return operation;
}

let retryPromise=null;
export async function retryPendingStockAccountingOperations(targetStore,{companyRole=null,readStock,getRole,save=()=>{},notify=()=>{}}={}){
  if(retryPromise)return retryPromise;
  if(!targetStore)return {attempted:0,succeeded:0};
  const queue=targetStore.billing?.pendingStockAccountingOperations||[];
  const pending=queue.filter(item=>item.status==="pending");
  if(!pending.length)return {attempted:0,succeeded:0};
  retryPromise=(async()=>{
    const role=companyRole||(typeof getRole==="function"?await getRole():null);
    if(!["admin","accountant"].includes(role))return {attempted:0,succeeded:0,skipped:true};
    if(typeof readStock!=="function")return {attempted:pending.length,succeeded:0,error:"Stock reader unavailable"};
    let stock;
    try { stock=await readStock(); } catch(error) { notify(error?.message||"Lecture du stock impossible pour la reprise comptable.",6000); return {attempted:pending.length,succeeded:0,error:error?.message||"read-failed"}; }
    const mapping=targetStore.billing?.settings?.accountingAccounts||{};
    let succeeded=0;
    for(const operation of pending){
      const document=(stock.documents||[]).find(item=>String(item.id)===String(operation.documentId)||String(item.operation_uid)===String(operation.operationUid));
      if(!document||document.status!=="posted"){
        operation.lastError="Document de stock non confirmé comme comptabilisé par le serveur.";
        continue;
      }
      const result=postStockOperationJournalEntry(targetStore,document,stock.movements||[],mapping,stock.settings?.accounting_mode||"perpetual",operation.reasonCode);
      if(result.ok){
        operation.status=result.skipped?"skipped":"posted";
        operation.updatedAt=new Date().toISOString();
        operation.postedAt=new Date().toISOString();
        operation.reference=result.reference||"";
        operation.lastError="";
        succeeded++;
      }else { operation.lastError=(result.errors||["Écriture comptable impossible."]).join(" "); operation.updatedAt=new Date().toISOString(); }
    }
    save();
    if(succeeded)notify(succeeded+" opération(s) de stock comptabilisée(s) automatiquement.");
    const failures=pending.filter(item=>item.status==="pending"&&item.lastError);
    if(failures.length)notify(failures.length+" opération(s) de stock restent en attente : "+failures.map(item=>item.lastError).join(" ; "),7000);
    return {attempted:pending.length,succeeded,failures:failures.length};
  })();
  try{return await retryPromise;}finally{retryPromise=null;}
}

export function postSalesStockCostJournalEntry(targetStore, document, movements, mapping = {}, accountingMode = "perpetual") {
  const proposal = buildSalesStockCostJournalEntry(targetStore,document,movements,mapping,accountingMode);
  if (!proposal.ok || proposal.skipped || proposal.duplicate) return {...proposal,created:0};
  const posted = postBillingJournalEntriesAtomically(targetStore,proposal.entries);
  return {...posted,cost:proposal.cost,reference:proposal.reference};
}


const validPeriodDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))
  && !Number.isNaN(Date.parse(String(value)+"T00:00:00Z"))
  && new Date(String(value)+"T00:00:00Z").toISOString().slice(0,10)===String(value);

export function calculateLocalStockPeriodValuation(stock,startDate,endDate) {
  if(!stock||!Array.isArray(stock.movements)||!validPeriodDate(startDate)||!validPeriodDate(endDate)||startDate>endDate){
    return {ok:false,errors:["Données locales ou dates de valorisation invalides."]};
  }
  const movements=stock.movements;
  const totalsFor=cutoff=>{
    let value=0;
    const positions=new Map();
    for(const movement of movements){
      const date=String(movement.date||movement.movement_date||"");
      if(!validPeriodDate(date)||date>cutoff)continue;
      const kind=String(movement.kind||movement.document_type||"");
      const quantity=Number(movement.quantityDelta??movement.quantity_delta??(kind==="receipt"?movement.quantity:kind==="issue"?-Number(movement.quantity||0):0));
      const rawValue=Number(movement.valueDelta??movement.value_delta??movement.totalCost??0);
      const valueDelta=movement.valueDelta!=null||movement.value_delta!=null
        ? rawValue
        : kind==="receipt"?Math.abs(rawValue):kind==="issue"?-Math.abs(rawValue):0;
      if(!Number.isFinite(quantity)||!Number.isFinite(valueDelta))return {ok:false};
      value+=valueDelta;
      const key=String(movement.productId??movement.product_id??"")+"|"+String(movement.warehouseId??movement.warehouse_id??"");
      positions.set(key,(positions.get(key)||0)+quantity);
      if(kind==="transfer"&&movement.destinationWarehouseId){
        const destination=String(movement.productId??movement.product_id??"")+"|"+String(movement.destinationWarehouseId);
        positions.set(destination,(positions.get(destination)||0)+Math.abs(Number(movement.quantity||quantity)));
      }
    }
    return {value:round2(value),negativePositions:[...positions.values()].filter(quantity=>quantity < -0.000001).length};
  };
  const opening=totalsFor(new Date(Date.parse(startDate+"T00:00:00Z")-86400000).toISOString().slice(0,10));
  const closing=totalsFor(endDate);
  if(!opening.ok||!closing.ok)return {ok:false,errors:["Un mouvement local contient une quantité ou une valeur invalide."]};
  const activeCountSessions=(stock.countSessions||[]).filter(session=>["counting","submitted"].includes(session.status)).length;
  return {
    ok:true,accounting_mode:stock.settings?.accountingMode||stock.settings?.accounting_mode||"perpetual",
    opening_value:opening.value,closing_value:closing.value,
    opening_negative_positions:opening.negativePositions,closing_negative_positions:closing.negativePositions,
    active_count_sessions:activeCountSessions,movement_count:movements.filter(m=>String(m.date||m.movement_date||"")>=startDate&&String(m.date||m.movement_date||"")<=endDate).length,
    period_start:startDate,period_end:endDate,source:"local",
  };
}

export function buildPeriodicStockClosingJournalEntry(targetStore,valuation,mapping={}) {
  if(!valuation||valuation.ok===false)return {ok:false,entries:[],errors:valuation?.errors||["État de valorisation du stock absent."]};
  const mode=valuation.accounting_mode||valuation.accountingMode||"perpetual";
  if(mode!=="periodic")return {ok:true,skipped:true,entries:[],errors:[]};
  const startDate=valuation.period_start||valuation.startDate;
  const endDate=valuation.period_end||valuation.endDate;
  if(!validPeriodDate(startDate)||!validPeriodDate(endDate)||startDate>endDate)return {ok:false,entries:[],errors:["Période de clôture du stock invalide."]};
  const opening=Number(valuation.opening_value??valuation.openingValue);
  const closing=Number(valuation.closing_value??valuation.closingValue);
  const openingNegative=Number(valuation.opening_negative_positions??valuation.openingNegativePositions)||0;
  const closingNegative=Number(valuation.closing_negative_positions??valuation.closingNegativePositions)||0;
  const activeCounts=Number(valuation.active_count_sessions??valuation.activeCountSessions)||0;
  if(!Number.isFinite(opening)||!Number.isFinite(closing)||opening < -0.01||closing < -0.01)return {ok:false,entries:[],errors:["La valorisation historique du stock est négative ou invalide ; clôture refusée."]};
  if(openingNegative>0||closingNegative>0)return {ok:false,entries:[],errors:["Des stocks négatifs existent dans la période ; régularisez-les avant la clôture périodique."]};
  if(activeCounts>0)return {ok:false,entries:[],errors:["Un inventaire physique est encore en cours ; terminez-le avant la clôture périodique."]};
  const delta=round2(closing-opening);
  if(Math.abs(delta)<0.01)return {ok:true,skipped:true,unchanged:true,entries:[],opening,closing,delta,errors:[]};
  const reference="VARIATION STOCK "+startDate+" "+endDate;
  const existing=existingReference(targetStore,reference);
  const accounts=accountsFor(targetStore);
  const inventory=requireAccount(accounts,mapping.inventory,"asset","stock");
  if(!inventory)return {ok:false,entries:[],opening,closing,delta,errors:["Le compte de stock (actif) du plan comptable n'a pas pu être déterminé automatiquement."]};
  const variationCode=String(mapping.stockVariation||"").trim();
  const variationAccount=accounts.find(account=>String(account.code)===variationCode&&["expense","income"].includes(account.type));
  if(!variationAccount)return {ok:false,entries:[],opening,closing,delta,errors:["Le compte de variation des stocks n'a pas pu être déterminé automatiquement."]};
  const amount=Math.abs(delta);
  const lines=delta>0
    ? [{account:inventory,label:"Augmentation du stock à la clôture",third:"",debit:amount,credit:0},{account:variationCode,label:"Variation positive des stocks",third:"",debit:0,credit:amount}]
    : [{account:variationCode,label:"Variation négative des stocks",third:"",debit:amount,credit:0},{account:inventory,label:"Diminution du stock à la clôture",third:"",debit:0,credit:amount}];
  if(existing){
    if(existing.reversed)return {ok:false,entries:[],opening,closing,delta,errors:["L'écriture de variation de stock existe mais a été contrepassée ; clôture automatique bloquée."]};
    const same=existing.date===endDate&&existing.lines?.length===2&&existing.lines.every((line,index)=>String(line.account)===String(lines[index].account)&&round2(line.debit)===round2(lines[index].debit)&&round2(line.credit)===round2(lines[index].credit));
    return same?{ok:true,duplicate:true,entries:[],reference,opening,closing,delta,existing,errors:[]}:{ok:false,entries:[],opening,closing,delta,errors:["Une écriture différente utilise déjà la référence de clôture du stock."]};
  }
  const entry={date:endDate,journal:"OD",reference,lines};
  const validation=validateEntry(targetStore,entry);
  if(!validation.ok)return {ok:false,entries:[],opening,closing,delta,errors:validation.errors};
  return {ok:true,entries:[entry],reference,opening,closing,delta,errors:[]};
}

export function postPeriodicStockClosingJournalEntry(targetStore,valuation,mapping={}) {
  const proposal=buildPeriodicStockClosingJournalEntry(targetStore,valuation,mapping);
  if(!proposal.ok||proposal.skipped||proposal.duplicate)return {...proposal,created:0};
  const posted=postBillingJournalEntriesAtomically(targetStore,proposal.entries);
  return {...posted,reference:proposal.reference,opening:proposal.opening,closing:proposal.closing,delta:proposal.delta};
}
