// MIZANE — Contrôles comptables transversaux, en lecture seule.
import { accountType, entryTotals, round2, validDate, JOURNALS } from "./accounting.js";

const JOURNAL_IDS = new Set(JOURNALS.map((journal) => journal.id));
const severityRank = { critical: 0, warning: 1, info: 2 };

export function buildAccountingControlReport(store, options = {}) {
  const start = options.start || store?.settings?.exerciceStart || "";
  const end = options.end || store?.settings?.exerciceEnd || "";
  const entries = Array.isArray(store?.entries) ? store.entries : [];
  const warnings = [];
  const add = (type, severity, entry, message, extra = {}) => warnings.push({
    id: type + ":" + String(entry?.id ?? "global") + ":" + warnings.length,
    type, severity, entryId: entry?.id ?? null, date: entry?.date || null,
    journal: entry?.journal || null, message, ...extra,
  });
  const accountMovements = new Map();
  const journalTotals = new Map();
  const duplicateKeys = new Map();
  let periodEntries = 0;
  let totalDebit = 0, totalCredit = 0;
  let outOfPeriodCount = 0;

  for (const entry of entries) {
    const dateOk = validDate(entry?.date);
    if (!dateOk) add("date_invalide", "critical", entry, "Date d’écriture absente ou invalide.");
    else if ((start && entry.date < start) || (end && entry.date > end)) {
      outOfPeriodCount++;
      add("hors_exercice", "info", entry, "Écriture située en dehors de la période d’exercice sélectionnée.");
    }
    const inRange = dateOk && (!start || entry.date >= start) && (!end || entry.date <= end);
    if (inRange) periodEntries++;
    if (!JOURNAL_IDS.has(String(entry?.journal || ""))) add("journal_inconnu", "warning", entry, "Code journal absent de la liste des journaux reconnus.");
    const lines = Array.isArray(entry?.lines) ? entry.lines : [];
    const totals = entryTotals({ lines });
    if (Math.abs(totals.debit - totals.credit) > 0.001) add("desequilibre", "critical", entry, "Écriture non équilibrée : débit " + totals.debit + " / crédit " + totals.credit + ".");
    if (inRange) { totalDebit += totals.debit; totalCredit += totals.credit; }
    if (inRange) {
      const journal = journalTotals.get(String(entry?.journal || "—")) || { journal: String(entry?.journal || "—"), entries: 0, debit: 0, credit: 0 };
      journal.entries++;
      journal.debit += totals.debit;
      journal.credit += totals.credit;
      journalTotals.set(journal.journal, journal);
    }

    const normalized = lines.map(line => ({
      account: String(line?.account || "").trim(),
      debit: round2(line?.debit || 0),
      credit: round2(line?.credit || 0),
    })).sort((a, b) => a.account.localeCompare(b.account) || a.debit - b.debit || a.credit - b.credit);
    const duplicateKey = [entry?.date, entry?.journal, entry?.reference || "", JSON.stringify(normalized)].join("|");
    if (duplicateKeys.has(duplicateKey)) add("doublon", "warning", entry, "Écriture potentiellement identique à l’écriture #" + duplicateKeys.get(duplicateKey) + ".", { relatedEntryId: duplicateKeys.get(duplicateKey) });
    else duplicateKeys.set(duplicateKey, entry?.id ?? "sans identifiant");

    for (const [index, line] of lines.entries()) {
      const code = String(line?.account || "").trim();
      if (!code || !accountType(store, code)) {
        add("compte_inconnu", "critical", entry, "Ligne " + (index + 1) + " : compte « " + (code || "vide") + " » absent du plan actif.", { account: code });
        continue;
      }
      const debit = Number(line?.debit) || 0, credit = Number(line?.credit) || 0;
      if (inRange) {
        const row = accountMovements.get(code) || { code, debit: 0, credit: 0, type: accountType(store, code) };
        row.debit += debit;
        row.credit += credit;
        accountMovements.set(code, row);
      }
      if (debit > 0 && credit > 0) add("double_sens", "critical", entry, "Ligne " + (index + 1) + " : débit et crédit sont renseignés simultanément.", { account: code });
      if (debit < 0 || credit < 0) add("montant_negatif", "critical", entry, "Ligne " + (index + 1) + " : montant négatif détecté.", { account: code });
      if (!String(line?.label || "").trim()) add("libelle_absent", "info", entry, "Ligne " + (index + 1) + " sans libellé explicatif.", { account: code });
    }
  }

  const journals = [...journalTotals.values()].map(row => ({
    ...row, debit: round2(row.debit), credit: round2(row.credit),
    difference: round2(row.debit - row.credit),
    balanced: Math.abs(row.debit - row.credit) <= 0.01,
  })).sort((a, b) => a.journal.localeCompare(b.journal));
  for (const row of journals) if (!row.balanced) warnings.push({
    id: "journal:" + row.journal, type: "journal_desequilibre", severity: "critical",
    entryId: null, journal: row.journal,
    message: "Journal " + row.journal + " : écart cumulé débit/crédit de " + row.difference + ".",
  });

  const balances = [...accountMovements.values()].map(row => {
    const debit = round2(row.debit), credit = round2(row.credit), balance = round2(debit - credit);
    const normallyDebit = ["asset", "expense"].includes(row.type);
    const abnormalSide = Math.abs(balance) > 0.01 && (normallyDebit ? balance < 0 : balance > 0);
    return { code: row.code, type: row.type, debit, credit, balance, abnormalSide };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const abnormalBalances = balances.filter(row => row.abnormalSide).map(row => ({
    id: "solde:" + row.code, type: "solde_sens_inhabituel", severity: "info", entryId: null,
    account: row.code, message: "Le compte " + row.code + " présente un solde de sens inhabituel au regard de son type (" + row.balance + "). À examiner selon la nature du compte.",
  }));
  warnings.push(...abnormalBalances);
  warnings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || String(a.date || "").localeCompare(String(b.date || "")));

  const debit = round2(totalDebit), credit = round2(totalCredit);
  const globalBalanced = Math.abs(debit - credit) <= 0.01;
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const warning of warnings) bySeverity[warning.severity] = (bySeverity[warning.severity] || 0) + 1;
  const byType = {};
  for (const warning of warnings) byType[warning.type] = (byType[warning.type] || 0) + 1;
  return {
    generatedAt: new Date().toISOString(), period: { start, end },
    totals: { entries: entries.length, periodEntries, debit, credit, difference: round2(debit - credit), balanced: globalBalanced, accounts: balances.length, journals: journals.length, outOfPeriodCount },
    bySeverity, byType, warnings, journals, balances,
    status: bySeverity.critical ? "anomalies_critiques" : bySeverity.warning ? "a_verifier" : bySeverity.info ? "points_attention" : "conforme",
  };
}

export function accountingControlRows(report) {
  return report.warnings.map(item => ({
    gravite: item.severity, type: item.type, date: item.date || "",
    journal: item.journal || "", ecriture: item.entryId ?? "",
    compte: item.account || "", anomalie: item.message,
  }));
}
