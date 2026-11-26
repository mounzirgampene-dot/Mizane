import assert from "node:assert/strict";
import { newStore, buildAccountCache, postEntry } from "../js/accounting.js";
import { buildThirdPartyReconciliation, applyThirdPartyLettrage, reverseThirdPartyLettrage } from "../js/third-party-reconciliation.js";

const store = newStore();
store.settings.currency = "XOF";
buildAccountCache(store, [
  { code: "401", label: "Fournisseurs", type: "liability" },
  { code: "411", label: "Clients", type: "asset" },
  { code: "512", label: "Banque", type: "asset" },
  { code: "601", label: "Achats", type: "expense" },
]);
postEntry(store, { date: "2026-01-03", journal: "ACH", reference: "FAC-01", lines: [
  { account: "601", debit: 150, credit: 0 },
  { account: "401", debit: 0, credit: 150, third: "Fournisseur A", label: "Facture A" },
] });
postEntry(store, { date: "2026-01-10", journal: "BAN", reference: "REG-01", lines: [
  { account: "401", debit: 100, credit: 0, third: "Fournisseur A", label: "Règlement partiel" },
  { account: "512", debit: 0, credit: 100 },
] });
postEntry(store, { date: "2026-01-11", journal: "BAN", reference: "REG-02", lines: [
  { account: "401", debit: 50, credit: 0, third: "Fournisseur A", label: "Solde facture" },
  { account: "512", debit: 0, credit: 50 },
] });
postEntry(store, { date: "2026-01-12", journal: "ACH", reference: "FAC-02", lines: [
  { account: "601", debit: 80, credit: 0 },
  { account: "401", debit: 0, credit: 80, third: "Fournisseur B", label: "Autre tiers" },
] });

let report = buildThirdPartyReconciliation(store);
assert.equal(report.totals.openItems, 4);
assert.equal(report.totals.proposals, 2, "un compte et un tiers identiques seulement");
assert.equal(report.proposals.reduce((sum,item)=>sum+item.amount,0), 150);
const first = report.proposals[0];
const applied = applyThirdPartyLettrage(store, first);
assert.equal(applied.status, "active");
report = buildThirdPartyReconciliation(store);
assert.ok(Object.values(report.totals.openDebitByCurrency).reduce((sum,value)=>sum+value,0) + Object.values(report.totals.openCreditByCurrency).reduce((sum,value)=>sum+value,0) < 380, "les montants lettrés sont déduits des soldes ouverts");
assert.throws(() => applyThirdPartyLettrage(store, first), /n'est plus disponible/);
reverseThirdPartyLettrage(store, applied.id);
report = buildThirdPartyReconciliation(store);
assert.equal(report.history.length, 0);
assert.equal(report.totals.proposals, 2, "l'annulation restaure la proposition sans toucher aux écritures");
assert.equal(store.entries.length, 4, "aucune écriture comptable n'a été créée ou modifiée");

const currencyStore = newStore();
currencyStore.settings.currency = "EUR";
buildAccountCache(currencyStore, [{ code:"401", label:"Fournisseurs", type:"liability" }]);
currencyStore.entries = [
  { id:1,date:"2026-01-01",journal:"ACH",reference:"A",lines:[{account:"401",third:"X",credit:20,debit:0,currency:"EUR"}] },
  { id:2,date:"2026-01-02",journal:"BAN",reference:"B",lines:[{account:"401",third:"X",debit:20,credit:0,currency:"USD"}] },
];
assert.equal(buildThirdPartyReconciliation(currencyStore).totals.proposals, 0, "les devises différentes ne sont jamais compensées");

const mixedCurrencyStore = newStore();
mixedCurrencyStore.settings.currency = "XOF";
mixedCurrencyStore.entries = [
  { id: 1, date: "2026-01-01", journal: "ACH", reference: "A", lines: [{ account: "401", third: "T", credit: 30, debit: 0, currency: "EUR" }] },
  { id: 2, date: "2026-01-02", journal: "ACH", reference: "B", lines: [{ account: "401", third: "T", credit: 40, debit: 0, currency: "USD" }] },
];
const mixedReport = buildThirdPartyReconciliation(mixedCurrencyStore);
assert.deepEqual(mixedReport.totals.openCreditByCurrency, { EUR: 30, USD: 40 }, "les soldes ouverts sont séparés par devise");

// Une modification ultérieure d'une ligne ne doit pas hériter silencieusement
// d'un lettrage qui pointait auparavant vers le même index.
const staleStore = newStore();
staleStore.settings.currency = "XOF";
staleStore.entries = [
  { id: 1, date: "2026-01-01", journal: "ACH", reference: "A", lines: [{ account: "401", third: "T", credit: 20, debit: 0 }] },
  { id: 2, date: "2026-01-02", journal: "BAN", reference: "B", lines: [{ account: "401", third: "T", debit: 20, credit: 0 }] },
];
const staleProposal = buildThirdPartyReconciliation(staleStore).proposals[0];
const staleRecord = applyThirdPartyLettrage(staleStore, staleProposal);
staleStore.entries[0].lines[0].third = "Autre tiers";
const staleReport = buildThirdPartyReconciliation(staleStore);
assert.equal(staleReport.totals.staleLinkCount, 1, "un lettrage devenu incohérent est neutralisé");
assert.equal(staleReport.totals.openDebitByCurrency.XOF, 20);
assert.equal(staleReport.totals.openCreditByCurrency.XOF, undefined);
assert.equal(staleRecord.status, "active", "l'historique est conservé pour audit");

console.log("✓ Lettrage tiers : ventilation partielle, séparation des tiers/devises, validation, annulation, intégrité des liens et conservation des écritures.");
