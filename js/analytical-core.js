// MIZANE — Comptabilité analytique : centres et affectations explicites.
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const id = value => String(value || "").trim();

export function validateAnalyticalCenter(center, centers = []) {
  const errors = [];
  const name = id(center?.name);
  if (!name || name.length > 100) errors.push("Le nom du centre est obligatoire (100 caractères maximum).");
  if (!["cost", "profit", "mixed"].includes(center?.type)) errors.push("Type de centre invalide.");
  if (centers.some(item => item.id !== center?.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) errors.push("Un centre porte déjà ce nom.");
  return { ok: errors.length === 0, errors };
}

export function validateAnalyticalAllocation(allocation, { centers = [], allocations = [], entries = [], accountTypes = {} } = {}) {
  const errors = [];
  const entry = entries.find(item => String(item.id) === String(allocation?.entryId));
  const lineIndex = Number(allocation?.lineIndex);
  const line = Number.isInteger(lineIndex) ? entry?.lines?.[lineIndex] : null;
  const center = centers.find(item => item.id === allocation?.centerId);
  const percentage = Number(allocation?.percentage);
  if (!entry || entry.reversed) errors.push("Écriture introuvable ou contrepassée.");
  if (!line) errors.push("Ligne comptable introuvable.");
  if (!center) errors.push("Centre analytique introuvable.");
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) errors.push("Le pourcentage doit être compris entre 0 et 100.");
  const type = line ? accountTypes[String(line.account)] : null;
  if (line && !["expense", "income"].includes(type)) errors.push("Seuls les comptes de charges ou de produits peuvent être affectés.");
  if (line && center && center.type === "cost" && type !== "expense") errors.push("Un centre de coûts ne peut recevoir que des charges.");
  if (line && center && center.type === "profit" && type !== "income") errors.push("Un centre de profit ne peut recevoir que des produits.");
  if (line && Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0) errors.push("Ligne comptable à double sens non admissible.");
  const used = allocations.filter(item => String(item.entryId) === String(allocation?.entryId) && Number(item.lineIndex) === lineIndex && item.id !== allocation?.id).reduce((sum, item) => sum + Number(item.percentage || 0), 0);
  if (used + percentage > 100.000001) errors.push("Le cumul des affectations de cette ligne dépasserait 100 %.");
  return { ok: errors.length === 0, errors, entry, line, center, accountType: type };
}

export function buildAnalyticalReport({ centers = [], allocations = [], entries = [], accountTypes = {}, startDate = "", endDate = "" } = {}) {
  const centerRows = new Map(centers.map(center => [center.id, { id: center.id, name: center.name, type: center.type, income: 0, expenses: 0, result: 0, allocations: 0, accounts: new Map() }]));
  const issues = [];
  const used = new Map();
  for (const allocation of allocations) {
    const entry = entries.find(item => String(item.id) === String(allocation.entryId));
    const line = entry?.lines?.[Number(allocation.lineIndex)];
    const center = centerRows.get(allocation.centerId);
    if (!entry || !line || !center || entry.reversed) { issues.push({ allocationId: allocation.id, message: "Affectation orpheline ou liée à une écriture contrepassée." }); continue; }
    if ((startDate && entry.date < startDate) || (endDate && entry.date > endDate)) continue;
    const percentage = Number(allocation.percentage || 0);
    const account = String(line.account || "");
    const type = accountTypes[account];
    if (!["expense", "income"].includes(type) || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) { issues.push({ allocationId: allocation.id, message: "Affectation invalide ou compte non analytique." }); continue; }
    const signed = type === "expense" ? Number(line.debit || 0) - Number(line.credit || 0) : Number(line.credit || 0) - Number(line.debit || 0);
    const amount = round2(signed * percentage / 100);
    if (type === "expense") center.expenses = round2(center.expenses + amount);
    else center.income = round2(center.income + amount);
    center.allocations++;
    const accountRow = center.accounts.get(account) || { account, type, amount: 0 };
    accountRow.amount = round2(accountRow.amount + amount);
    center.accounts.set(account, accountRow);
    const key = String(entry.id) + ":" + allocation.lineIndex;
    used.set(key, round2((used.get(key) || 0) + percentage));
  }
  const rows = [...centerRows.values()].map(center => ({
    ...center, result: round2(center.income - center.expenses),
    accounts: [...center.accounts.values()].sort((a, b) => a.account.localeCompare(b.account)),
  })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const unallocated = [];
  for (const entry of entries) {
    if (entry.reversed || (startDate && entry.date < startDate) || (endDate && entry.date > endDate)) continue;
    (entry.lines || []).forEach((line, lineIndex) => {
      const type = accountTypes[String(line.account)];
      if (!["expense", "income"].includes(type)) return;
      const amount = type === "expense" ? Number(line.debit || 0) - Number(line.credit || 0) : Number(line.credit || 0) - Number(line.debit || 0);
      const assigned = Math.min(100, used.get(String(entry.id) + ":" + lineIndex) || 0);
      if (Math.abs(amount) > 0.001 && assigned < 99.999999) unallocated.push({ entryId: entry.id, lineIndex, date: entry.date, journal: entry.journal, account: String(line.account), label: line.label || "", type, amount: round2(amount), remainingPercentage: round2(100 - assigned), remainingAmount: round2(amount * (100 - assigned) / 100) });
    });
  }
  return { ok: true, period: { startDate, endDate }, rows, issues, unallocated, totals: {
    income: round2(rows.reduce((sum, row) => sum + row.income, 0)),
    expenses: round2(rows.reduce((sum, row) => sum + row.expenses, 0)),
    result: round2(rows.reduce((sum, row) => sum + row.result, 0)),
  } };
}
