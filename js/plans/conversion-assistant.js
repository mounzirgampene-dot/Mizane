// MIZANE — Propositions prudentes de rapprochement entre plans comptables.
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value) => new Set(normalize(value).split(/\s+/).filter((word) => word.length > 2));
function similarity(a, b) {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common++;
  return common / (left.size + right.size - common);
}
function accountRows(plan) {
  return (plan?.accounts || []).map((row) => Array.isArray(row)
    ? { code: String(row[0]), label: String(row[1]), type: String(row[2]) }
    : { code: String(row.code), label: String(row.label), type: String(row.type) });
}
export function suggestAccountMatches(sourcePlan, targetPlan) {
  if (!sourcePlan || !targetPlan || sourcePlan.id === targetPlan.id) throw new Error("Sélectionnez deux plans comptables différents.");
  const targets = accountRows(targetPlan);
  return accountRows(sourcePlan).map((source) => {
    const candidates = targets.filter((target) => target.type === source.type).map((target) => {
      const exactCode = target.code === source.code;
      const prefix = !exactCode && (target.code.startsWith(source.code) || source.code.startsWith(target.code));
      const labelScore = similarity(source.label, target.label);
      const score = exactCode ? 1 : Math.max(prefix ? 0.72 : 0, labelScore);
      return { ...target, score, reason: exactCode ? "Même code (à confirmer)" : prefix ? "Code proche et type identique" : "Libellé proche et type identique" };
    }).filter((target) => target.score >= 0.38).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    const best = candidates[0] || null;
    const ambiguous = Boolean(best && candidates[1] && best.score - candidates[1].score < 0.08);
    return { source, suggestion: best, candidates: candidates.slice(0, 5), ambiguous, confidence: best ? Math.round(best.score * 100) : 0 };
  });
}
export function buildConversionRules(suggestions, selections) {
  return suggestions.flatMap((item, index) => {
    const targetCode = String(selections?.[item.source.code] || "").trim();
    if (!targetCode) return [];
    const candidate = item.candidates.find((entry) => entry.code === targetCode);
    if (!candidate) throw new Error("Compte cible non proposé ou incompatible : " + targetCode);
    return [{ id: "map-" + (index + 1), relation: "exact", sourceCodes: [item.source.code], targetCodes: [targetCode], status: "draft", note: item.ambiguous ? "Rapprochement ambigu : vérification humaine requise." : "", sourceRef: "Proposition assistée à vérifier par un comptable." }];
  });
}
