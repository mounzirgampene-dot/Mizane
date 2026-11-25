// MIZANE — Génération des écritures comptables de facturation.
// Les propositions sont validées par le moteur comptable avant leur enregistrement.
import { validateEntry, postEntry, round2 } from "./accounting.js";
import { calculateBillingTotals } from "./billing-core.js";

const DEFAULT_CODES = {
  syscohada: { customer: ["411"], revenue: ["701"], tax: ["4431"], bank: ["521"], cash: ["571"], fxGain: ["778"], fxLoss: ["675"] },
  pcg: { customer: ["411"], revenue: ["707"], tax: ["4457", "4451"], bank: ["512"], cash: ["53"], fxGain: ["766"], fxLoss: [] },
  nct: { customer: ["411"], revenue: ["707"], tax: ["4431", "4455"], bank: ["512"], cash: ["53"], fxGain: ["766"], fxLoss: ["675"] },
  cgnc: { customer: ["4421", "442"], revenue: ["711"], tax: ["4455"], bank: ["5141", "514"], cash: ["516"], fxGain: [], fxLoss: ["675"] },
};

export function suggestBillingAccounts(planId, accounts = []) {
  const defaults = DEFAULT_CODES[planId] || DEFAULT_CODES.syscohada;
  const choose = (codes, type) => {
    for (const code of codes) {
      const exact = accounts.find(account => String(account.code) === code && account.type === type);
      if (exact) return exact.code;
    }
    return accounts.find(account => account.type === type)?.code || "";
  };
  return {
    customer: choose(defaults.customer, "asset"),
    revenue: choose(defaults.revenue, "income"),
    tax: choose(defaults.tax, "liability"),
    bank: choose(defaults.bank, "asset"),
    cash: choose(defaults.cash, "asset"),
    fxGain: defaults.fxGain.map(code => accounts.find(account => String(account.code) === code && account.type === "income")?.code).find(Boolean) || "",
    fxLoss: defaults.fxLoss.map(code => accounts.find(account => String(account.code) === code && account.type === "expense")?.code).find(Boolean) || "",
  };
}

const STOCK_ACCOUNT_DEFAULTS = {
  syscohada: { inventory:"31", stockVariation:"603", stockVariationType:"expense" },
  pcg: { inventory:"37", stockVariation:"713", stockVariationType:"income" },
  nct: { inventory:"34", stockVariation:"713", stockVariationType:"income" },
  cgnc: { inventory:"314", stockVariation:"713", stockVariationType:"income" },
};

export function suggestStockAccounts(planId,accounts=[]) {
  const defaults=STOCK_ACCOUNT_DEFAULTS[planId]||STOCK_ACCOUNT_DEFAULTS.syscohada;
  const exact=(code,type)=>accounts.find(account=>String(account.code)===code&&account.type===type)?.code||"";
  return {
    inventory:exact(defaults.inventory,"asset"),
    stockVariation:exact(defaults.stockVariation,defaults.stockVariationType),
    stockVariationType:defaults.stockVariationType,
  };
}

function accountExists(accounts, code, type) {
  return accounts.some(account => String(account.code) === String(code) && account.type === type);
}

function thirdName(store, customerName) {
  const match = (store.thirds || []).find(third =>
    String(third.name || "").trim().toLocaleLowerCase() === String(customerName || "").trim().toLocaleLowerCase()
  );
  return match ? String(match.name) : "";
}

export function buildBillingJournalEntries(store, invoice, mapping = {}) {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || invoice.status === "cancelled") {
    return { ok: false, errors: ["Facture absente ou annulée."], entries: [] };
  }
  const accounts = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, value]) => ({ code, ...value })) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  const uniqueAccounts = [...new Map(accounts.map(account => [String(account.code), account])).values()];
  const requireAccount = (key, type, label) => {
    const code = String(mapping[key] || "").trim();
    if (!code || !accountExists(uniqueAccounts, code, type)) {
      errors.push("Compte comptable " + label + " non configuré ou incompatible avec le plan.");
      return "";
    }
    return code;
  };

  const customer = requireAccount("customer", "asset", "client");
  const revenue = requireAccount("revenue", "income", "de produits");
  const total = calculateBillingTotals(invoice.lines || []);
  const baseTotal = round2(total.ttc * Number(invoice.exchangeRate || 0));
  const baseTax = round2(total.tax * Number(invoice.exchangeRate || 0));
  const baseRevenue = round2(baseTotal - baseTax);
  let tax = "";
  if (total.tax > 0) tax = requireAccount("tax", "liability", "de taxe collectée");
  if (!(Number(invoice.exchangeRate) > 0) || !Number.isFinite(Number(invoice.exchangeRate))) errors.push("Taux de conversion de la facture invalide.");
  if (!(baseTotal > 0)) errors.push("Le total de la facture doit être positif pour être comptabilisé.");

  const existingEntries = store.entries || [];
  const existing = new Set(existingEntries.map(entry => String(entry.reference || "")));
  const entries = [];
  const invoiceReference = "FACTURE " + String(invoice.number || invoice.id);
  if (existingEntries.some(entry => entry.reference === invoiceReference && entry.reversed)) {
    errors.push("L'écriture de cette facture a été contrepassée. Une nouvelle comptabilisation doit être préparée manuellement.");
  }
  if (!existing.has(invoiceReference)) {
    const lines = [
      { account: customer, label: "Créance client — " + invoice.number, third: thirdName(store, invoice.customerName), debit: baseTotal, credit: 0 },
      { account: revenue, label: "Vente — " + invoice.number, third: "", debit: 0, credit: baseRevenue },
    ];
    if (baseTax > 0) lines.push({ account: tax, label: "Taxe collectée — " + invoice.number, third: "", debit: 0, credit: baseTax });
    entries.push({ date: invoice.date, journal: "VTE", reference: invoiceReference, lines });
    existing.add(invoiceReference);
  }

  for (const payment of invoice.payments || []) {
    const reference = "REGLEMENT " + String(invoice.number || invoice.id) + " #" + String(payment.id);
    if (existingEntries.some(entry => entry.reference === reference && entry.reversed)) {
      errors.push("L'écriture du règlement #" + payment.id + " a été contrepassée ; elle ne sera pas recréée automatiquement.");
      continue;
    }
    if (existing.has(reference)) continue;
    const cash = payment.method === "cash";
    const treasury = requireAccount(cash ? "cash" : "bank", "asset", cash ? "de caisse" : "bancaire");
    const rateValue = payment.exchangeRate == null || payment.exchangeRate === "" ? invoice.exchangeRate : payment.exchangeRate;
    const rate = Number(rateValue);
    const paymentAmount = Number(payment.amount);
    const amount = round2(paymentAmount * rate);
    const receivableAmount = round2(paymentAmount * Number(invoice.exchangeRate));
    const exchangeDifference = round2(amount - receivableAmount);
    if (!(paymentAmount > 0) || !Number.isFinite(paymentAmount)) errors.push("Montant de règlement invalide (paiement #" + payment.id + ").");
    if (!(rate > 0) || !Number.isFinite(rate)) errors.push("Taux de conversion du règlement invalide (paiement #" + payment.id + ").");
    const paymentLines = [
      { account: treasury, label: "Encaissement facture " + invoice.number, third: "", debit: amount, credit: 0 },
    ];
    if (exchangeDifference < 0) {
      const fxLoss = requireAccount("fxLoss", "expense", "de perte de change");
      paymentLines.push({ account: fxLoss, label: "Perte de change — facture " + invoice.number, third: "", debit: -exchangeDifference, credit: 0 });
    } else if (exchangeDifference > 0) {
      const fxGain = requireAccount("fxGain", "income", "de gain de change");
      paymentLines.push({ account: fxGain, label: "Gain de change — facture " + invoice.number, third: "", debit: 0, credit: exchangeDifference });
    }
    paymentLines.push({ account: customer, label: "Règlement client — " + invoice.number, third: thirdName(store, invoice.customerName), debit: 0, credit: receivableAmount });
    if (amount > 0 && receivableAmount > 0) entries.push({
      date: payment.date || invoice.date,
      journal: cash ? "CAI" : "BAN",
      reference,
      lines: paymentLines,
    });
    existing.add(reference);
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)], entries: [] };
  for (const entry of entries) {
    const validation = validateEntry(store, entry);
    if (!validation.ok) errors.push(...validation.errors);
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)], entries: [] };
  return { ok: true, errors: [], entries };
}


/**
 * Publie un lot d'écritures de facturation de manière atomique.
 * Une facture peut produire plusieurs écritures (vente et règlements) ;
 * aucune ne doit rester enregistrée si l'une d'elles échoue.
 */
export function postBillingJournalEntriesAtomically(store, entries) {
  if (!store || !Array.isArray(entries)) {
    return { ok: false, errors: ["Lot d'écritures de facturation invalide."], created: 0 };
  }
  const staged = {
    ...store,
    entries: [...(Array.isArray(store.entries) ? store.entries : [])],
    nextId: Number(store.nextId) || 1,
  };
  let created = 0;
  for (const entry of entries) {
    const result = postEntry(staged, entry);
    if (!result.ok) {
      return { ok: false, errors: result.errors || ["Écriture comptable refusée."], created: 0 };
    }
    created++;
  }
  store.entries = staged.entries;
  store.nextId = staged.nextId;
  return { ok: true, errors: [], created };
}


/**
 * Génère l'écriture d'un avoir partiel ou total.
 * Les montants proviennent des lignes réellement créditées, au taux de change de la facture.
 */
export function buildCreditNoteJournalEntry(store, invoice, creditNote, mapping = {}) {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || !creditNote || creditNote.type !== "credit_note" ||
      Number(creditNote.sourceInvoiceId) !== Number(invoice.id)) {
    return { ok:false, errors:["Facture source ou avoir invalide."], entries:[] };
  }
  const accounts = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code,value])=>({code,...value})) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  const unique = [...new Map(accounts.map(account=>[String(account.code),account])).values()];
  const requireAccount=(key,type,label)=>{
    const code=String(mapping[key]||"").trim();
    if(!code || !accountExists(unique,code,type)){errors.push("Compte comptable "+label+" non configuré ou incompatible avec le plan.");return "";}
    return code;
  };
  const customer=requireAccount("customer","asset","client");
  const revenue=requireAccount("revenue","income","de produits");
  const total=calculateBillingTotals(creditNote.lines||[]);
  const rate=Number(invoice.exchangeRate);
  if(!(rate>0)||!Number.isFinite(rate)) errors.push("Taux de conversion de la facture invalide.");
  const baseTotal=round2(total.ttc*rate), baseTax=round2(total.tax*rate), baseRevenue=round2(baseTotal-baseTax);
  let tax="";
  if(baseTax>0) tax=requireAccount("tax","liability","de taxe collectée");
  if(!(baseTotal>0)) errors.push("Le montant de l'avoir doit être positif.");
  if(errors.length) return {ok:false,errors:[...new Set(errors)],entries:[]};
  const reference="AVOIR "+String(creditNote.number||creditNote.id);
  if((store.entries||[]).some(entry=>entry.reference===reference)) return {ok:false,errors:["L'écriture de cet avoir existe déjà."],entries:[]};
  const lines=[{account:revenue,label:"Annulation des produits — avoir "+creditNote.number,third:"",debit:baseRevenue,credit:0}];
  if(baseTax>0) lines.push({account:tax,label:"Annulation de la taxe — avoir "+creditNote.number,third:"",debit:baseTax,credit:0});
  lines.push({account:customer,label:"Avoir client — "+creditNote.number,third:thirdName(store,invoice.customerName),debit:0,credit:baseTotal});
  const entry={date:creditNote.date,journal:"VTE",reference,lines};
  const validation=validateEntry(store,entry);
  if(!validation.ok) return {ok:false,errors:validation.errors,entries:[]};
  return {ok:true,errors:[],entries:[entry]};
}

/**
 * Comptabilise un remboursement client d'un avoir déjà émis.
 * Débit du compte client, crédit de la banque ou de la caisse.
 */
export function buildCreditNoteRefundJournalEntry(store, invoice, creditNote, refund, mapping = {}) {
  const errors=[];
  if(!invoice || invoice.type!=="invoice" || !creditNote || creditNote.type!=="credit_note" ||
     Number(creditNote.sourceInvoiceId)!==Number(invoice.id) || !refund) {
    return {ok:false,errors:["Facture, avoir ou remboursement invalide."],entries:[]};
  }
  const accounts=[
    ...(store.__accountCache?Object.entries(store.__accountCache).map(([code,value])=>({code,...value})):[]),
    ...((store.settings&&store.settings.customAccounts)||[]),
  ];
  const unique=[...new Map(accounts.map(account=>[String(account.code),account])).values()];
  const requireAccount=(key,type,label)=>{
    const code=String(mapping[key]||"").trim();
    if(!code||!accountExists(unique,code,type)){errors.push("Compte "+label+" non configuré ou incompatible avec le plan.");return "";}
    return code;
  };
  const customer=requireAccount("customer","asset","client");
  const treasury=requireAccount(refund.method==="cash"?"cash":"bank","asset",refund.method==="cash"?"de caisse":"bancaire");
  const amount=Number(refund.amount), rate=Number(refund.exchangeRate);
  const alreadyRefunded=round2((creditNote.refunds||[]).reduce((sum,item)=>sum+Number(item.amount||0),0));
  const creditAmount=round2(calculateBillingTotals(creditNote.lines||[]).ttc);
  if(Number.isFinite(amount) && amount>round2(creditAmount-alreadyRefunded)+0.001) errors.push("Le remboursement dépasse le solde non remboursé de cet avoir.");
  const match=String(refund.date||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) errors.push("Date de remboursement invalide.");
  else {const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));if(date.getUTCFullYear()!==+match[1]||date.getUTCMonth()!==+match[2]-1||date.getUTCDate()!==+match[3])errors.push("Date de remboursement invalide.");}
  if(!(amount>0)||!Number.isFinite(amount)) errors.push("Montant de remboursement invalide.");
  if(!(rate>0)||!Number.isFinite(rate)) errors.push("Taux de conversion du remboursement invalide.");
  if(!["bank","cash"].includes(refund.method)) errors.push("Le remboursement doit être effectué par banque ou caisse.");
  const reference="REMBOURSEMENT AVOIR "+String(creditNote.number)+" #"+String(refund.id);
  if((store.entries||[]).some(entry=>entry.reference===reference)) return {ok:false,errors:["L'écriture de ce remboursement existe déjà."],entries:[]};
  if(errors.length) return {ok:false,errors:[...new Set(errors)],entries:[]};
  const baseAmount=round2(amount*rate);
  const entry={date:refund.date,journal:refund.method==="cash"?"CAI":"BAN",reference,lines:[
    {account:customer,label:"Remboursement client — avoir "+creditNote.number,third:thirdName(store,invoice.customerName),debit:baseAmount,credit:0},
    {account:treasury,label:"Sortie de trésorerie — avoir "+creditNote.number,third:"",debit:0,credit:baseAmount},
  ]};
  const validation=validateEntry(store,entry);
  if(!validation.ok) return {ok:false,errors:validation.errors,entries:[]};
  return {ok:true,errors:[],entries:[entry]};
}

/**
 * Génère l'écriture d'un avoir total non remboursé.
 * L'avoir est une nouvelle pièce comptable datée dans une période ouverte :
 * on ne modifie ni ne contre-passe l'écriture d'origine.
 */
export function buildFullCreditNoteJournalEntry(store, invoice, creditNote, mapping = {}) {
  const errors = [];
  if (!invoice || invoice.type !== "invoice" || !creditNote || creditNote.type !== "credit_note") {
    return { ok: false, errors: ["Facture ou avoir invalide."], entries: [] };
  }
  const accounts = [
    ...(store.__accountCache ? Object.entries(store.__accountCache).map(([code, value]) => ({ code, ...value })) : []),
    ...((store.settings && store.settings.customAccounts) || []),
  ];
  const uniqueAccounts = [...new Map(accounts.map(account => [String(account.code), account])).values()];
  const requireAccount = (key, type, label) => {
    const code = String(mapping[key] || "").trim();
    if (!code || !accountExists(uniqueAccounts, code, type)) {
      errors.push("Compte comptable " + label + " non configuré ou incompatible avec le plan.");
      return "";
    }
    return code;
  };
  const customer = requireAccount("customer", "asset", "client");
  const revenue = requireAccount("revenue", "income", "de produits");
  const total = calculateBillingTotals(invoice.lines || []);
  const rate = Number(invoice.exchangeRate);
  if (!(rate > 0) || !Number.isFinite(rate)) errors.push("Taux de conversion de la facture invalide.");
  const baseTotal = round2(total.ttc * rate);
  const baseTax = round2(total.tax * rate);
  const baseRevenue = round2(baseTotal - baseTax);
  let tax = "";
  if (baseTax > 0) tax = requireAccount("tax", "liability", "de taxe collectée");
  if (!(baseTotal > 0)) errors.push("Le total de l'avoir doit être positif.");
  if (errors.length) return { ok: false, errors: [...new Set(errors)], entries: [] };
  const reference = "AVOIR " + String(creditNote.number || creditNote.id);
  if ((store.entries || []).some(entry => entry.reference === reference)) {
    return { ok: false, errors: ["L'écriture de cet avoir existe déjà."], entries: [] };
  }
  const lines = [
    { account: revenue, label: "Annulation des produits — avoir " + creditNote.number, third: "", debit: baseRevenue, credit: 0 },
  ];
  if (baseTax > 0) lines.push({ account: tax, label: "Annulation de la taxe — avoir " + creditNote.number, third: "", debit: baseTax, credit: 0 });
  lines.push({ account: customer, label: "Avoir client — " + creditNote.number, third: thirdName(store, invoice.customerName), debit: 0, credit: baseTotal });
  const entry = { date: creditNote.date, journal: "VTE", reference, lines };
  const validation = validateEntry(store, entry);
  if (!validation.ok) return { ok: false, errors: validation.errors, entries: [] };
  return { ok: true, errors: [], entries: [entry] };
}
