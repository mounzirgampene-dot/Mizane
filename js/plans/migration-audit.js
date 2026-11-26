// MIZANE — Audit comparatif d'une migration de plan comptable.
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const planRows = (plan) => (plan?.accounts || []).map((row) => Array.isArray(row)
  ? { code: String(row[0]), label: String(row[1]), type: String(row[2]) }
  : { code: String(row.code), label: String(row.label), type: String(row.type) });

function totalsByAccount(entries) {
  const rows = new Map();
  let debit = 0, credit = 0;
  for (const entry of entries || []) for (const line of entry.lines || []) {
    const code = String(line.account || "");
    const row = rows.get(code) || { code, debit: 0, credit: 0 };
    row.debit += Number(line.debit) || 0;
    row.credit += Number(line.credit) || 0;
    rows.set(code, row);
    debit += Number(line.debit) || 0;
    credit += Number(line.credit) || 0;
  }
  for (const row of rows.values()) {
    row.debit = round2(row.debit);
    row.credit = round2(row.credit);
    row.balance = round2(row.debit - row.credit);
  }
  return { rows, debit: round2(debit), credit: round2(credit), balance: round2(debit - credit) };
}

function mappedExpectedTotals(entries, mapping) {
  const rules = new Map((mapping?.rules || []).flatMap((rule) => (rule.sourceCodes || []).map((code) => [String(code), rule])));
  const expected = new Map();
  const unmapped = [];
  for (const entry of entries || []) for (const line of entry.lines || []) {
    const code = String(line.account || "");
    const rule = rules.get(code);
    if (!rule || rule.relation === "unmapped") {
      unmapped.push({ entryId: entry.id ?? null, account: code });
      continue;
    }
    const destinations = rule.relation === "one-to-many"
      ? (rule.allocations || [])
      : [{ targetCode: (rule.targetCodes || [])[0], percent: 100 }];
    let debitUsed = 0, creditUsed = 0;
    destinations.forEach((destination, index) => {
      const last = index === destinations.length - 1;
      const debit = last ? (Number(line.debit) || 0) - debitUsed : round2((Number(line.debit) || 0) * Number(destination.percent) / 100);
      const credit = last ? (Number(line.credit) || 0) - creditUsed : round2((Number(line.credit) || 0) * Number(destination.percent) / 100);
      debitUsed += debit;
      creditUsed += credit;
      const targetCode = String(destination.targetCode || "");
      const row = expected.get(targetCode) || { code: targetCode, debit: 0, credit: 0 };
      row.debit += debit;
      row.credit += credit;
      expected.set(targetCode, row);
    });
  }
  for (const row of expected.values()) {
    row.debit = round2(row.debit);
    row.credit = round2(row.credit);
    row.balance = round2(row.debit - row.credit);
  }
  return { rows: expected, unmapped };
}

export function buildMigrationAudit({ beforeEntries = [], afterEntries = [], sourcePlan, targetPlan, mapping }) {
  if (!sourcePlan?.id || !targetPlan?.id || !mapping?.rules) throw new Error("Référentiels ou rapprochement absents pour l'audit.");
  const before = totalsByAccount(beforeEntries);
  const after = totalsByAccount(afterEntries);
  const expected = mappedExpectedTotals(beforeEntries, mapping);
  const targetLabels = new Map(planRows(targetPlan).map((account) => [account.code, account.label]));
  const codes = new Set([...expected.rows.keys(), ...after.rows.keys()]);
  const accounts = [...codes].sort((a, b) => a.localeCompare(b)).map((code) => {
    const wanted = expected.rows.get(code) || { debit: 0, credit: 0, balance: 0 };
    const actual = after.rows.get(code) || { debit: 0, credit: 0, balance: 0 };
    return {
      code,
      label: targetLabels.get(code) || "Compte cible absent du référentiel",
      expectedDebit: round2(wanted.debit),
      actualDebit: round2(actual.debit),
      debitDifference: round2(actual.debit - wanted.debit),
      expectedCredit: round2(wanted.credit),
      actualCredit: round2(actual.credit),
      creditDifference: round2(actual.credit - wanted.credit),
      expectedBalance: round2(wanted.balance),
      actualBalance: round2(actual.balance),
      balanceDifference: round2(actual.balance - wanted.balance),
      missingTarget: !targetLabels.has(code),
    };
  });
  const entryIssues = [];
  for (const [phase, entries] of [["source", beforeEntries], ["cible", afterEntries]]) {
    for (const entry of entries || []) {
      const debit = round2((entry.lines || []).reduce((sum, line) => sum + (Number(line.debit) || 0), 0));
      const credit = round2((entry.lines || []).reduce((sum, line) => sum + (Number(line.credit) || 0), 0));
      if (Math.abs(debit - credit) > 0.01) entryIssues.push({ phase, entryId: entry.id ?? null, debit, credit, difference: round2(debit - credit) });
    }
  }
  const differences = accounts.filter((row) => Math.abs(row.debitDifference) > 0.01 || Math.abs(row.creditDifference) > 0.01 || row.missingTarget);
  const totalBalanced = Math.abs(before.debit - before.credit) <= 0.01 && Math.abs(after.debit - after.credit) <= 0.01;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePlanId: sourcePlan.id,
    targetPlanId: targetPlan.id,
    mappingId: mapping.id || null,
    mappingLabel: mapping.label || "",
    entryCountBefore: (beforeEntries || []).length,
    entryCountAfter: (afterEntries || []).length,
    beforeTotals: { debit: before.debit, credit: before.credit, net: before.balance },
    afterTotals: { debit: after.debit, credit: after.credit, net: after.balance },
    totalsDifference: { debit: round2(after.debit - before.debit), credit: round2(after.credit - before.credit), net: round2(after.balance - before.balance) },
    totalBalanced,
    unmapped: expected.unmapped,
    entryIssues,
    accounts,
    differenceCount: differences.length,
    mappedComparisonOnly: true,
    status: expected.unmapped.length || entryIssues.length || differences.length || !totalBalanced ? "attention" : "conforme",
  };
}

export function migrationAuditRows(report) {
  return (report?.accounts || []).map((row) => ({
    compte: row.code,
    libelle: row.label,
    debit_attendu: row.expectedDebit,
    debit_apres: row.actualDebit,
    ecart_debit: row.debitDifference,
    credit_attendu: row.expectedCredit,
    credit_apres: row.actualCredit,
    ecart_credit: row.creditDifference,
    solde_attendu: row.expectedBalance,
    solde_apres: row.actualBalance,
    ecart_solde: row.balanceDifference,
    compte_cible_absent: row.missingTarget ? "oui" : "non",
  }));
}
