// MIZANE — Tests du moteur comptable. Exécution : node tests/run.mjs
import { strict as assert } from "node:assert";
import {
  newStore, validDate, validateEntry, postEntry, reverseEntry, trialBalance, ledger,
  incomeStatement, balanceSheet, checkAnomalies, cashBalance, toCSV, buildAccountCache,
} from "../js/accounting.js";
import { allAccounts, findAccount, searchAccounts, PLANS } from "../js/plans.js";
import { COUNTRIES, formatMoney } from "../js/countries.js";
import { validateBackup } from "../js/db.js";

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

test("import local de texte : une écriture par ligne", async () => {
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

test("facture : HTML avec en-tête et total TTC", async () => {
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

test("données de démonstration équilibrées", async () => {
  const { demoData } = await import("../js/db.js");
  const s = freshStore();
  demoData(s);
  const tb = trialBalance(s);
  assert.equal(tb.totals.debit, tb.totals.credit);
  assert.ok(s.entries.length >= 8);
});

console.log("— Amortissements (finance.js) —");
test("amortissement linéaire : annuité constante, VNC nulle à la fin", async () => {
  const { amortizationSchedule } = await import("../js/finance.js");
  const sched = amortizationSchedule(10000, 5, "lineaire");
  assert.equal(sched.length, 5);
  for (const r of sched) assert.equal(r.annuite, 2000);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
});

test("amortissement dégressif : cumul final = valeur, VNC nulle", async () => {
  const { amortizationSchedule, amortRate } = await import("../js/finance.js");
  const rate = amortRate(5, "degressif");
  assert.equal(rate, 0.35);
  const sched = amortizationSchedule(10000, 5, "degressif");
  assert.equal(sched.length, 5);
  assert.equal(sched[4].cumul, 10000);
  assert.equal(sched[4].vnc, 0);
  assert.ok(sched[0].annuite === 3500, "1re annuité dégressive = 3500");
});

test("nextAnnuity : reprend après cumul déjà amorti, 0 si terminé", async () => {
  const { nextAnnuity } = await import("../js/finance.js");
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 2000 }), 2000);
  assert.equal(nextAnnuity({ amount: 10000, years: 5, method: "lineaire", amortized: 10000 }), 0);
});

test("dotationLines : 681 débit / 28x crédit, équilibrées", async () => {
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
test("closingProposal : clôture équilibrée, résultat au compte 12, à-nouveaux équilibrés", async () => {
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
test("parseBankCSV : JJ/MM/AAAA, AAAA-MM-JJ, en-tête ignoré", async () => {
  const { parseBankCSV } = await import("../js/finance.js");
  const txt = "Date;Libellé;Montant\n10/01/2025;Virement client;1 000 000\n2025-01-12;Fournisseur;-500,5\nligne invalide\n";
  const rows = parseBankCSV(txt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2025-01-10");
  assert.equal(rows[0].amount, 1000000);
  assert.equal(rows[1].date, "2025-01-12");
  assert.equal(rows[1].amount, -500.5);
});

test("matchBankLines : rapprochement par montant à ±4 jours sur classe 5", async () => {
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

test("validDate rejette les dates calendaires impossibles", () => {
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
test("providerOf / visionModel : détection mistral, groq, gemini, custom", async () => {
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

test("toGeminiBody : conversion messages texte et image", async () => {
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

test("chat : image_url encapsulée en {url} hors Mistral (mock fetch)", async () => {
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

test("chat Gemini : modèle retiré -> nouvelle tentative avec le modèle actuel (mock fetch)", async () => {
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
test("i18n : t() traduit, repli sur français, langue inconnue rejetée", async () => {
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

test("i18n : mêmes clés pour toutes les langues", async () => {
  const { DICT } = await import("../js/i18n.js");
  const counts = Object.values(DICT).map((d) => Object.keys(d).length);
  assert.ok(counts.length >= 3, "au moins 3 langues");
  assert.equal(new Set(counts).size, 1, "toutes les langues ont le même nombre de clés");
  assert.ok(counts[0] > 100, "dictionnaire substantiel");
});

console.log(`\nRésultat : ${passed} test(s) réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
