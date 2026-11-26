// MIZANE — Lettrage assisté des comptes de tiers.
// Le moteur propose des allocations ; aucune écriture comptable n'est modifiée.
const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

function lineKey(entryId, lineIndex) {
  return String(entryId) + ":" + String(lineIndex);
}

function activeAllocations(store) {
  return (Array.isArray(store?.settings?.thirdPartyLettrage) ? store.settings.thirdPartyLettrage : [])
    .filter(item => item && item.status === "active");
}

function collectOpenLines(store) {
  const allocated = new Map();
  for (const item of activeAllocations(store)) {
    for (const allocation of item.allocations || []) {
      const amount = round(allocation.amount);
      allocated.set(allocation.debitKey, round((allocated.get(allocation.debitKey) || 0) + amount));
      allocated.set(allocation.creditKey, round((allocated.get(allocation.creditKey) || 0) + amount));
    }
  }
  const rows = [];
  for (const entry of Array.isArray(store?.entries) ? store.entries : []) {
    if (entry.reversed || entry.reverseOf) continue;
    for (const [lineIndex, line] of (entry.lines || []).entries()) {
      const third = String(line.third || "").trim();
      if (!third) continue;
      const debit = round(line.debit), credit = round(line.credit);
      if ((debit > 0) === (credit > 0) || debit <= 0 && credit <= 0) continue;
      const key = lineKey(entry.id, lineIndex);
      const original = debit > 0 ? debit : credit;
      const remaining = round(Math.max(0, original - (allocated.get(key) || 0)));
      if (remaining <= 0.001) continue;
      rows.push({
        key, entryId: entry.id, lineIndex, date: String(entry.date || ""),
        journal: String(entry.journal || ""), reference: String(entry.reference || ""),
        account: String(line.account || ""), label: String(line.label || ""),
        third, thirdKey: normalize(third), currency: String(line.currency || store?.settings?.currency || "MAD").toUpperCase(),
        side: debit > 0 ? "debit" : "credit", amount: original, remaining,
      });
    }
  }
  return rows;
}

export function buildThirdPartyReconciliation(store) {
  const openLines = collectOpenLines(store);
  const groups = new Map();
  for (const line of openLines) {
    const groupKey = [line.account, line.thirdKey, line.currency].join("|");
    if (!groups.has(groupKey)) groups.set(groupKey, { account: line.account, third: line.third, currency: line.currency, debit: [], credit: [] });
    groups.get(groupKey)[line.side].push(line);
  }
  const proposals = [];
  for (const group of groups.values()) {
    const debits = group.debit.slice().sort((a,b) => (validDate(a.date) ? a.date : "9999").localeCompare(validDate(b.date) ? b.date : "9999") || String(a.entryId).localeCompare(String(b.entryId)));
    const credits = group.credit.slice().sort((a,b) => (validDate(a.date) ? a.date : "9999").localeCompare(validDate(b.date) ? b.date : "9999") || String(a.entryId).localeCompare(String(b.entryId)));
    let di = 0, ci = 0;
    const debitLeft = debits.map(line => line.remaining);
    const creditLeft = credits.map(line => line.remaining);
    while (di < debits.length && ci < credits.length) {
      if (debitLeft[di] <= 0.001) { di++; continue; }
      if (creditLeft[ci] <= 0.001) { ci++; continue; }
      const amount = round(Math.min(debitLeft[di], creditLeft[ci]));
      const debit = debits[di], credit = credits[ci];
      if (debit.entryId !== credit.entryId && amount > 0) {
        proposals.push({
          id: debit.key + "|" + credit.key, account: group.account, third: group.third, currency: group.currency,
          debit: { key: debit.key, entryId: debit.entryId, lineIndex: debit.lineIndex, date: debit.date, journal: debit.journal, reference: debit.reference, label: debit.label, remaining: debitLeft[di] },
          credit: { key: credit.key, entryId: credit.entryId, lineIndex: credit.lineIndex, date: credit.date, journal: credit.journal, reference: credit.reference, label: credit.label, remaining: creditLeft[ci] },
          amount, partial: amount + 0.001 < debitLeft[di] || amount + 0.001 < creditLeft[ci],
          confidence: debit.reference && credit.reference && normalize(debit.reference) === normalize(credit.reference) ? "reference" : "third_account",
        });
        debitLeft[di] = round(debitLeft[di] - amount);
        creditLeft[ci] = round(creditLeft[ci] - amount);
      } else {
        // Une même écriture ne peut pas se lettrer avec elle-même.
        if (debit.entryId === credit.entryId) {
          if (debit.date <= credit.date) debitLeft[di] = 0;
          else creditLeft[ci] = 0;
        }
      }
    }
  }
  return {
    proposals,
    openLines,
    totals: {
      openDebit: round(openLines.filter(line => line.side === "debit").reduce((sum,line) => sum + line.remaining,0)),
      openCredit: round(openLines.filter(line => line.side === "credit").reduce((sum,line) => sum + line.remaining,0)),
      openItems: openLines.length,
      proposals: proposals.length,
    },
    history: activeAllocations(store),
  };
}

export function applyThirdPartyLettrage(store, proposal, actor = "user") {
  if (!store || !proposal?.debit?.key || !proposal?.credit?.key) throw new Error("Proposition de lettrage invalide.");
  const report = buildThirdPartyReconciliation(store);
  const current = report.proposals.find(item => item.id === proposal.id);
  if (!current) throw new Error("Cette proposition n'est plus disponible. Actualisez le lettrage.");
  const amount = round(proposal.amount);
  if (!(amount > 0) || amount - current.amount > 0.001) throw new Error("Montant de lettrage supérieur au solde disponible.");
  store.settings ||= {};
  store.settings.thirdPartyLettrage ||= [];
  const record = {
    id: globalThis.crypto?.randomUUID?.() || "lettrage-" + Date.now() + "-" + store.settings.thirdPartyLettrage.length,
    status: "active", createdAt: new Date().toISOString(), actor,
    account: current.account, third: current.third, currency: current.currency, amount,
    allocations: [{ debitKey: current.debit.key, creditKey: current.credit.key, amount }],
    debit: { ...current.debit }, credit: { ...current.credit },
  };
  store.settings.thirdPartyLettrage.unshift(record);
  return record;
}

export function reverseThirdPartyLettrage(store, id, actor = "user") {
  const record = (store?.settings?.thirdPartyLettrage || []).find(item => item.id === id && item.status === "active");
  if (!record) throw new Error("Lettrage actif introuvable.");
  record.status = "reversed";
  record.reversedAt = new Date().toISOString();
  record.reversedBy = actor;
  return record;
}
