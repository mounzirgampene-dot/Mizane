// MIZANE — Tests du moteur comptable. Exécution : node tests/run.mjs
import { strict as assert } from "node:assert";
import {
  newStore, validateEntry, postEntry, reverseEntry, trialBalance, ledger,
  incomeStatement, balanceSheet, checkAnomalies, cashBalance, toCSV, buildAccountCache,
} from "../js/accounting.js";
import { allAccounts, findAccount, searchAccounts, PLANS } from "../js/plans.js";
import { COUNTRIES, getCountry, formatMoney } from "../js/countries.js";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.error("  ✗ " + name + "\n    " + e.message); }
}

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

test("export CSV", () => {
  const csv = toCSV([{ a: 1, b: "x;y" }]);
  assert.ok(csv.includes('"x;y"'));
});

test("données de démonstration équilibrées", async () => {
  const { demoData } = await import("../js/db.js");
  const s = freshStore();
  demoData(s);
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.ok(s.entries.length >= 8);
});

console.log(`\nRésultat : ${passed} test(s) réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
