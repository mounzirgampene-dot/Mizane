// MIZANE — Comptabilisation contrôlée des factures fournisseurs.
import { validateEntry } from "./accounting.js";
import { postBillingJournalEntriesAtomically } from "./billing-accounting.js";

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function accountsFor(store) {
  const values = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, account]) => ({ code, ...account })) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  return [...new Map(values.map(account => [String(account.code), account])).values()];
}

export function buildSupplierInvoiceJournalEntry(store, invoice, accountingMode = "perpetual") {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status === "cancelled") {
    return { ok:false, errors:["Facture fournisseur absente ou annulée."], entries:[] };
  }
  const config = invoice.accounting || {}, mapping = config.accounts || {};
  const accounts = accountsFor(store);
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const normalized = lines.map(line => ({
    ...line,
    lineType: ["service","fixed_asset"].includes(line.lineType) ? line.lineType : "goods",
    amount: round2(Number(line.quantity || 0) * Number(line.unitCost || 0)),
  }));
  if (!normalized.length || normalized.some(line => !(line.amount > 0) || !Number.isFinite(line.amount))) {
    errors.push("Chaque ligne de facture doit avoir une quantité et un coût unitaire strictement positifs.");
  }
  const sourceTotal = Number(invoice.total);
  const computedTotal = round2(normalized.reduce((sum,line)=>sum+line.amount,0));
  if (!(sourceTotal > 0) || !Number.isFinite(sourceTotal)) errors.push("Le total HT de la facture doit être positif.");
  else if (Math.abs(round2(sourceTotal)-computedTotal) > 0.01) errors.push("Le total HT ne correspond pas à la somme des lignes de la facture.");
  const accountMatchesPurpose = (account,key) => {
    const code=String(account.code||""), label=String(account.label||"").toLocaleLowerCase();
    if (key==="supplier") return code.startsWith("4") && /fournisseur/.test(label);
    if (key==="stock") return code.startsWith("3") && /(stock|marchandise|matière|approvisionnement|produit)/.test(label);
    if (key==="purchases") return code.startsWith("6") && /(achat|charge)/.test(label);
    if (key==="services") return code.startsWith("6") && /(service|honoraire|charge|prestation)/.test(label);
    if (key==="fixedAssets") return code.startsWith("2") && /(immobil|matériel|terrain|construction|équipement)/.test(label);
    if (key==="inputVat") return /(tva.*(récupérable|déductible|acquisition|achats)|taxe.*récupérable|impôt.*récupérable)/.test(label);
    return true;
  };
  const requireAccount = (key,type,label) => {
    const code=String(mapping[key]||"").trim();
    if (!code || !accounts.some(account=>String(account.code)===code && account.type===type && accountMatchesPurpose(account,key))) {
      errors.push("Compte "+label+" absent ou incompatible avec le plan comptable."); return "";
    }
    return code;
  };
  const supplier=requireAccount("supplier","liability","fournisseur (passif)");
  const groups=new Map();
  for (const line of normalized) groups.set(line.lineType,round2((groups.get(line.lineType)||0)+line.amount));
  const groupAccounts={};
  if (groups.has("goods")) groupAccounts.goods=accountingMode==="periodic"
    ? requireAccount("purchases","expense","d'achat (charge)")
    : requireAccount("stock","asset","de stock (actif)");
  if (groups.has("service")) groupAccounts.service=requireAccount("services","expense","de prestations de services (charge)");
  if (groups.has("fixed_asset")) groupAccounts.fixed_asset=requireAccount("fixedAssets","asset","d'immobilisations (actif)");
  const rate=Number(config.exchangeRate), taxRate=Number(config.taxRate);
  if (!(rate>0) || !Number.isFinite(rate)) errors.push("Taux de conversion fournisseur invalide.");
  if (!Number.isFinite(taxRate) || taxRate<0 || taxRate>100) errors.push("Taux de taxe fournisseur invalide (0 à 100 %).");
  const baseHT=round2(sourceTotal*rate), baseTax=round2(baseHT*taxRate/100);
  const recoverable=config.taxRecoverable===true && baseTax>0;
  const inputVat=recoverable ? requireAccount("inputVat","asset","de TVA récupérable (actif)") : "";
  if (errors.length) return {ok:false,errors:[...new Set(errors)],entries:[]};
  const reference="ACHAT FOURNISSEUR "+String(invoice.number||invoice.id);
  if ((store.entries||[]).some(entry=>entry.reference===reference)) return {ok:false,errors:["Cette facture fournisseur possède déjà une écriture comptable."],entries:[]};
  const debitLines=[];
  const categories=[...groups.keys()];
  let allocatedTax=0;
  categories.forEach((category,index)=>{
    const amount=groups.get(category);
    const baseAmount=round2(amount*rate);
    const taxShare=recoverable ? 0 : index===categories.length-1 ? round2(baseTax-allocatedTax) : round2(baseTax*amount/sourceTotal);
    allocatedTax=round2(allocatedTax+taxShare);
    debitLines.push({account:groupAccounts[category],label:(category==="goods"?(accountingMode==="periodic"?"Achats":"Entrée en stock"):category==="service"?"Prestations de services":"Immobilisations")+" — "+invoice.number,third:"",debit:round2(baseAmount+taxShare),credit:0});
  });
  if (recoverable) debitLines.push({account:inputVat,label:"TVA récupérable — "+invoice.number,third:"",debit:baseTax,credit:0});
  const payable=round2(baseHT+baseTax);
  const entry={date:invoice.date,journal:"ACH",reference,lines:[...debitLines,{account:supplier,label:"Dette fournisseur — "+invoice.number,third:String(invoice.supplierName||""),debit:0,credit:payable}]};
  const validation=validateEntry(store,entry);
  if (!validation.ok) return {ok:false,errors:validation.errors,entries:[]};
  return {ok:true,errors:[],entries:[entry],summary:{baseHT,baseTax,payable,accountingMode,recoverable,allocations:Object.fromEntries(groups)}};
}

export function postSupplierInvoiceJournalEntry(store, invoice, accountingMode = "perpetual") {
  const proposal = buildSupplierInvoiceJournalEntry(store, invoice, accountingMode);
  if (!proposal.ok) return { ...proposal, created: 0 };
  const posted = postBillingJournalEntriesAtomically(store, proposal.entries);
  return { ...posted, summary: proposal.summary };
}


/**
 * Propose le règlement d'une facture fournisseur, avec prise en compte du change.
 * Le montant saisi est exprimé dans la devise de la facture ; la dette est soldée
 * au taux comptable d'origine et la trésorerie au taux du règlement.
 */
export function buildSupplierPaymentJournalEntry(store, invoice, payment, mapping = {}) {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status !== "validated" || !invoice.accountingPostedAt) {
    return { ok:false, errors:["La facture fournisseur doit être validée et comptabilisée avant son règlement."], entries:[] };
  }
  if (!payment || !["bank","cash"].includes(payment.method)) errors.push("Mode de règlement invalide.");
  const dateMatch = String(payment?.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) errors.push("Date de règlement invalide.");
  else {
    const date = new Date(Date.UTC(+dateMatch[1], +dateMatch[2]-1, +dateMatch[3]));
    if (date.getUTCFullYear() !== +dateMatch[1] || date.getUTCMonth() !== +dateMatch[2]-1 || date.getUTCDate() !== +dateMatch[3]) errors.push("Date de règlement invalide.");
  }
  const amount = Number(payment?.amount);
  const invoiceRate = Number(invoice.accounting?.exchangeRate);
  const paymentRate = Number(payment?.exchangeRate);
  if (!(amount > 0) || !Number.isFinite(amount)) errors.push("Le montant du règlement doit être positif.");
  if (!(invoiceRate > 0) || !Number.isFinite(invoiceRate)) errors.push("Taux comptable de la facture invalide.");
  if (!(paymentRate > 0) || !Number.isFinite(paymentRate)) errors.push("Taux de conversion du règlement invalide.");
  const payable = round2(Number(invoice.total) * (1 + Number(invoice.accounting?.taxRate || 0) / 100));
  const paid = round2((invoice.payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
  if (Number.isFinite(amount) && amount > round2(payable - paid) + 0.001) errors.push("Le règlement dépasse le solde restant dû au fournisseur.");
  const accounts = accountsFor(store);
  const requireAccount = (code, type, label) => {
    const value = String(code || "").trim();
    if (!value || !accounts.some(account => String(account.code) === value && account.type === type)) {
      errors.push("Compte " + label + " absent ou incompatible avec le plan comptable.");
      return "";
    }
    return value;
  };
  const supplier = requireAccount(invoice.accounting?.accounts?.supplier, "liability", "fournisseur (passif)");
  const treasury = requireAccount(mapping.treasury, "asset", "de trésorerie (actif)");
  const treasuryMeta = accounts.find(account => String(account.code) === treasury);
  const treasuryLabel = String(treasuryMeta?.label || "").toLocaleLowerCase();
  if (treasury && (!String(treasury).startsWith("5") || !/(banque|caisse|trésorerie)/.test(treasuryLabel))) errors.push("Le compte de règlement doit être un compte de banque ou de caisse de la classe 5.");
  if (treasury && payment?.method === "cash" && !/caisse/.test(treasuryLabel)) errors.push("Un règlement en espèces doit utiliser un compte de caisse.");
  if (treasury && payment?.method === "bank" && !/(banque|trésorerie)/.test(treasuryLabel)) errors.push("Un virement doit utiliser un compte bancaire.");
  const baseDebt = round2(amount * invoiceRate);
  const basePaid = round2(amount * paymentRate);
  const difference = round2(basePaid - baseDebt);
  const lines = [
    { account:supplier, label:"Règlement dette fournisseur — " + String(invoice.number), third:String(invoice.supplierName || ""), debit:baseDebt, credit:0 },
  ];
  if (difference > 0) {
    const fxLoss = requireAccount(mapping.fxLoss, "expense", "de perte de change");
    lines.push({ account:fxLoss, label:"Perte de change — règlement fournisseur " + String(invoice.number), third:"", debit:difference, credit:0 });
  } else if (difference < 0) {
    const fxGain = requireAccount(mapping.fxGain, "income", "de gain de change");
    lines.push({ account:fxGain, label:"Gain de change — règlement fournisseur " + String(invoice.number), third:"", debit:0, credit:-difference });
  }
  lines.push({ account:treasury, label:"Décaissement fournisseur — " + String(invoice.number), third:"", debit:0, credit:basePaid });
  const reference = "REGLEMENT FOURNISSEUR " + String(invoice.number || invoice.id) + " #" + String(payment.id);
  if ((store.entries || []).some(entry => entry.reference === reference)) errors.push("Ce règlement possède déjà une écriture comptable.");
  if (errors.length) return {ok:false,errors:[...new Set(errors)],entries:[]};
  const entry = { date:payment.date, journal:payment.method === "cash" ? "CAI" : "BAN", reference, lines };
  const validation = validateEntry(store, entry);
  if (!validation.ok) return {ok:false,errors:validation.errors,entries:[]};
  return {ok:true,errors:[],entries:[entry],summary:{payable,paid,remaining:round2(payable-paid-amount),baseDebt,basePaid,exchangeDifference:difference}};
}

export function postSupplierPaymentJournalEntry(store, invoice, payment, mapping = {}) {
  const proposal = buildSupplierPaymentJournalEntry(store, invoice, payment, mapping);
  if (!proposal.ok) return {...proposal,created:0};
  const posted = postBillingJournalEntriesAtomically(store, proposal.entries);
  return {...posted,summary:proposal.summary};
}
