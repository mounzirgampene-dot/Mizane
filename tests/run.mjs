// MIZANE — Tests du moteur comptable. Exécution : node tests/run.mjs
import { strict as assert } from "node:assert";
import { cleanSecrets, fingerprint, localSnapshot, orderOperations, restoreAccountingFromCloud, syncAccounting, validateSyncStore } from "../js/accounting-sync.js";
import {
  newStore, validDate, validateEntry, postEntry, reverseEntry, trialBalance, ledger,
  incomeStatement, balanceSheet, checkAnomalies, cashBalance, toCSV, buildAccountCache,
} from "../js/accounting.js";
import { allAccounts, findAccount, searchAccounts, PLANS } from "../js/plans.js";
import { searchAccountsByDescription } from "../js/account-autocomplete.js";
import { COUNTRIES, formatMoney, getCountry, getCurrencyInfo, currencyOptionLabel } from "../js/countries.js";
import { validateBackup } from "../js/db.js";
import { parseBankCSV, matchBankLines, diagnoseBankLine } from "../js/finance.js";
import { calculateBillingTotals, calculateOutstandingBase, calculatePaymentBalance, convertBillingAmount, makeBillingNumber, migrateLegacyInvoicePayment, validateBillingDocument, validateBillingPayment } from "../js/billing-core.js";
import { buildBillingJournalEntries, suggestBillingAccounts } from "../js/billing-accounting.js";
import { addClosedPeriod, isDateInClosedPeriod, removeClosedPeriod, validatePeriodRange } from "../js/periods.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\n    " + e.message); }
}

test("référentiel international : pays uniques et devises locales reconnues", () => {
  assert.ok(COUNTRIES.length >= 190, "le référentiel doit couvrir les pays et territoires courants");
  assert.equal(new Set(COUNTRIES.map((country) => country.code)).size, COUNTRIES.length, "aucun code pays en double");
  assert.equal(getCountry("MA").currency, "MAD");
  assert.equal(getCountry("US").currency, "USD");
  assert.equal(getCountry("JP").currency, "JPY");
  assert.equal(getCountry("BG").currency, "EUR", "la Bulgarie utilise l’euro depuis janvier 2026");
  assert.equal(getCountry("OTHER").currency, "XXX");
});
test("périodes comptables : validation des dates et détection des chevauchements", () => {
  assert.equal(validatePeriodRange("2026-01-01", "2026-12-31").ok, true);
  assert.equal(validatePeriodRange("2026-12-31", "2026-01-01").ok, false);
  assert.equal(validatePeriodRange("2026-02-30", "2026-12-31").ok, false);
  const periods = addClosedPeriod([], { startDate: "2026-01-01", endDate: "2026-12-31" });
  assert.equal(isDateInClosedPeriod("2026-06-15", periods), true);
  assert.equal(isDateInClosedPeriod("2027-01-01", periods), false);
  assert.throws(() => addClosedPeriod(periods, { startDate: "2026-12-01", endDate: "2027-01-31" }), /chevauche/);
  assert.equal(removeClosedPeriod(periods, "2026-01-01", "2026-12-31").length, 0);
});
test("périodes comptables : une écriture nouvelle est refusée dans une période clôturée", () => {
  const store = newStore();
  store.settings.closedPeriods = [{ startDate: "2026-01-01", endDate: "2026-12-31", status: "closed" }];
  const result = postEntry(store, { date: "2026-06-15", journal: "OD", reference: "TEST", lines: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Période comptable clôturée/);
  assert.equal(store.entries.length, 0);
});

test("périodes comptables : une écriture clôturée ne peut pas être contrepassée", () => {
  const store = newStore();
  store.entries.push({ id: 1, date: "2026-06-15", journal: "OD", reference: "TEST", reversed: false, lines: [] });
  store.settings.closedPeriods = [{ startDate: "2026-01-01", endDate: "2026-12-31", status: "closed" }];
  const result = reverseEntry(store, 1, "2027-01-01");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Période comptable clôturée/);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].reversed, false);
});

test("présentation des devises : nom, code et symbole", () => {
  const info = getCurrencyInfo("MAD", "fr");
  assert.equal(info.code, "MAD");
  assert.ok(info.name && info.name !== "MAD");
  assert.ok(info.symbol);
  assert.match(currencyOptionLabel("EUR", "fr"), /EUR/);
});
console.log("— Facturation internationale —");
test("calcul des totaux de facture : HT, taxe et TTC", () => {
  assert.deepEqual(calculateBillingTotals([
    { quantity: 2, unitPrice: 100, taxRate: 20 },
    { quantity: 1, unitPrice: 50, taxRate: 10 },
  ]), { ht: 250, tax: 45, ttc: 295 });
});
test("créances multi-devises : conversion dans la devise comptable", () => {
  assert.equal(calculateOutstandingBase([
    { type: "invoice", status: "issued", totals: { ttc: 100 }, paidAmount: 20, exchangeRate: 10 },
    { type: "invoice", status: "cancelled", totals: { ttc: 500 }, paidAmount: 0, exchangeRate: 10 },
    { type: "quote", status: "issued", totals: { ttc: 200 }, paidAmount: 0, exchangeRate: 10 },
  ]), 800);
});
test("conversion de devise : conserve le taux appliqué", () => {
  assert.equal(convertBillingAmount(100, 10.25), 1025);
  assert.throws(() => convertBillingAmount(100, 0), /taux de change invalide/);
});
test("numérotation distincte des devis et factures", () => {
  assert.equal(makeBillingNumber("quote", 2026, 2, { prefixQuote: "DEV" }), "DEV-2026-0002");
  assert.equal(makeBillingNumber("invoice", 2026, 9, { prefixInvoice: "INV" }), "INV-2026-0009");
});
test("validation facture internationale", () => {
  const valid = { type: "invoice", date: "2026-11-19", customerName: "Client", currency: "EUR", exchangeRate: 10.5, lines: [{ description: "Prestation", quantity: 2, unitPrice: 100, taxRate: 20 }] };
  assert.equal(validateBillingDocument(valid).ok, true);
  assert.equal(validateBillingDocument({ ...valid, exchangeRate: 0 }).ok, false);
  assert.equal(validateBillingDocument({ ...valid, currency: "EURO" }).ok, false);
  assert.equal(validateBillingDocument({ ...valid, date: "2026-02-31" }).ok, false);
});
test("paiements de facture : paiements partiels et solde restant", () => {
  const payments = [{ amount: 300 }, { amount: 200 }];
  assert.equal(calculatePaymentBalance(1200, payments), 700);
  assert.equal(calculatePaymentBalance(1200, [...payments, { amount: 700 }]), 0);
});
test("facturation : une ancienne avance avec paiements absents est reprise dans l'historique", () => {
  const invoice = { type: "invoice", date: "2026-05-10", currency: "MAD", paidAmount: 350, totals: { ttc: 1000 } };
  const migrated = migrateLegacyInvoicePayment(invoice, 12);
  assert.equal(migrated.payments.length, 1);
  assert.equal(migrated.payments[0].id, 12);
  assert.equal(migrated.payments[0].amount, 350);
  assert.equal(migrated.payments[0].method, "legacy");
  assert.equal(migrated.payments[0].legacyImported, true);
  assert.equal(migrated.nextPaymentId, 13);
  assert.equal(calculatePaymentBalance(1000, migrated.payments), 650);
});
test("facturation : une ancienne avance est aussi reprise si la liste des paiements est vide", () => {
  const invoice = { type: "invoice", date: "2026-05-11", currency: "MAD", paidAmount: 125, payments: [] };
  const first = migrateLegacyInvoicePayment(invoice, 4);
  const second = migrateLegacyInvoicePayment({ ...invoice, payments: first.payments }, first.nextPaymentId);
  assert.equal(first.payments.length, 1);
  assert.equal(second.payments.length, 1, "la migration ne doit pas créer de doublon");
  assert.equal(second.nextPaymentId, 5);
});
test("facturation : les paiements existants et les factures sans avance ne sont pas modifiés", () => {
  const existing = [{ id: 2, amount: 80, method: "bank" }];
  assert.equal(migrateLegacyInvoicePayment({ paidAmount: 80, payments: existing }, 3).payments, existing);
  const empty = migrateLegacyInvoicePayment({ paidAmount: 0, payments: [] }, 3);
  assert.equal(empty.payments.length, 0);
  assert.equal(empty.nextPaymentId, 3);
});
test("paiements de facture : validation et refus du trop-perçu", () => {
  const invoice = { type: "invoice", status: "issued", currency: "EUR", totals: { ttc: 1000 } };
  const payment = { date: "2026-11-19", amount: 400, method: "bank", currency: "EUR" };
  assert.equal(validateBillingPayment(payment, invoice, []).ok, true);
  assert.equal(validateBillingPayment({ ...payment, amount: 1001 }, invoice, []).ok, false);
  assert.equal(validateBillingPayment({ ...payment, date: "2026-02-30" }, invoice, []).ok, false);
  assert.equal(validateBillingPayment({ ...payment, method: "crypto" }, invoice, []).ok, false);
  assert.equal(validateBillingPayment(payment, { ...invoice, status: "cancelled" }, []).ok, false);
});
console.log("— Comptabilisation automatique des factures —");
test("facture multi-devises : génère une vente équilibrée et un règlement en devise comptable", () => {
  const s = newStore();
  s.settings.plan = "syscohada";
  buildAccountCache(s, allAccounts("syscohada"));
  const accounts = allAccounts("syscohada");
  const mapping = suggestBillingAccounts("syscohada", accounts);
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-2026-0001", date: "2026-11-19",
    customerName: "Client Démo", currency: "EUR", exchangeRate: 10,
    lines: [{ description: "Prestation", quantity: 2, unitPrice: 100, taxRate: 20 }],
    payments: [{ id: 1, date: "2026-11-19", amount: 50, method: "bank", exchangeRate: 10 }],
  };
  const result = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(result.ok, true, result.errors.join(" "));
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].journal, "VTE");
  assert.equal(result.entries[0].lines[0].account, mapping.customer);
  assert.equal(result.entries[0].lines[0].debit, 2400);
  assert.equal(result.entries[0].lines[1].credit, 2000);
  assert.equal(result.entries[0].lines[2].credit, 400);
  assert.equal(result.entries[1].journal, "BAN");
  assert.equal(result.entries[1].lines[0].debit, 500);
  assert.equal(result.entries[1].lines[1].credit, 500);
  for (const entry of result.entries) {
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
    assert.equal(debit, credit);
  }
});
test("facturation : aucun doublon de facture ou de paiement", () => {
  const s = newStore();
  s.settings.plan = "pcg";
  buildAccountCache(s, allAccounts("pcg"));
  const mapping = suggestBillingAccounts("pcg", allAccounts("pcg"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-2026-0002", date: "2026-11-19",
    customerName: "Client", currency: "MAD", exchangeRate: 1,
    lines: [{ description: "Produit", quantity: 1, unitPrice: 100, taxRate: 0 }],
    payments: [{ id: 4, date: "2026-11-19", amount: 25, method: "cash", exchangeRate: 1 }],
  };
  const first = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(first.entries.length, 2);
  s.entries.push(...first.entries);
  const second = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(second.ok, true);
  assert.equal(second.entries.length, 0);
});
test("facturation : refuse un compte de vente incompatible avec le plan", () => {
  const s = newStore();
  buildAccountCache(s, allAccounts("syscohada"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-TEST", date: "2026-11-19",
    customerName: "Client", currency: "XOF", exchangeRate: 1,
    lines: [{ description: "Service", quantity: 1, unitPrice: 100, taxRate: 0 }], payments: [],
  };
  const result = buildBillingJournalEntries(s, invoice, { customer: "411", revenue: "999999" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /produits/);
});
for (const planId of Object.keys(PLANS)) {
  test("comptabilisation : comptes suggérés compatibles avec le plan " + planId, () => {
    const accounts = allAccounts(planId);
    const mapping = suggestBillingAccounts(planId, accounts);
    assert.ok(accounts.some(account => account.code === mapping.customer && account.type === "asset"));
    assert.ok(accounts.some(account => account.code === mapping.revenue && account.type === "income"));
    assert.ok(accounts.some(account => account.code === mapping.bank && account.type === "asset"));
    assert.ok(accounts.some(account => account.code === mapping.cash && account.type === "asset"));
    assert.ok(accounts.some(account => account.code === mapping.tax && account.type === "liability"));
  });
}
test("facturation : ne recrée jamais automatiquement une écriture contrepassée", () => {
  const s = newStore();
  s.settings.plan = "syscohada";
  buildAccountCache(s, allAccounts("syscohada"));
  const mapping = suggestBillingAccounts("syscohada", allAccounts("syscohada"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-REVERSED", date: "2026-11-19",
    customerName: "Client", currency: "XOF", exchangeRate: 1,
    lines: [{ description: "Prestation", quantity: 1, unitPrice: 100, taxRate: 0 }], payments: [],
  };
  s.entries.push({ reference: "FACTURE FAC-REVERSED", reversed: true });
  const result = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /contrepassée/);
});
test("écarts de change : comptabilise un gain lors d'un règlement à un taux supérieur", () => {
  const s = newStore();
  s.settings.plan = "syscohada";
  buildAccountCache(s, allAccounts("syscohada"));
  const mapping = suggestBillingAccounts("syscohada", allAccounts("syscohada"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-FX-GAIN", date: "2026-11-19",
    customerName: "Client", currency: "EUR", exchangeRate: 10,
    lines: [{ description: "Service", quantity: 1, unitPrice: 100, taxRate: 0 }],
    payments: [{ id: 1, date: "2026-11-20", amount: 40, method: "bank", exchangeRate: 11 }],
  };
  const result = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(result.ok, true, result.errors.join(" "));
  const payment = result.entries.find(entry => entry.reference.includes("REGLEMENT"));
  assert.equal(payment.lines[0].debit, 440);
  assert.equal(payment.lines[1].credit, 40);
  assert.equal(payment.lines[1].account, mapping.fxGain);
  assert.equal(payment.lines[2].credit, 400);
  assert.equal(payment.lines.reduce((sum, line) => sum + line.debit, 0), payment.lines.reduce((sum, line) => sum + line.credit, 0));
});
test("écarts de change : comptabilise une perte lors d'un règlement à un taux inférieur", () => {
  const s = newStore();
  s.settings.plan = "syscohada";
  buildAccountCache(s, allAccounts("syscohada"));
  const mapping = suggestBillingAccounts("syscohada", allAccounts("syscohada"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-FX-LOSS", date: "2026-11-19",
    customerName: "Client", currency: "EUR", exchangeRate: 10,
    lines: [{ description: "Service", quantity: 1, unitPrice: 100, taxRate: 0 }],
    payments: [{ id: 2, date: "2026-11-20", amount: 40, method: "cash", exchangeRate: 9 }],
  };
  const result = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(result.ok, true, result.errors.join(" "));
  const payment = result.entries.find(entry => entry.reference.includes("REGLEMENT"));
  assert.equal(payment.lines[0].debit, 360);
  assert.equal(payment.lines[1].debit, 40);
  assert.equal(payment.lines[1].account, mapping.fxLoss);
  assert.equal(payment.lines[2].credit, 400);
  assert.equal(payment.journal, "CAI");
  assert.equal(payment.lines.reduce((sum, line) => sum + line.debit, 0), payment.lines.reduce((sum, line) => sum + line.credit, 0));
});
test("écart de change : bloque si le compte de perte n'est pas configuré", () => {
  const s = newStore();
  s.settings.plan = "pcg";
  buildAccountCache(s, allAccounts("pcg"));
  const mapping = suggestBillingAccounts("pcg", allAccounts("pcg"));
  const invoice = {
    type: "invoice", status: "issued", number: "FAC-FX-MISSING", date: "2026-11-19",
    customerName: "Client", currency: "EUR", exchangeRate: 10,
    lines: [{ description: "Service", quantity: 1, unitPrice: 100, taxRate: 0 }],
    payments: [{ id: 3, date: "2026-11-20", amount: 40, method: "bank", exchangeRate: 9 }],
  };
  const result = buildBillingJournalEntries(s, invoice, mapping);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /perte de change/);
});
console.log("— Plans comptables —");
for (const id of Object.keys(PLANS)) {
  test(`plan ${id} : codes uniques et types valides`, () => {
    const accts = allAccounts(id);
    assert.ok(accts.length > 40, "trop peu de comptes : " + accts.length);
    const codes = new Set();
    for (const a of accts) {
      assert.ok(!codes.has(a.code), "code dupliqué " + a.code);
      codes.add(a.code);
      assert.ok(["asset", "liability", "equity", "expense", "income"].includes(a.type), "type invalide " + a.code);
    }
  });
}
test("findAccount : correspondance exacte puis par préfixe", () => {
  assert.equal(findAccount("syscohada", "401").code, "401");
  assert.equal(findAccount("syscohada", "4012").code, "401");
  assert.equal(findAccount("syscohada", ""), null);
});
test("searchAccounts par mot-clé", () => {
  const res = searchAccounts("syscohada", "client");
  assert.ok(res.length > 0 && res.some((a) => a.code === "411"));
});

test("recherche par libellé d'opération : vocabulaire courant", () => {
  const accounts = allAccounts("syscohada");
  const cases = [
    ["règlement fournisseur", "401"],
    ["paiement des salaires", "661"],
    ["facture internet", "628"],
    ["achat de carburant", "61"],
    ["réparation du véhicule", "624"],
    ["assurance du local", "625"],
    ["vente de marchandises", "701"],
    ["frais bancaires", "631"],
    ["achat de matériel informatique", "6055"],
  ];
  for (const [query, expectedCode] of cases) {
    const results = searchAccountsByDescription(accounts, query);
    assert.ok(results.some((account) => account.code === expectedCode),
      `le libellé "${query}" doit proposer le compte ${expectedCode}; reçus : ${results.map((a) => a.code).join(", ")}`);
  }
});

test("opérations comptables complémentaires : charges, immobilisations, trésorerie et régularisations", () => {
  const accounts = allAccounts("syscohada");
  const cases = [
    ["charges sociales patronales", "664"],
    ["cotisations sociales part salariale", "431"],
    ["impôt sur les salaires ITS IRPP", "441"],
    ["achat de fournitures de bureau", "6052"],
    ["entretien et réparations des biens immobiliers", "624"],
    ["primes d'assurance multirisque véhicule", "625"],
    ["publicité et relations publiques", "627"],
    ["transport sur achats", "611"],
    ["transport sur ventes", "612"],
    ["intérêts d'emprunt", "671"],
    ["perte de change", "675"],
    ["escompte accordé", "673"],
    ["achat de matériel roulant véhicule", "2455"],
    ["acquisition de logiciel", "213"],
    ["paiement fournisseur par chèque", "402"],
    ["virement interne banque vers caisse", "58"],
    ["dotations aux amortissements", "681"],
  ];
  for (const [query, expectedCode] of cases) {
    const results = searchAccountsByDescription(accounts, query);
    assert.ok(results.some((account) => account.code === expectedCode),
      `le libellé "${query}" doit proposer le compte ${expectedCode}; reçus : ${results.map((a) => a.code).join(", ")}`);
  }
});

test("opérations complémentaires : suggestions disponibles sur les quatre plans", () => {
  for (const planId of Object.keys(PLANS)) {
    const accounts = allAccounts(planId);
    for (const query of [
      "charges sociales patronales",
      "cotisations sociales part salariale",
      "impôt sur les salaires ITS IRPP",
      "achat de fournitures de bureau",
      "entretien des biens immobiliers",
      "assurance multirisque véhicule",
      "publicité relations publiques",
      "transport sur achats",
      "transport sur ventes",
      "intérêts d'emprunt",
      "perte de change",
      "escompte accordé",
      "achat de matériel roulant",
      "achat de mobilier de bureau",
      "acquisition de logiciel",
      "encaissement client par Mobile Money",
      "paiement fournisseur par chèque",
      "virement interne banque vers caisse",
      "charges constatées d'avance",
      "produits constatés d'avance",
      "dotations aux amortissements",
    ]) {
      assert.ok(searchAccountsByDescription(accounts, query).length > 0,
        `aucune suggestion pour "${query}" dans le plan ${planId}`);
    }
  }
});

test("recherche par libellé d'opération sur les quatre plans", () => {
  for (const planId of Object.keys(PLANS)) {
    const accounts = allAccounts(planId);
    for (const query of ["paiement du loyer", "achat de fournitures", "facture internet", "paiement des salaires"]) {
      assert.ok(searchAccountsByDescription(accounts, query).length > 0,
        `aucune suggestion pour "${query}" dans le plan ${planId}`);
    }
  }
});

console.log("— Pays —");
test("chaque pays référence un plan existant", () => {
  for (const c of COUNTRIES) assert.ok(PLANS[c.plan], "plan inconnu " + c.plan);
});
test("formatMoney ne lève pas d'exception", () => {
  assert.ok(typeof formatMoney(1234.5, "XOF", "fr-SN") === "string");
});

console.log("— Moteur comptable —");
function freshStore() {
  const s = newStore();
  buildAccountCache(s, allAccounts(s.settings.plan));
  return s;
}

test("écriture équilibrée acceptée", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "BAN", reference: "T1",
    lines: [
      { account: "521", label: "Banque", debit: 1000, credit: 0 },
      { account: "101", label: "Capital", debit: 0, credit: 1000 },
    ],
  });
  assert.equal(res.ok, true, res.errors.join(","));
  assert.equal(s.entries.length, 1);
  assert.equal(s.nextId, 2);
});

test("écriture déséquilibrée refusée", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "BAN",
    lines: [
      { account: "521", debit: 1000, credit: 0 },
      { account: "101", debit: 0, credit: 900 },
    ],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("non équilibrée")));
});

test("compte inconnu refusé", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-10", journal: "OD",
    lines: [
      { account: "9999", debit: 100, credit: 0 },
      { account: "521", debit: 0, credit: 100 },
    ],
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("inconnu")));
});

test("débit et crédit simultanés refusés", () => {
  const s = freshStore();
  const res = validateEntry(s, {
    date: "2025-01-10", journal: "OD",
    lines: [
      { account: "521", debit: 100, credit: 50 },
      { account: "101", debit: 0, credit: 50 },
    ],
  });
  assert.equal(res.ok, false);
});

test("moins de deux lignes refusé", () => {
  const s = freshStore();
  const res = validateEntry(s, { date: "2025-01-10", journal: "OD", lines: [{ account: "521", debit: 100, credit: 0 }] });
  assert.equal(res.ok, false);
});

test("contrepassation inverse débits et crédits", () => {
  const s = freshStore();
  const e = postEntry(s, {
    date: "2025-01-10", journal: "BAN",
    lines: [
      { account: "521", debit: 500, credit: 0 },
      { account: "701", debit: 0, credit: 500 },
    ],
  }).entry;
  const rev = reverseEntry(s, e.id);
  assert.equal(rev.ok, true);
  assert.equal(s.entries.length, 2);
  assert.equal(s.entries[0].reversed, true);
  assert.equal(reverseEntry(s, e.id).ok, false, "une seconde contrepassation doit être refusée");
  assert.equal(reverseEntry(s, e.id, "2025-02-30").ok, false, "une date impossible doit être refusée");
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.equal(tb.totals.debit, 1000);
  const gl = ledger(s, "521");
  assert.equal(gl.totals.solde, 0);
});

test("balance générale : totaux et soldes", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-01-05", journal: "BAN",
    lines: [
      { account: "521", debit: 100000, credit: 0 },
      { account: "101", debit: 0, credit: 100000 },
    ],
  });
  postEntry(s, {
    date: "2025-01-20", journal: "ACH",
    lines: [
      { account: "601", debit: 50000, credit: 0 },
      { account: "4453", debit: 9000, credit: 0 },
      { account: "401", debit: 0, credit: 59000 },
    ],
  });
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, 159000);
  assert.equal(tb.totals.credit, 159000);
  assert.equal(tb.totals.soldeDebit, tb.totals.soldeCredit);
  const row401 = tb.rows.find((r) => r.code === "401");
  assert.equal(row401.soldeCredit, 59000);
});

test("filtre de période sur la balance", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-01-05", journal: "BAN",
    lines: [{ account: "521", debit: 1000, credit: 0 }, { account: "101", debit: 0, credit: 1000 }],
  });
  postEntry(s, {
    date: "2025-06-05", journal: "BAN",
    lines: [{ account: "521", debit: 500, credit: 0 }, { account: "701", debit: 0, credit: 500 }],
  });
  const tb = trialBalance(s, "2025-01-01", "2025-03-31");
  assert.equal(tb.totals.debit, 1000);
});

test("compte de résultat : charges, produits, résultat", () => {
  const s = freshStore();
  postEntry(s, {
    date: "2025-02-01", journal: "VTE",
    lines: [{ account: "571", debit: 118000, credit: 0 }, { account: "701", debit: 0, credit: 100000 }, { account: "4431", debit: 0, credit: 18000 }],
  });
  postEntry(s, {
    date: "2025-02-02", journal: "ACH",
    lines: [{ account: "601", debit: 40000, credit: 0 }, { account: "571", debit: 0, credit: 40000 }],
  });
  const is = incomeStatement(s);
  assert.equal(is.totProduits, 100000);
  assert.equal(is.totCharges, 40000);
  assert.equal(is.resultat, 60000);
});

test("bilan équilibré avec résultat intégré", () => {
  const s = freshStore();
  postEntry(s, { date: "2025-01-01", journal: "BAN", lines: [{ account: "521", debit: 1000000, credit: 0 }, { account: "101", debit: 0, credit: 1000000 }] });
  postEntry(s, { date: "2025-02-01", journal: "VTE", lines: [{ account: "571", debit: 118000, credit: 0 }, { account: "701", debit: 0, credit: 100000 }, { account: "4431", debit: 0, credit: 18000 }] });
  postEntry(s, { date: "2025-02-02", journal: "ACH", lines: [{ account: "601", debit: 40000, credit: 0 }, { account: "571", debit: 0, credit: 40000 }] });
  const b = balanceSheet(s);
  assert.equal(b.totActif, b.totPassif, "actif " + b.totActif + " ≠ passif " + b.totPassif);
  assert.equal(b.resultat, 60000);
});

test("trésorerie (classe 5)", () => {
  const s = freshStore();
  postEntry(s, { date: "2025-01-01", journal: "CAI", lines: [{ account: "571", debit: 2000, credit: 0 }, { account: "701", debit: 0, credit: 2000 }] });
  postEntry(s, { date: "2025-01-02", journal: "BAN", lines: [{ account: "6221", debit: 800, credit: 0 }, { account: "521", debit: 0, credit: 800 }] });
  assert.equal(cashBalance(s), 1200);
});

test("détection des anomalies : doublon et compte inconnu", () => {
  const s = freshStore();
  const lines = [{ account: "521", debit: 100, credit: 0 }, { account: "701", debit: 0, credit: 100 }];
  postEntry(s, { date: "2025-01-01", journal: "VTE", reference: "X", lines });
  postEntry(s, { date: "2025-01-01", journal: "VTE", reference: "X", lines: lines.map((l) => ({ ...l })) });
  s.entries.push({ id: 99, date: "2025-01-02", journal: "OD", reference: "", reversed: false, reverseOf: null, createdAt: "", lines: [{ account: "9999", label: "", third: "", debit: 10, credit: 0 }, { account: "521", label: "", third: "", debit: 0, credit: 10 }] });
  const a = checkAnomalies(s);
  assert.ok(a.some((x) => x.type === "doublon"));
  assert.ok(a.some((x) => x.type === "compte_inconnu"));
});

test("arrondi monétaire à 2 décimales", () => {
  const s = freshStore();
  const res = postEntry(s, {
    date: "2025-01-01", journal: "OD",
    lines: [{ account: "521", debit: 10.005, credit: 0 }, { account: "701", debit: 0, credit: 10.005 }],
  });
  assert.equal(res.entry.lines[0].debit, 10.01);
});

await testAsync("import local de texte : une écriture par ligne", async () => {
  const { parseEntriesFromTextLocal } = await import("../js/ai.js");
  const s = freshStore();
  const arr = parseEntriesFromTextLocal(s, "2025-03-01 601 401 25000 Achat marchandises\n521 701 10000 Vente au comptant\nligne incompréhensible");
  assert.equal(arr.length, 2);
  assert.equal(arr[0].date, "2025-03-01");
  assert.equal(arr[0].lines[0].debit, 25000);
  assert.equal(arr[0].lines[1].credit, 25000);
  assert.equal(arr[1].journal, "VTE");
  const res = postEntry(s, arr[0]);
  assert.equal(res.ok, true, res.errors.join(","));
});

await testAsync("facture : HTML avec en-tête et total TTC", async () => {
  const { invoiceHTML } = await import("../js/invoice.js");
  const s = freshStore();
  const e = postEntry(s, {
    date: "2025-02-01", journal: "VTE", reference: "FCT-001",
    lines: [
      { account: "411", label: "Client Karim", third: "Karim", debit: 118000, credit: 0 },
      { account: "701", label: "Ventes", debit: 0, credit: 100000 },
      { account: "4431", label: "TVA facturée", debit: 0, credit: 18000 },
    ],
  }).entry;
  const html = invoiceHTML(s, e);
  assert.ok(html.includes("FACTURE"));
  assert.ok(html.includes("FCT-001"));
  assert.ok(html.includes("Karim"));
  assert.ok(html.includes("Total TTC"));
  assert.ok(html.includes("Total HT"));
});

test("export CSV", () => {
  const csv = toCSV([{ a: 1, b: "x;y" }]);
  assert.ok(csv.includes('"x;y"'));
});

await testAsync("données de démonstration équilibrées", async () => {
  const { demoData } = await import("../js/db.js");
  const s = freshStore();
  demoData(s);
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.ok(s.entries.length >= 8);
});

console.log("— Amortissements (finance.js) —");
await testAsync("amortissement linéaire : annuité constante, VNC nulle à la fin", async () => {
  const { amortizationSchedule } = await import("../js/finance.js");
  const sched = amortizationSchedule(10000, 5, "lineaire");
  assert.equal(sched.length, 5);
  for (const r of sched) assert.equal(r.annuite, 2000);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
});

await testAsync("amortissement dégressif : cumul final = valeur, VNC nulle", async () => {
  const { amortizationSchedule, amortRate } = await import("../js/finance.js");
  const rate = amortRate(5, "degressif");
  assert.equal(rate, 0.35);
  const sched = amortizationSchedule(10000, 5, "degressif");
  assert.equal(sched.length, 5);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
  assert.ok(sched[0].annuite === 3500, "1re annuité dégressive = 3500");
});

await testAsync("nextAnnuity : reprend après cumul déjà amorti, 0 si terminé", async () => {
  const { nextAnnuity } = await import("../js/finance.js");
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 2000 }), 2000);
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 10000 }), 0);
});

await testAsync("dotationLines : 681 débit / 28x crédit, équilibrées", async () => {
  const { dotationLines } = await import("../js/finance.js");
  const lines = dotationLines([
    { name: "Moto", account: "2455", amount: 1500000, years: 5, method: "lineaire", amortized: 0 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].account, "681");
  assert.equal(lines[1].account, "2455".replace(/^2/, "28"));
  assert.equal(lines[0].debit, lines[1].credit);
});

console.log("— Clôture & à-nouveaux —");
await testAsync("closingProposal : clôture équilibrée, résultat au compte 12, à-nouveaux équilibrés", async () => {
  const { closingProposal } = await import("../js/finance.js");
  const s = freshStore();
  postEntry(s, { date: "2025-01-05", journal: "BAN", reference: "Capital", lines: [
    { account: "521", label: "Banque", debit: 1000000, credit: 0 },
    { account: "101", label: "Capital", debit: 0, credit: 1000000 },
  ] });
  postEntry(s, { date: "2025-03-01", journal: "VTE", reference: "V1", lines: [
    { account: "521", label: "Banque", debit: 500000, credit: 0 },
    { account: "701", label: "Ventes", debit: 0, credit: 500000 },
  ] });
  postEntry(s, { date: "2025-04-01", journal: "OD", reference: "Loyer", lines: [
    { account: "6221", label: "Loyer", debit: 200000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 200000 },
  ] });
  const { closing, anew, resultat } = closingProposal(s, "2025-01-01", "2025-12-31", "2026-01-01");
  assert.ok(closing, "écriture de clôture attendue");
  assert.ok(anew, "écriture d'à-nouveaux attendue");
  assert.equal(resultat, 300000);
  const totC = closing.lines.reduce((a, l) => a + l.debit, 0);
  assert.equal(totC, closing.lines.reduce((a, l) => a + l.credit, 0), "clôture équilibrée");
  const c12 = closing.lines.find((l) => l.account === "12");
  assert.ok(c12 && c12.credit === 300000, "compte 12 créditeur du bénéfice");
  const totA = anew.lines.reduce((a, l) => a + l.debit, 0);
  assert.equal(totA, anew.lines.reduce((a, l) => a + l.credit, 0), "à-nouveaux équilibrés");
  const codes = anew.lines.map((l) => l.account);
  for (const c of ["521", "101", "12"]) assert.ok(codes.includes(c), "compte " + c + " reporté");
});

console.log("— Rapprochement bancaire —");
await testAsync("parseBankCSV : JJ/MM/AAAA, AAAA-MM-JJ, en-tête ignoré", async () => {
  const { parseBankCSV } = await import("../js/finance.js");
  const txt = "Date;Libellé;Montant\n10/01/2025;Virement client;1 000 000\n2025-01-12;Fournisseur;-500,5\nligne invalide\n";
  const rows = parseBankCSV(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2025-01-10");
  assert.equal(rows[0].amount, 1000000);
  assert.equal(rows[1].date, "2025-01-12");
  assert.equal(rows[1].amount, -500.5);
});

await testAsync("matchBankLines : rapprochement par montant à ±4 jours sur classe 5", async () => {
  const { parseBankCSV, matchBankLines } = await import("../js/finance.js");
  const s = freshStore();
  postEntry(s, { date: "2025-01-08", journal: "BAN", reference: "V1", lines: [
    { account: "521", label: "Dépôt client", debit: 1000000, credit: 0 },
    { account: "411", label: "Client", debit: 0, credit: 1000000 },
  ] });
  const rows = parseBankCSV("10/01/2025;Virement client;1000000\n20/01/2025;Inconnu;999");
  const matched = matchBankLines(s, rows);
  assert.equal(matched[0].match, 1);
  assert.equal(matched[1].match, null);
});

await testAsync("rapprochement manuel : valide uniquement une écriture de trésorerie au montant exact", async () => {
  const { reconcileBankLine } = await import("../js/finance.js");
  const s = freshStore();
  postEntry(s, { date:"2025-01-08", journal:"BAN", reference:"V1", lines:[
    {account:"521",label:"Dépôt",debit:1000,credit:0},
    {account:"411",label:"Client",debit:0,credit:1000},
  ]});
  const result = reconcileBankLine({date:"2025-01-10",label:"Virement",amount:1000},1,s);
  assert.equal(result.status,"matched");
  assert.equal(result.manuallyMatched,true);
  assert.throws(() => reconcileBankLine({date:"2025-01-10",label:"Virement",amount:999},1,s),/ne correspond pas/);
});

await testAsync("rapprochement : identifiant stable pour ignorer les lignes déjà importées", async () => {
  const { bankLineKey } = await import("../js/finance.js");
  const line = {date:"2025-01-10",label:"Virement client",amount:1000};
  assert.equal(bankLineKey(line),bankLineKey({...line,label:" VIREMENT CLIENT "}));
  assert.notEqual(bankLineKey(line),bankLineKey({...line,amount:1001}));
});

console.log("— Cas limites —");
test("validateBackup accepte une sauvegarde équilibrée et nettoie les sections facultatives", () => {
  const backup = {
    version: 1,
    settings: { plan: "syscohada", customAccounts: [] },
    entries: [{
      id: 1, date: "2025-01-01", journal: "BAN", reference: "Ouverture",
      lines: [
        { account: "521", debit: 1000, credit: 0 },
        { account: "101", debit: 0, credit: 1000 },
      ],
    }],
    nextId: 2,
  };
  const clean = validateBackup(backup);
  assert.equal(clean.entries.length, 1);
  assert.deepEqual(clean.thirds, []);
  assert.deepEqual(clean.assets, []);
  assert.equal(clean.nextId, 2);
});

test("validateBackup rejette date impossible, déséquilibre et montants excessifs", () => {
  const base = {
    version: 1, settings: { plan: "syscohada", customAccounts: [] }, nextId: 2,
    entries: [{
      id: 1, date: "2025-01-01", journal: "BAN",
      lines: [{ account: "521", debit: 100, credit: 0 }, { account: "101", debit: 0, credit: 100 }],
    }],
  };
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], date: "2026-99-99" }] }), /date invalide/);
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], lines: [{ account: "521", debit: 100, credit: 0 }, { account: "101", debit: 0, credit: 90 }] }] }), /déséquilibrée/);
  assert.throws(() => validateBackup({ ...base, entries: [{ ...base.entries[0], lines: [{ account: "521", debit: 1e15, credit: 0 }, { account: "101", debit: 0, credit: 1e15 }] }] }), /montant invalide/);
});

test("validDate vérifie le calendrier sans dépendre du fuseau horaire", () => {
  assert.equal(validDate("2026-01-10"), true);
  assert.equal(validDate("2026-11-18"), true);
  assert.equal(validDate("2026-99-99"), false);
  assert.equal(validDate("2025-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
});

test("validateEntry refuse les montants négatifs", () => {
  const s = freshStore();
  const v = validateEntry(s, { date: "2025-01-01", journal: "OD", lines: [
    { account: "521", label: "A", debit: -100, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: -100 },
  ] });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("négatifs")));
});

test("exercice à cheval : entriesInRange filtre 2025 vs 2024", () => {
  const s = freshStore();
  postEntry(s, { date: "2024-12-31", journal: "OD", reference: "N-1", lines: [
    { account: "521", label: "A", debit: 100, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: 100 },
  ] });
  postEntry(s, { date: "2025-01-02", journal: "OD", reference: "N", lines: [
    { account: "521", label: "A", debit: 50, credit: 0 },
    { account: "101", label: "B", debit: 0, credit: 50 },
  ] });
  assert.equal(trialBalance(s, "2025-01-01", "2025-12-31").totals.debit, 50);
  assert.equal(trialBalance(s, "2024-01-01", "2024-12-31").totals.debit, 100);
});

console.log("— Fournisseurs IA —");
await testAsync("providerOf / visionModel : détection mistral, groq, gemini, custom", async () => {
  const { providerOf, visionModel } = await import("../js/ai.js");
  const mk = (ep) => ({ settings: { aiEndpoint: ep, aiModel: "m" } });
  assert.equal(providerOf(mk("https://api.mistral.ai/v1/chat/completions")), "mistral");
  assert.equal(providerOf(mk("https://api.groq.com/openai/v1/chat/completions")), "groq");
  assert.equal(providerOf(mk("https://generativelanguage.googleapis.com/v1beta")), "gemini");
  assert.equal(providerOf(mk("https://exemple.com/v1/chat/completions")), "custom");
  assert.equal(providerOf({ settings: { aiProvider: "custom", aiEndpoint: "https://api.mistral.ai/v1/chat/completions", aiModel: "m" } }), "custom",
    "le fournisseur explicitement choisi doit primer sur l'endpoint détecté");
  assert.equal(visionModel(mk("https://api.groq.com/openai/v1/chat/completions")), "meta-llama/llama-4-scout-17b-16e-instruct");
  assert.equal(visionModel(mk("https://generativelanguage.googleapis.com/v1beta")), "gemini-3.8-flash");
});

await testAsync("toGeminiBody : conversion messages texte et image", async () => {
  const { toGeminiBody } = await import("../js/ai.js");
  const body = toGeminiBody([
    { role: "system", content: "SYS" },
    { role: "user", content: "Bonjour" },
    { role: "assistant", content: "Réponse" },
    { role: "user", content: [{ type: "text", text: "Lis" }, { type: "image_url", image_url: "data:image/jpeg;base64,QUJD" }] },
  ], { json: true, temperature: 0.5 });
  assert.equal(body.systemInstruction.parts[0].text, "SYS");
  assert.equal(body.contents[0].role, "user");
  assert.equal(body.contents[1].role, "model");
  assert.deepEqual(body.contents[2].parts[1].inline_data, { mime_type: "image/jpeg", data: "QUJD" });
  assert.equal(body.generationConfig.response_mime_type, "application/json");
  assert.equal(body.generationConfig.temperature, 0.5);
});

await testAsync("chat : image_url encapsulée en {url} hors Mistral (mock fetch)", async () => {
  const { chat } = await import("../js/ai.js");
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  try {
    const s = { settings: { aiEndpoint: "https://api.groq.com/openai/v1/chat/completions", aiKey: "k", aiModel: "llama-3.3-70b-versatile", companyName: "T", country: "SN", currency: "XOF", plan: "syscohada", exerciceStart: "2025-01-01", exerciceEnd: "2025-12-31", customAccounts: [] } };
    await chat(s, [], [{ type: "text", text: "Lis" }, { type: "image_url", image_url: "data:image/jpeg;base64,QUJD" }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
    const img = calls[0].body.messages[1].content.find((p) => p.type === "image_url");
    assert.deepEqual(img.image_url, { url: "data:image/jpeg;base64,QUJD" });
  } finally { globalThis.fetch = orig; }
});

await testAsync("chat Gemini : modèle retiré -> nouvelle tentative avec le modèle actuel (mock fetch)", async () => {
  const { chat } = await import("../js/ai.js");
  const urls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return { ok: false, status: 404, text: async () => JSON.stringify({ error: { code: 404, message: "models/gemini-2.0-flash is no longer available" } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) };
  };
  try {
    const s = { settings: { aiEndpoint: "https://generativelanguage.googleapis.com/v1beta", aiKey: "k", aiModel: "gemini-2.0-flash", companyName: "T", country: "SN", currency: "XOF", plan: "syscohada", exerciceStart: "2025-01-01", exerciceEnd: "2025-12-31", customAccounts: [] } };
    const r = await chat(s, [], [{ type: "text", text: "Lis" }]);
    assert.equal(r, "ok");
    assert.ok(urls[0].includes("gemini-2.0-flash"));
    assert.ok(urls[1].includes("gemini-3.8-flash"));
  } finally { globalThis.fetch = orig; }
});

console.log("— Internationalisation —");
await testAsync("i18n : t() traduit, repli sur français, langue inconnue rejetée", async () => {
  const { t, setLang, lang, LANGS } = await import("../js/i18n.js");
  setLang("fr");
  assert.equal(lang(), "fr");
  assert.equal(t("Grand livre"), "Grand livre");
  setLang("en");
  assert.equal(t("Grand livre"), "General ledger");
  assert.equal(t("Texte inexistant"), "Texte inexistant");
  setLang("es");
  assert.equal(t("Enregistrer"), "Guardar");
  setLang("ar");
  assert.notEqual(t("Paramètres"), "Paramètres");
  setLang("xx");
  assert.equal(lang(), "fr");
  setLang("fr");
  assert.equal(LANGS.length, 4);
});

await testAsync("i18n : mêmes clés pour toutes les langues", async () => {
  const { DICT } = await import("../js/i18n.js");
  const counts = Object.values(DICT).map((d) => Object.keys(d).length);
  assert.ok(counts.length >= 3, "au moins 3 langues");
  assert.equal(new Set(counts).size, 1, "toutes les langues ont le même nombre de clés");
  assert.ok(counts[0] > 100, "dictionnaire substantiel");
});


console.log("— Synchronisation comptable —");

const sourceUid = "11111111-1111-4111-8111-111111111111";
const reverseUid = "22222222-2222-4222-8222-222222222222";
test("nettoyage des secrets : clés sensibles supprimées récursivement", () => {
  const value = cleanSecrets({ settings: { apiKey: "secret", company: "MIZANE", nested: [{ accessToken: "token", label: "ok" }] } });
  assert.deepEqual(value, { settings: { company: "MIZANE", nested: [{ label: "ok" }] } });
});
test("empreinte : indépendante de l'ordre des propriétés", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});
test("instantané local : identifiants clients stables et secrets exclus", () => {
  const store = {
    settings: { plan: "syscohada", apiKey: "NE_DOIT_PAS_SORTIR", customAccounts: [{ code: "471", label: "Attente", type: "asset" }] },
    thirds: [{ name: "Client test", type: "client", phone: "", email: "" }],
    assets: [],
    entries: [{ id: 1, date: "2025-01-01", journal: "OD", reference: "T1", lines: [{ account: "521", debit: 10, credit: 0 }, { account: "101", debit: 0, credit: 10 }] }]
  };
  const first = localSnapshot(store);
  const ids = [store.settings.customAccounts[0].client_uid, store.thirds[0].client_uid, store.entries[0].client_uid];
  const second = localSnapshot(store);
  assert.deepEqual([store.settings.customAccounts[0].client_uid, store.thirds[0].client_uid, store.entries[0].client_uid], ids);
  assert.deepEqual(Object.keys(first.custom_account), Object.keys(second.custom_account));
  assert.ok(!JSON.stringify(first).includes("NE_DOIT_PAS_SORTIR"));
  assert.ok(!JSON.stringify(first).includes("apiKey"));
});
test("validation sync : refuse les UUID clients dupliqués", () => {
  const uid = "12121212-1212-4121-8121-121212121212", store = makeValidationStore();
  store.thirds = [{ client_uid: uid, name: "Client A" }, { client_uid: uid, name: "Client B" }];
  assert.ok(validateSyncStore(store).some(message => message.includes("Identifiant client en double")));
});
test("validation sync : refuse les numéros internes d'écriture dupliqués", () => {
  const store = makeValidationStore(); store.entries = [makeValidEntry(1), makeValidEntry(1)];
  assert.ok(validateSyncStore(store).some(message => message.includes("Numéro d'écriture en double")));
});
test("validation sync : bloque une écriture déséquilibrée", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[1].credit = 90; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("non équilibrée")));
});
test("validation sync : refuse un compte absent du plan comptable", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[0].account = "999999"; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("inconnu dans le plan")));
});
test("validation sync : refuse un tiers absent ou ambigu dans les lignes", () => {
  const store = makeValidationStore(), entry = makeValidEntry(1); entry.lines[0].third = "Tiers fantôme"; store.entries = [entry];
  assert.ok(validateSyncStore(store).some(message => message.includes("introuvable")));
  store.thirds = [{ client_uid: "13131313-1313-4131-8131-131313131313", name: "Tiers fantôme" }, { client_uid: "14141414-1414-4141-8141-141414141414", name: "Tiers fantôme" }];
  assert.ok(validateSyncStore(store).some(message => message.includes("ambigu")));
});
await testAsync("validation sync : aucune opération cloud si les données locales sont invalides", async () => {
  const companyId = "company-invalid-before-push", store = makeSyncStore(), entry = makeValidEntry(1);
  entry.lines[1].credit = 99; store.entries = [entry];
  const storage = memoryStorage(); storage.setItem("mizane_v1", JSON.stringify(store)); seedShadow(storage, companyId);
  const cloud = makeCloud(companyId), previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Synchronisation bloquée/);
    assert.equal(cloud.pushes, 0);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});

test("ordre des lots : écriture d'origine avant sa contrepassation", () => {
  const operations = [
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } },
    { entity_type: "third", operation: "upsert", client_uid: "33333333-3333-4333-8333-333333333333", data: {} },
    { entity_type: "entry", operation: "upsert", client_uid: sourceUid, data: { reverse_of_client_uid: null } }
  ];
  const ordered = orderOperations(operations);
  assert.equal(ordered[0].entity_type, "third");
  assert.deepEqual(ordered.slice(1).map(x => x.client_uid), [sourceUid, reverseUid]);
});
test("ordre des lots : cycle de contrepassation refusé", () => {
  assert.throws(() => orderOperations([
    { entity_type: "entry", operation: "upsert", client_uid: sourceUid, data: { reverse_of_client_uid: reverseUid } },
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } }
  ]), /dépendance circulaire/);
});
test("ordre des lots : contrepassation et suppression de l'origine refusées ensemble", () => {
  assert.throws(() => orderOperations([
    { entity_type: "entry", operation: "delete", client_uid: sourceUid, data: {} },
    { entity_type: "entry", operation: "upsert", client_uid: reverseUid, data: { reverse_of_client_uid: sourceUid } }
  ]), /écriture d'origine est supprimée/);
});


async function testAsync(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\\n    " + (e.stack || e.message)); }
}
function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}
function makeValidationStore() {
  return { settings: { plan: "syscohada", customAccounts: [] }, thirds: [{ client_uid: "15151515-1515-4151-8151-151515151515", name: "Fournisseur Démo", type: "fournisseur" }], assets: [], entries: [], nextId: 2 };
}
function makeValidEntry(id = 1) {
  return { client_uid: `16161616-1616-4161-8161-${String(id).padStart(12, "0")}`, id, date: "2026-02-01", journal: "ACH", reference: `ACH-${id}`, reversed: false, reverseOf: null, lines: [{ account: "601", label: "Achat", third: "Fournisseur Démo", debit: 125, credit: 0 }, { account: "401", label: "Fournisseur", third: "Fournisseur Démo", debit: 0, credit: 125 }] };
}
function makeSyncStore(thirds = []) {
  return { settings: { plan: "syscohada", customAccounts: [] }, thirds: structuredClone(thirds), assets: [], entries: [], nextId: 1 };
}
function makeCloud(companyId, thirds = [], options = {}) {
  const state = {
    company_id: companyId,
    settings: { settings: { plan: "syscohada" }, sync_version: 1 },
    custom_accounts: [], thirds: structuredClone(thirds), assets: [], entries: [],
    pagination: { has_more: false, next_offset: null },
  };
  let pushes = 0;
  let failAfterApply = !!options.failAfterApply;
  const client = { functions: { invoke: async (name, { body }) => {
    if (name === "read-accounting") {
      const response = structuredClone(state);
      if (options.paginateEntries) {
        const offset = Number(body.offset) || 0;
        const limit = Number(body.limit) || 100;
        response.custom_accounts = state.custom_accounts.slice(offset, offset + limit);
        response.thirds = state.thirds.slice(offset, offset + limit);
        response.assets = state.assets.slice(offset, offset + limit);
        response.entries = state.entries.slice(offset, offset + limit);
        const hasMore = [
          state.custom_accounts, state.thirds, state.assets, state.entries,
        ].some(items => offset + items.slice(offset, offset + limit).length < items.length);
        response.pagination = {
          has_more: hasMore,
          next_offset: hasMore ? offset + limit : null,
        };
      }
      return { data: response, error: null };
    }
    if (name === "push-accounting-changes") {
      pushes++;
      for (const op of body.operations) {
        if (op.entity_type === "third") {
          const index = state.thirds.findIndex(x => x.client_uid === op.client_uid);
          if (op.operation === "delete") { if (index >= 0) state.thirds.splice(index, 1); }
          else {
            const row = { client_uid: op.client_uid, name: op.data.name, third_type: op.data.third_type, phone: op.data.phone, email: op.data.email, sync_version: index >= 0 ? state.thirds[index].sync_version + 1 : 1 };
            if (index >= 0) state.thirds[index] = row; else state.thirds.push(row);
          }
        } else if (op.entity_type === "entry") {
          const index = state.entries.findIndex(x => x.client_uid === op.client_uid);
          if (op.operation === "delete") { if (index >= 0) state.entries.splice(index, 1); }
          else {
            const source = op.data.reverse_of_client_uid
              ? state.entries.find(x => x.client_uid === op.data.reverse_of_client_uid)
              : null;
            const row = {
              id: index >= 0 ? state.entries[index].id : Math.max(0, ...state.entries.map(x => x.id)) + 1,
              client_uid: op.client_uid, entry_date: op.data.entry_date, journal: op.data.journal,
              reference: op.data.reference, is_reversed: !!op.data.is_reversed,
              reverse_of_entry_id: source?.id ?? null,
              lines: structuredClone(op.data.lines || []),
              sync_version: index >= 0 ? state.entries[index].sync_version + 1 : 1,
            };
            if (index >= 0) state.entries[index] = row; else state.entries.push(row);
          }
        }
      }
      if (options.afterApply) await options.afterApply({ state, body });
      if (failAfterApply) {
        failAfterApply = false;
        return { data: null, error: { message: "Connexion interrompue après acceptation du lot" } };
      }
      return { data: { ok: true }, error: null };
    }
    throw new Error("Fonction cloud inattendue : " + name);
  } } };
  return { state, client, get pushes() { return pushes; } };
}
function seedShadow(storage, companyId, thirdRecords = []) {
  const data = {
    settings: { settings: { data: { settings: { plan: "syscohada" } } } },
    custom_account: {}, third: {}, asset: {}, entry: {},
  };
  for (const third of thirdRecords) {
    data.third[third.client_uid] = { data: {
      name: third.name, third_type: third.type, phone: third.phone || "", email: third.email || "",
    } };
  }
  const shadow = {};
  for (const kind of ["settings", "custom_account", "third", "asset", "entry"]) {
    shadow[kind] = {};
    for (const [uid, record] of Object.entries(data[kind])) {
      shadow[kind][uid] = { hash: fingerprint(record.data), version: 1 };
    }
  }
  storage.setItem("mizane_sync_shadow_v1:" + companyId, JSON.stringify(shadow));
}

await testAsync("restauration cloud : remplace les données locales invalides sans aucun envoi", async () => {
  const companyId = "company-cloud-restore-test";
  const cloudUid = "abababab-abab-4bab-8bab-abababababab";
  const thirdUid = "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc";
  const cloud = makeCloud(companyId, [
    { client_uid: thirdUid, name: "Diallo & Fils", third_type: "fournisseur", phone: "", email: "", sync_version: 1 },
  ]);
  cloud.state.entries = [{
    id: 1, client_uid: cloudUid, entry_date: "2026-01-15", journal: "ACH",
    reference: "ACH-RESTORE", is_reversed: false, reverse_of_entry_id: null,
    lines: [
      { account_code: "601", label: "Achat", third_name: "Diallo & Fils", debit: 125, credit: 0 },
      { account_code: "401", label: "Fournisseur", third_name: "Diallo & Fils", debit: 0, credit: 125 },
    ],
    sync_version: 1,
  }];
  const storage = memoryStorage();
  const local = makeSyncStore([{ client_uid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Ancien tiers local", type: "client" }]);
  local.entries = [{
    client_uid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", id: 1, date: "2026-02-31",
    journal: "ACH", reference: "LOCAL-INVALID", reversed: false, reverseOf: null,
    lines: [{ account: "601", debit: 125, credit: 0 }, { account: "401", debit: 0, credit: 125 }],
  }];
  storage.setItem("mizane_v1", JSON.stringify(local));
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await restoreAccountingFromCloud(cloud.client, companyId);
    const restored = JSON.parse(storage.getItem("mizane_v1"));
    assert.equal(result.restored, true);
    assert.equal(cloud.pushes, 0, "la restauration ne doit jamais pousser de données locales");
    assert.deepEqual(restored.thirds.map(x => x.name), ["Diallo & Fils"]);
    assert.equal(restored.entries.length, 1);
    assert.equal(restored.entries[0].date, "2026-01-15");
    assert.equal(restored.entries[0].lines[0].third, "Diallo & Fils");
    assert.ok(storage.getItem("mizane_sync_shadow_v1:" + companyId), "le shadow initial est créé");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("deux appareils : une modification locale est envoyée puis récupérée", async () => {
  const companyId = "company-sync-test";
  const uid = "44444444-4444-4444-8444-444444444444";
  const baseline = [];
  const cloud = makeCloud(companyId);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId);
  seedShadow(deviceB, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceB;
    const changed = makeSyncStore([{ client_uid: uid, name: "Client ajouté sur B", type: "client", phone: "0600000000", email: "" }]);
    deviceB.setItem("mizane_v1", JSON.stringify(changed));
    const pushed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pushed.pushed, 1);
    assert.equal(cloud.state.thirds.length, 1);
    globalThis.localStorage = deviceA;
    const pulled = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pulled.pulled, 1);
    const recovered = JSON.parse(deviceA.getItem("mizane_v1"));
    assert.equal(recovered.thirds[0].name, "Client ajouté sur B");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("deux appareils : les modifications simultanées sont signalées sans écrasement", async () => {
  const companyId = "company-conflict-test";
  const uid = "55555555-5555-4555-8555-555555555555";
  const baseline = [{ client_uid: uid, name: "Client initial", type: "client", phone: "0600000000", email: "" }];
  const cloud = makeCloud(companyId, [{ client_uid: uid, name: "Client initial", third_type: "client", phone: "0600000000", email: "", sync_version: 1 }]);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId, baseline);
  seedShadow(deviceB, companyId, baseline);
  const previousStorage = globalThis.localStorage;
  try {
    const editedA = makeSyncStore([{ ...baseline[0], name: "Nom modifié sur A" }]);
    globalThis.localStorage = deviceA;
    deviceA.setItem("mizane_v1", JSON.stringify(editedA));
    await syncAccounting(cloud.client, companyId, "admin");
    const pushCount = cloud.pushes;
    const editedB = makeSyncStore([{ ...baseline[0], phone: "0611111111" }]);
    globalThis.localStorage = deviceB;
    deviceB.setItem("mizane_v1", JSON.stringify(editedB));
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Conflit simultané détecté/);
    assert.equal(cloud.pushes, pushCount, "aucun push ne doit être tenté après le conflit");
    assert.equal(cloud.state.thirds[0].name, "Nom modifié sur A");
    assert.equal(JSON.parse(deviceB.getItem("mizane_v1")).thirds[0].phone, "0611111111");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("suppression : un tiers supprimé sur un appareil disparaît sur l'autre", async () => {
  const companyId = "company-delete-test";
  const uid = "66666666-6666-4666-8666-666666666666";
  const baseline = [{ client_uid: uid, name: "Client à supprimer", type: "client", phone: "", email: "" }];
  const cloud = makeCloud(companyId, [{ client_uid: uid, name: "Client à supprimer", third_type: "client", phone: "", email: "", sync_version: 1 }]);
  const deviceA = memoryStorage(), deviceB = memoryStorage();
  deviceA.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore(baseline)));
  seedShadow(deviceA, companyId, baseline);
  seedShadow(deviceB, companyId, baseline);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceB;
    deviceB.setItem("mizane_v1", JSON.stringify(makeSyncStore([])));
    const pushed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pushed.pushed, 1);
    assert.equal(cloud.state.thirds.length, 0);
    globalThis.localStorage = deviceA;
    const pulled = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(pulled.pulled, 1);
    assert.deepEqual(JSON.parse(deviceA.getItem("mizane_v1")).thirds, []);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("reprise : une réponse réseau perdue après acceptation ne duplique pas le tiers", async () => {
  const companyId = "company-retry-test";
  const uid = "77777777-7777-4777-8777-777777777777";
  const cloud = makeCloud(companyId, [], { failAfterApply: true });
  const storage = memoryStorage();
  const store = makeSyncStore([{ client_uid: uid, name: "Client reprise", type: "client", phone: "", email: "" }]);
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /Connexion interrompue/);
    assert.equal(cloud.state.thirds.length, 1, "le cloud a accepté le lot avant la perte de réponse");
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds.length, 1, "les données locales restent présentes");
    const resumed = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(resumed.pushed, 0, "la reprise reconnaît que le cloud possède déjà la même version");
    assert.equal(cloud.pushes, 1, "aucun second envoi n'est nécessaire");
    assert.equal(cloud.state.thirds.length, 1, "aucun doublon n'est créé");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("écritures liées : l'origine est créée avant la contrepassation", async () => {
  const companyId = "company-entries-test";
  const source = "88888888-8888-4888-8888-888888888888";
  const reversal = "99999999-9999-4999-8999-999999999999";
  const cloud = makeCloud(companyId);
  const storage = memoryStorage();
  const store = makeSyncStore();
  store.entries = [
    { client_uid: source, id: 1, date: "2026-01-10", journal: "OD", reference: "ECR-001", reversed: false, reverseOf: null,
      lines: [{ account: "601", label: "Charge", third: "", debit: 250, credit: 0 }, { account: "401", label: "Fournisseur", third: "", debit: 0, credit: 250 }] },
    { client_uid: reversal, id: 2, date: "2026-01-11", journal: "OD", reference: "CONTRE-ECR-001", reversed: true, reverseOf: 1,
      lines: [{ account: "601", label: "Annulation charge", third: "", debit: 0, credit: 250 }, { account: "401", label: "Annulation fournisseur", third: "", debit: 250, credit: 0 }] },
  ];
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(result.pushed, 2);
    assert.equal(cloud.state.entries.length, 2);
    const original = cloud.state.entries.find(x => x.client_uid === source);
    const contra = cloud.state.entries.find(x => x.client_uid === reversal);
    assert.ok(original && contra);
    assert.equal(contra.reverse_of_entry_id, original.id, "la référence cloud de la contrepassation pointe vers l'origine");
    assert.equal(contra.is_reversed, true);
    for (const entry of cloud.state.entries) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      assert.equal(debit, credit, "chaque écriture reste équilibrée");
    }
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("modification locale pendant l'envoi : la synchronisation s'arrête sans écraser le stockage", async () => {
  const companyId = "company-concurrent-local-test";
  const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const storage = memoryStorage();
  const store = makeSyncStore([{ client_uid: uid, name: "Client envoyé", type: "client", phone: "", email: "" }]);
  storage.setItem("mizane_v1", JSON.stringify(store));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId, [], {
    afterApply: async () => {
      const changed = makeSyncStore([{ client_uid: uid, name: "Modification locale concurrente", type: "client", phone: "", email: "" }]);
      storage.setItem("mizane_v1", JSON.stringify(changed));
    },
  });
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "admin"), /modifiée dans un autre onglet/);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Modification locale concurrente");
    assert.equal(cloud.state.thirds[0].name, "Client envoyé");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("gros volume : 250 tiers sont envoyés en trois lots sans doublon", async () => {
  const companyId = "company-volume-thirds-test";
  const thirds = Array.from({ length: 250 }, (_, index) => ({
    client_uid: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Tiers ${index + 1}`, type: index % 2 ? "fournisseur" : "client", phone: "", email: "",
  }));
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore(thirds)));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const first = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(first.pushed, 250);
    assert.equal(cloud.pushes, 3, "les 250 opérations sont réparties en lots de 100 maximum");
    assert.equal(cloud.state.thirds.length, 250);
    const second = await syncAccounting(cloud.client, companyId, "admin");
    assert.equal(second.pushed, 0);
    assert.equal(cloud.state.thirds.length, 250, "une seconde synchronisation ne crée aucun doublon");
    assert.equal(new Set(cloud.state.thirds.map(x => x.client_uid)).size, 250);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
await testAsync("pagination cloud : 250 écritures sont toutes récupérées sur trois pages", async () => {
  const companyId = "company-pagination-entries-test";
  const entries = Array.from({ length: 250 }, (_, index) => ({
    id: index + 1,
    client_uid: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    entry_date: "2026-02-01", journal: "ACH", reference: `ACH-${index + 1}`,
    is_reversed: false, reverse_of_entry_id: null, sync_version: 1,
    lines: [
      { account_code: "601", label: "Achat", third_name: "Fournisseur Démo", debit: 125, credit: 0 },
      { account_code: "401", label: "Fournisseur", third_name: "Fournisseur Démo", debit: 0, credit: 125 },
    ],
  }));
  const cloud = makeCloud(companyId, [], { paginateEntries: true });
  cloud.state.entries = structuredClone(entries);
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore()));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await syncAccounting(cloud.client, companyId, "admin");
    const recovered = JSON.parse(storage.getItem("mizane_v1"));
    assert.equal(result.pulled, 250);
    assert.equal(recovered.entries.length, 250, "aucune page n'est ignorée");
    assert.equal(recovered.entries[249].reference, "ACH-250");
    assert.deepEqual(recovered.entries[0].lines.map(line => ({
      account: line.account, third: line.third, debit: line.debit, credit: line.credit,
    })), [
      { account: "601", third: "Fournisseur Démo", debit: 125, credit: 0 },
      { account: "401", third: "Fournisseur Démo", debit: 0, credit: 125 },
    ], "les comptes, tiers et montants des lignes sont conservés");
    for (const entry of recovered.entries) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      assert.equal(debit, credit, "chaque écriture récupérée reste équilibrée");
    }
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


await testAsync("pagination cloud : comptes, tiers et immobilisations dépassant 100 éléments sont tous récupérés", async () => {
  const companyId = "company-pagination-collections-test";
  const customAccounts = Array.from({ length: 250 }, (_, index) => ({
    client_uid: `e0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `Z${9000 + index}`, label: `Compte personnalisé ${index + 1}`,
    account_type: "expense", sync_version: 1,
  }));
  const thirds = Array.from({ length: 250 }, (_, index) => ({
    client_uid: `f0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Tiers pagination ${index + 1}`, third_type: "client",
    phone: "", email: "", sync_version: 1,
  }));
  const assets = Array.from({ length: 250 }, (_, index) => ({
    client_uid: `a1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Immobilisation ${index + 1}`, account_code: "2455", amount: 1000,
    years: 5, method: "lineaire", service_date: "2026-01-01", amortized: 0, sync_version: 1,
  }));
  const cloud = makeCloud(companyId, [], { paginateEntries: true });
  cloud.state.custom_accounts = structuredClone(customAccounts);
  cloud.state.thirds = structuredClone(thirds);
  cloud.state.assets = structuredClone(assets);
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore()));
  seedShadow(storage, companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const result = await syncAccounting(cloud.client, companyId, "admin");
    const recovered = JSON.parse(storage.getItem("mizane_v1"));
    assert.equal(result.pulled, 750);
    assert.equal(recovered.settings.customAccounts.length, 250, "tous les comptes personnalisés sont récupérés");
    assert.equal(recovered.thirds.length, 250, "tous les tiers sont récupérés");
    assert.equal(recovered.assets.length, 250, "toutes les immobilisations sont récupérées");
    assert.equal(recovered.settings.customAccounts[249].code, "Z9249");
    assert.equal(recovered.thirds[249].name, "Tiers pagination 250");
    assert.equal(recovered.assets[249].name, "Immobilisation 250");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

await testAsync("séparation des entreprises : une réponse cloud d'une autre entreprise bloque la synchronisation", async () => {
  const companyId = "company-alpha-test";
  const uid = "d0000000-0000-4000-8000-000000000001";
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore([
    { client_uid: uid, name: "Donnée entreprise Alpha", type: "client", phone: "", email: "" },
  ])));
  const cloud = makeCloud(companyId);
  const isolatedClient = { functions: { invoke: async (name) => {
    if (name === "read-accounting") {
      return { data: { ...structuredClone(cloud.state), company_id: "company-beta-test" }, error: null };
    }
    throw new Error("Aucun envoi ne doit être tenté après une réponse cloud incohérente.");
  } } };
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(isolatedClient, companyId, "admin"), /Réponse cloud incohérente/);
    assert.equal(cloud.pushes, 0);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Donnée entreprise Alpha");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

await testAsync("rôle lecteur : les données locales en attente ne sont jamais envoyées au cloud", async () => {
  const companyId = "company-reader-test";
  const uid = "d0000000-0000-4000-8000-000000000002";
  const storage = memoryStorage();
  storage.setItem("mizane_v1", JSON.stringify(makeSyncStore([
    { client_uid: uid, name: "Modification en lecture seule", type: "client", phone: "", email: "" },
  ])));
  seedShadow(storage, companyId);
  const cloud = makeCloud(companyId);
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    await assert.rejects(syncAccounting(cloud.client, companyId, "reader"), /lecture seule/);
    assert.equal(cloud.pushes, 0);
    assert.equal(cloud.state.thirds.length, 0);
    assert.equal(JSON.parse(storage.getItem("mizane_v1")).thirds[0].name, "Modification en lecture seule");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});


test("rapprochement bancaire : import des dates et montants signés", () => {
  const rows = parseBankCSV("date;libellé;montant\n10/01/2026;Virement client;1250,50\n2026-01-11;Fournisseur;-500");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2026-01-10");
  assert.equal(rows[0].amount, 1250.5);
  assert.equal(rows[1].amount, -500);
});
test("rapprochement bancaire : diagnostic indicatif des frais et encaissements", () => {
  assert.equal(diagnoseBankLine({ label: "Commission bancaire mensuelle", amount: -35 }).type, "bank_fee");
  assert.equal(diagnoseBankLine({ label: "Virement reçu client", amount: 1200 }).type, "receipt");
  assert.equal(diagnoseBankLine({ label: "Libellé inconnu", amount: 0 }).type, "unknown");
});
test("rapprochement bancaire : une écriture de trésorerie n'est utilisée qu'une fois", () => {
  const store = { entries: [
    { id: 7, date: "2026-01-10", reference: "BAN-7", lines: [{ account: "521", label: "Virement client", debit: 1000, credit: 0 }] },
  ] };
  const bankLines = [
    { date: "2026-01-10", label: "Virement client", amount: 1000 },
    { date: "2026-01-10", label: "Virement client en double", amount: 1000 },
  ];
  const result = matchBankLines(store, bankLines, 4);
  assert.equal(result[0].match, 7);
  assert.equal(result[0].status, "matched");
  assert.equal(result[1].match, null);
  assert.equal(result[1].status, "unmatched");
  assert.deepEqual(result[1].candidates, [7]);
});
test("rapprochement bancaire : plusieurs règlements partiels épuisent progressivement une écriture", () => {
  const store = { entries: [
    { id: 21, date: "2026-01-10", lines: [{ account: "521", debit: 1000, credit: 0 }] },
  ] };
  const result = matchBankLines(store, [
    { date: "2026-01-10", label: "Acompte 1", amount: 400 },
    { date: "2026-01-11", label: "Acompte 2", amount: 600 },
  ], 4);
  assert.equal(result[0].match, 21);
  assert.equal(result[0].partial, true);
  assert.equal(result[0].partialRemaining, 600);
  assert.equal(result[1].match, 21);
  assert.equal(result[1].partialRemaining, 0);
  assert.equal(result[0].matchedAmount + result[1].matchedAmount, 1000);
});
test("rapprochement bancaire : une ligne peut rapprocher plusieurs écritures de trésorerie", () => {
  const store = { entries: [
    { id: 31, date: "2026-01-10", lines: [{ account: "521", debit: 300, credit: 0 }] },
    { id: 32, date: "2026-01-10", lines: [{ account: "512", debit: 700, credit: 0 }] },
  ] };
  const result = matchBankLines(store, [{ date: "2026-01-10", label: "Versement groupé", amount: 1000 }], 4)[0];
  assert.equal(result.status, "matched");
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches.reduce((sum, item) => sum + item.amount, 0), 1000);
});
test("rapprochement bancaire : un écart de montant est signalé sans rapprochement automatique", () => {
  const store = { entries: [
    { id: 41, date: "2026-01-10", lines: [{ account: "521", debit: 1000, credit: 0 }] },
  ] };
  const result = matchBankLines(store, [{ date: "2026-01-10", label: "Virement net", amount: 980 }], 4)[0];
  assert.equal(result.status, "unmatched");
  assert.equal(result.amountCandidates[0].entryId, 41);
  assert.equal(result.amountCandidates[0].difference, 20);
});
test("rapprochement bancaire : la tolérance de date est respectée", () => {
  const store = { entries: [
    { id: 8, date: "2026-01-10", lines: [{ account: "521", debit: 0, credit: 250 }] },
  ] };
  assert.equal(matchBankLines(store, [{ date: "2026-01-14", amount: -250 }], 4)[0].match, 8);
  const late = matchBankLines(store, [{ date: "2026-01-15", amount: -250 }], 4)[0];
  assert.equal(late.match, null);
  assert.deepEqual(late.dateCandidates, [8], "un montant identique hors tolérance est signalé comme écart de date");
});


console.log("— Synchronisation de la facturation —");
const { syncBilling } = await import("../js/billing-sync.js");
function makeBillingCloud() {
  const state = { data: null, version: 0, writes: 0 };
  const client = { functions: { invoke: async (name, { body }) => {
    assert.equal(name, "sync-billing");
    if (body.action === "read") return { data: { company_id: body.company_id, data: structuredClone(state.data), sync_version: state.version }, error: null };
    state.writes++;
    if (Number(body.expected_sync_version) !== state.version) {
      return { data: { ok: false, conflict: true, server_sync_version: state.version }, error: null };
    }
    state.data = structuredClone(body.data);
    state.version++;
    return { data: { ok: true, conflict: false, sync_version: state.version }, error: null };
  } } };
  return { state, client };
}
function sampleBilling(label) {
  return {
    nextId: 2, nextPaymentId: 2,
    settings: { currency: "MAD", prefixInvoice: "FAC" },
    documents: [{ id: 1, type: "invoice", number: "FAC-2026-0001", customerName: label, payments: [{ id: 1, amount: 25 }] }],
  };
}
await testAsync("deux appareils : devis, factures et paiements sont envoyés puis récupérés", async () => {
  const companyId = "company-billing-sync-test";
  const cloud = makeBillingCloud(), deviceA = memoryStorage(), deviceB = memoryStorage();
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceA;
    const first = await syncBilling(cloud.client, companyId, "admin", sampleBilling("Client ajouté sur A"));
    assert.equal(first.pushed, 1);
    assert.equal(cloud.state.version, 1);
    globalThis.localStorage = deviceB;
    const second = await syncBilling(cloud.client, companyId, "admin", { documents: [], settings: {} });
    assert.equal(second.pulled, 1);
    assert.equal(second.billing.documents[0].customerName, "Client ajouté sur A");
    assert.equal(second.billing.documents[0].payments[0].amount, 25);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});
await testAsync("facturation : les modifications simultanées sur deux appareils sont bloquées sans écrasement", async () => {
  const companyId = "company-billing-conflict-test";
  const cloud = makeBillingCloud(), deviceA = memoryStorage(), deviceB = memoryStorage();
  const baseline = sampleBilling("Client initial");
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = deviceA;
    await syncBilling(cloud.client, companyId, "admin", baseline);
    globalThis.localStorage = deviceB;
    await syncBilling(cloud.client, companyId, "admin", baseline);
    globalThis.localStorage = deviceA;
    await syncBilling(cloud.client, companyId, "admin", sampleBilling("Modification A"));
    globalThis.localStorage = deviceB;
    await assert.rejects(syncBilling(cloud.client, companyId, "admin", {
      ...baseline, documents: [{ ...baseline.documents[0], customerName: "Modification B" }],
    }), /Conflit simultané dans la Facturation/);
    assert.equal(cloud.state.data.documents[0].customerName, "Modification A");
    assert.equal(cloud.state.writes, 2);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});
await testAsync("facturation : un lecteur ne peut pas envoyer de modifications locales", async () => {
  const companyId = "company-billing-reader-test";
  const cloud = makeBillingCloud(), storage = memoryStorage();
  const previousStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = storage;
    const first = await syncBilling(cloud.client, companyId, "reader", sampleBilling("Modification lecteur"));
    assert.equal(first.pushed, 0);
    assert.equal(cloud.state.writes, 0);
    assert.equal(cloud.state.version, 0);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
});

console.log(`\nRésultat : ${passed} test(s) réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
