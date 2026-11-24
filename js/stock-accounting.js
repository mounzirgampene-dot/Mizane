// MIZANE — Comptabilisation du coût des sorties de stock vendues.
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

export function buildSalesStockCostJournalEntry(store, document, movements, mapping = {}, accountingMode = "perpetual") {
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
  const existing = (store.entries || []).find(entry => entry.reference === reference);
  if (existing) return { ok:true, duplicate:true, entries:[], cost, reference, existing };
  const accounts = accountsFor(store);
  const inventory = String(mapping.inventory || "").trim();
  const cogs = String(mapping.cogs || "").trim();
  if (!accounts.some(account => String(account.code) === inventory && account.type === "asset")) {
    return { ok:false, entries:[], cost, errors:["Configurez un compte de stock (actif) dans les paramètres de facturation."] };
  }
  if (!accounts.some(account => String(account.code) === cogs && account.type === "expense")) {
    return { ok:false, entries:[], cost, errors:["Configurez un compte de coût des ventes (charge) dans les paramètres de facturation."] };
  }
  const entry = {
    date: document.document_date || related[0].movement_date,
    journal:"OD",
    reference,
    lines:[
      {account:cogs,label:"Coût des marchandises sorties — "+String(document.reference || document.document_id),third:"",debit:cost,credit:0},
      {account:inventory,label:"Diminution du stock — "+String(document.reference || document.document_id),third:"",debit:0,credit:cost},
    ],
  };
  const validation = validateEntry(store,entry);
  if (!validation.ok) return {ok:false,entries:[],cost,errors:validation.errors};
  return {ok:true,entries:[entry],cost,reference,errors:[]};
}

export function postSalesStockCostJournalEntry(store, document, movements, mapping = {}, accountingMode = "perpetual") {
  const proposal = buildSalesStockCostJournalEntry(store,document,movements,mapping,accountingMode);
  if (!proposal.ok || proposal.skipped || proposal.duplicate) return {...proposal,created:0};
  const posted = postBillingJournalEntriesAtomically(store,proposal.entries);
  return {...posted,cost:proposal.cost,reference:proposal.reference};
}
