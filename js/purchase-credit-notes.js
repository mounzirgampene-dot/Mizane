// MIZANE — Avoirs fournisseurs et rapprochement multi-factures.
import { validateEntry } from "./accounting.js";
import { postBillingJournalEntriesAtomically } from "./billing-accounting.js";
import { supplierInvoiceTaxBreakdown } from "./purchase-tax.js";

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function accountsFor(store) {
  const values = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, account]) => ({ code, ...account })) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  return [...new Map(values.map(account => [String(account.code), account])).values()];
}

function invoiceBalance(invoice) {
  const tax = supplierInvoiceTaxBreakdown(invoice);
  const gross = tax.ok ? tax.payable : round2(number(invoice.total));
  const paid = round2((invoice.payments || []).reduce((sum, payment) => sum + number(payment.amount), 0));
  const credited = round2((invoice.creditNotes || []).reduce((sum, note) => sum + number(note.payableAmount ?? note.total), 0));
  return round2(gross - paid - credited);
}

export function buildSupplierCreditNoteJournalEntry(store, invoice, creditNote, accountingMode = "perpetual") {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status !== "validated" || !invoice.accountingPostedAt) {
    return { ok:false, errors:["La facture d'origine doit être validée et comptabilisée."], entries:[] };
  }
  const breakdown = supplierInvoiceTaxBreakdown(invoice);
  if (!breakdown.ok) errors.push(...breakdown.errors);
  const originalLines = breakdown.lines.map(line => ({...line,lineType:["service","fixed_asset"].includes(line.lineType)?line.lineType:"goods"}));
  const hasDetailedLines = Array.isArray(invoice.lines) && invoice.lines.length > 0;
  const priorNotes = Array.isArray(invoice.creditNotes) ? invoice.creditNotes : [];
  let allocations = [];
  if (Array.isArray(creditNote?.lines)) {
    if (!creditNote.lines.length) errors.push("L'avoir doit contenir au moins une ligne de correction.");
    if (priorNotes.some(note => !Array.isArray(note.lines) || !note.lines.length) && hasDetailedLines) {
      errors.push("Avoir bloqué : un avoir antérieur sans ventilation empêche de déterminer le reliquat de chaque ligne.");
    }
    const priorByLine = new Map();
    for (const note of priorNotes) for (const item of note.lines || []) {
      const index = Number(item.lineIndex);
      priorByLine.set(index, round2((priorByLine.get(index)||0)+number(item.amount)));
    }
    const seen = new Set();
    allocations = creditNote.lines.map(item => {
      const index = Number(item.lineIndex), amount = number(item.amount);
      if (!Number.isInteger(index) || index < 0 || !originalLines[index]) {
        errors.push("Une ligne de l'avoir ne correspond à aucune ligne de la facture d'origine.");
        return null;
      }
      if (seen.has(index)) errors.push("Une ligne de facture ne peut être ventilée qu'une seule fois dans un même avoir.");
      seen.add(index);
      const source = originalLines[index], remaining = round2(source.amount-(priorByLine.get(index)||0));
      if (!(amount>0) || !Number.isFinite(amount)) errors.push("Chaque montant d'avoir par ligne doit être strictement positif.");
      if (amount>remaining+0.001) errors.push("L'avoir dépasse le montant HT encore disponible à la ligne "+(index+1)+".");
      const taxAmount=round2(amount*source.taxRate/100);
      return {lineIndex:index,lineType:source.lineType,amount,taxRate:source.taxRate,taxAmount};
    }).filter(Boolean);
  } else {
    if (hasDetailedLines && originalLines.some(line=>line.lineType!=="goods")) {
      errors.push("Avoir bloqué : cette facture mixte exige une ventilation de l'avoir par ligne.");
    }
    if (breakdown.uniformTaxRate===null) errors.push("Avoir bloqué : les factures à taux de taxe multiples exigent une ventilation de l'avoir par ligne.");
    const amount=number(creditNote?.total), taxRate=breakdown.uniformTaxRate;
    if (!(amount>0)) errors.push("Le montant HT de l'avoir doit être positif.");
    if (taxRate!==null) allocations=[{lineIndex:0,lineType:"goods",amount,taxRate,taxAmount:round2(amount*taxRate/100)}];
  }
  const amount = round2(allocations.reduce((sum,item)=>sum+item.amount,0));
  const totalTax = round2(allocations.reduce((sum,item)=>sum+item.taxAmount,0));
  if (creditNote?.total!==undefined && Math.abs(round2(number(creditNote.total))-amount)>0.01) errors.push("Le total HT de l'avoir ne correspond pas à la somme de ses lignes.");
  const dateMatch=String(creditNote?.date||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) errors.push("Date de l'avoir invalide.");
  else {
    const date=new Date(Date.UTC(+dateMatch[1],+dateMatch[2]-1,+dateMatch[3]));
    if(date.getUTCFullYear()!==+dateMatch[1]||date.getUTCMonth()!==+dateMatch[2]-1||date.getUTCDate()!==+dateMatch[3]) errors.push("Date de l'avoir invalide.");
  }
  const exchangeRate=number(invoice.accounting?.exchangeRate);
  if (!(exchangeRate>0)) errors.push("Taux de conversion de la facture d'origine invalide.");
  const payableAmount=round2(amount+totalTax);
  if (payableAmount>invoiceBalance(invoice)+0.001) errors.push("L'avoir dépasse le solde restant dû de la facture.");
  const accounts=accountsFor(store), mapping=invoice.accounting?.accounts||{};
  const requireAccount=(code,type,label)=>{
    const account=accounts.find(item=>String(item.code)===String(code)&&item.type===type);
    if(!account){errors.push("Compte "+label+" absent ou incompatible.");return "";}
    return String(code);
  };
  const supplier=requireAccount(mapping.supplier,"liability","fournisseur");
  const groups=new Map(), taxes=new Map();
  for(const item of allocations){
    groups.set(item.lineType,round2((groups.get(item.lineType)||0)+item.amount));
    taxes.set(item.lineType,round2((taxes.get(item.lineType)||0)+item.taxAmount));
  }
  const costAccounts={};
  if(groups.has("goods")){
    const key=accountingMode==="periodic"?"purchases":"stock";
    costAccounts.goods=requireAccount(mapping[key],accountingMode==="periodic"?"expense":"asset",accountingMode==="periodic"?"achats":"stock");
  }
  if(groups.has("service")) costAccounts.service=requireAccount(mapping.services,"expense","de prestations de services");
  if(groups.has("fixed_asset")) costAccounts.fixed_asset=requireAccount(mapping.fixedAssets,"asset","d'immobilisations");
  const baseHT=round2(amount*exchangeRate),baseTax=round2(totalTax*exchangeRate);
  const recoverable=invoice.accounting?.taxRecoverable===true&&baseTax>0;
  const vat=recoverable?requireAccount(mapping.inputVat,"asset","TVA récupérable"):"";
  if(errors.length)return {ok:false,errors:[...new Set(errors)],entries:[]};
  const reference="AVOIR FOURNISSEUR "+String(creditNote.number||creditNote.id);
  if((store.entries||[]).some(entry=>entry.reference===reference))return {ok:false,errors:["Cet avoir possède déjà une écriture comptable."],entries:[]};
  const lines=[{account:supplier,label:"Avoir fournisseur — "+String(invoice.number),third:String(invoice.supplierName||""),debit:round2(baseHT+baseTax),credit:0}];
  const categories=[...groups.keys()];
  let allocatedBase=0,allocatedTax=0;
  categories.forEach((category,index)=>{
    const baseAmount=index===categories.length-1?round2(baseHT-allocatedBase):round2(groups.get(category)*exchangeRate);
    allocatedBase=round2(allocatedBase+baseAmount);
    const categoryTax=index===categories.length-1?round2(baseTax-allocatedTax):round2(taxes.get(category)*exchangeRate);
    allocatedTax=round2(allocatedTax+categoryTax);
    lines.push({account:costAccounts[category],label:"Correction "+(category==="goods"?(accountingMode==="periodic"?"achats":"stock"):category==="service"?"prestations de services":"immobilisations")+" — "+String(invoice.number),third:"",debit:0,credit:round2(baseAmount+(recoverable?0:categoryTax))});
  });
  if(recoverable)lines.push({account:vat,label:"Régularisation TVA récupérable — "+String(invoice.number),third:"",debit:0,credit:baseTax});
  const entry={date:creditNote.date,journal:"ACH",reference,lines};
  const validation=validateEntry(store,entry);
  if(!validation.ok)return {ok:false,errors:validation.errors,entries:[]};
  return {ok:true,errors:[],entries:[entry],summary:{baseHT,baseTax,payableAmount,accountingMode,recoverable,allocations}};
}
export function postSupplierCreditNoteJournalEntry(store, invoice, creditNote, accountingMode = "perpetual") {
  const proposal = buildSupplierCreditNoteJournalEntry(store,invoice,creditNote,accountingMode);
  if (!proposal.ok) return {...proposal,created:0};
  return {...postBillingJournalEntriesAtomically(store,proposal.entries),summary:proposal.summary};
}

export function planSupplierMultiInvoiceReconciliation(invoices, allocations, payment, options = {}) {
  const errors = [];
  const tolerance = number(options.tolerance);
  if (!(tolerance >= 0) || !Number.isFinite(tolerance)) errors.push("Tolérance de rapprochement invalide.");
  if (!payment || !Number.isFinite(number(payment.amount)) || number(payment.amount) <= 0) errors.push("Le montant du règlement doit être positif.");
  if (!Array.isArray(allocations) || allocations.length === 0) errors.push("Sélectionnez au moins une facture à rapprocher.");
  const byId = new Map((invoices || []).map(invoice => [String(invoice.id),invoice]));
  const seen = new Set();
  const planned = [];
  let total = 0;
  let supplierId = null, currency = null;
  for (const allocation of allocations || []) {
    const id = String(allocation.invoiceId);
    if (seen.has(id)) { errors.push("Une facture ne peut apparaître qu'une seule fois dans le rapprochement."); continue; }
    seen.add(id);
    const invoice = byId.get(id);
    if (!invoice || invoice.type !== "invoice" || invoice.status !== "validated" || !invoice.accountingPostedAt) {
      errors.push("Une facture sélectionnée est absente, non validée ou non comptabilisée."); continue;
    }
    const amount = number(allocation.amount);
    if (!(amount > 0) || !Number.isFinite(amount)) { errors.push("Chaque affectation doit être strictement positive."); continue; }
    const balance = invoiceBalance(invoice);
    if (amount > balance + 0.001) errors.push("Une affectation dépasse le solde disponible de la facture " + String(invoice.number) + ".");
    if (supplierId === null) supplierId = String(invoice.supplierId);
    else if (supplierId !== String(invoice.supplierId)) errors.push("Les factures doivent appartenir au même fournisseur.");
    const invoiceCurrency = String(invoice.currency || "MAD").toUpperCase();
    if (currency === null) currency = invoiceCurrency;
    else if (currency !== invoiceCurrency) errors.push("Les factures doivent être libellées dans la même devise.");
    total = round2(total + amount);
    planned.push({invoiceId:invoice.id,invoiceNumber:invoice.number,amount,balance,currency:invoiceCurrency});
  }
  const difference = round2(number(payment?.amount) - total);
  if (Math.abs(difference) > tolerance + 0.001) errors.push("L'écart entre le règlement et les factures dépasse la tolérance autorisée.");
  if (payment?.currency && currency && String(payment.currency).toUpperCase() !== currency) errors.push("La devise du règlement ne correspond pas à celle des factures.");
  if (errors.length) return {ok:false,errors:[...new Set(errors)],allocations:[],total:0,difference};
  return {ok:true,errors:[],allocations:planned,total,difference,supplierId,currency,status:difference === 0 ? "matched" : "matched_with_tolerance"};
}


export function buildSupplierMultiInvoicePaymentJournalEntry(store, invoices, allocations, payment, mapping = {}) {
  const errors = [];
  const plan = planSupplierMultiInvoiceReconciliation(invoices, allocations, payment, {tolerance:0});
  if (!plan.ok) return {...plan,entries:[]};
  if (Math.abs(plan.difference) > 0.001) errors.push("Le montant du paiement doit correspondre exactement au total des affectations.");
  if (!payment || !["bank","cash"].includes(payment.method)) errors.push("Mode de règlement invalide.");
  const dateMatch=String(payment?.date||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) errors.push("Date de règlement invalide.");
  else {
    const date=new Date(Date.UTC(+dateMatch[1],+dateMatch[2]-1,+dateMatch[3]));
    if(date.getUTCFullYear()!==+dateMatch[1]||date.getUTCMonth()!==+dateMatch[2]-1||date.getUTCDate()!==+dateMatch[3]) errors.push("Date de règlement invalide.");
  }
  const paymentRate=number(payment?.exchangeRate);
  if (!(paymentRate>0)) errors.push("Taux de conversion du règlement invalide.");
  const accounts=accountsFor(store);
  const requireAccount=(code,type,label)=>{
    const value=String(code||"").trim();
    if(!value||!accounts.some(account=>String(account.code)===value&&account.type===type)){
      errors.push("Compte "+label+" absent ou incompatible avec le plan comptable.");return "";
    }
    return value;
  };
  const treasury=requireAccount(mapping.treasury,"asset","de trésorerie");
  const treasuryMeta=accounts.find(account=>String(account.code)===treasury);
  const treasuryLabel=String(treasuryMeta?.label||"").toLocaleLowerCase();
  if(treasury&&(!treasury.startsWith("5")||!/(banque|caisse|trésorerie)/.test(treasuryLabel))) errors.push("Le compte de règlement doit être un compte de banque ou de caisse de classe 5.");
  if(treasury&&payment.method==="cash"&&!/caisse/.test(treasuryLabel)) errors.push("Un règlement en espèces doit utiliser un compte de caisse.");
  if(treasury&&payment.method==="bank"&&!/(banque|trésorerie)/.test(treasuryLabel)) errors.push("Un virement doit utiliser un compte bancaire.");
  const lines=[];
  let baseDebt=0;
  for(const allocation of plan.allocations){
    const invoice=invoices.find(item=>String(item.id)===String(allocation.invoiceId));
    const invoiceRate=number(invoice?.accounting?.exchangeRate);
    if(!(invoiceRate>0)){errors.push("Taux comptable invalide pour la facture "+String(invoice?.number||allocation.invoiceNumber)+".");continue;}
    const supplier=requireAccount(invoice.accounting?.accounts?.supplier,"liability","fournisseur");
    const priorPaid=round2((invoice.payments||[]).reduce((sum,item)=>sum+number(item.amount),0));
    const priorCredit=round2((invoice.creditNotes||[]).reduce((sum,item)=>sum+number(item.payableAmount??item.total),0));
    const invoiceTax=supplierInvoiceTaxBreakdown(invoice);
    const gross=invoiceTax.ok?invoiceTax.payable:round2(number(invoice.total));
    if(round2(priorPaid+priorCredit+allocation.amount)>gross+0.001) errors.push("Le règlement dépasse le solde restant dû de "+String(invoice.number)+".");
    const debt=round2(allocation.amount*invoiceRate);
    baseDebt=round2(baseDebt+debt);
    lines.push({account:supplier,label:"Règlement groupé — "+String(invoice.number),third:String(invoice.supplierName||""),debit:debt,credit:0});
  }
  const basePaid=round2(number(payment.amount)*paymentRate);
  const difference=round2(basePaid-baseDebt);
  if(difference>0){
    const fxLoss=requireAccount(mapping.fxLoss,"expense","de perte de change");
    lines.push({account:fxLoss,label:"Perte de change — règlement groupé fournisseur",third:"",debit:difference,credit:0});
  }else if(difference<0){
    const fxGain=requireAccount(mapping.fxGain,"income","de gain de change");
    lines.push({account:fxGain,label:"Gain de change — règlement groupé fournisseur",third:"",debit:0,credit:-difference});
  }
  lines.push({account:treasury,label:"Décaissement groupé fournisseur — "+String(payment.reference),third:"",debit:0,credit:basePaid});
  const reference="REGLEMENT GROUPE FOURNISSEUR "+String(payment.reference||"").trim();
  if(!String(payment.reference||"").trim()) errors.push("La référence du paiement est obligatoire.");
  if((store.entries||[]).some(entry=>entry.reference===reference)) errors.push("Cette référence possède déjà une écriture comptable.");
  if(errors.length) return {ok:false,errors:[...new Set(errors)],entries:[],allocations:plan.allocations};
  const entry={date:payment.date,journal:payment.method==="cash"?"CAI":"BAN",reference,lines};
  const validation=validateEntry(store,entry);
  if(!validation.ok) return {ok:false,errors:validation.errors,entries:[],allocations:plan.allocations};
  return {ok:true,errors:[],entries:[entry],allocations:plan.allocations,summary:{baseDebt,basePaid,exchangeDifference:difference,total:plan.total}};
}

export function postSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,payment,mapping={}) {
  const proposal=buildSupplierMultiInvoicePaymentJournalEntry(store,invoices,allocations,payment,mapping);
  if(!proposal.ok) return {...proposal,created:0};
  const posted=postBillingJournalEntriesAtomically(store,proposal.entries);
  if(!posted.ok) return {...posted,allocations:proposal.allocations,summary:proposal.summary};
  return {...posted,allocations:proposal.allocations,summary:proposal.summary};
}
