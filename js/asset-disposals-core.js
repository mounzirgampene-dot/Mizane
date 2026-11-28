// MIZANE — Calcul des sorties et cessions d'immobilisations.
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const validDate = value => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};
export function validateAssetDisposal(asset, input = {}) {
  const errors = [];
  const amount = Number(asset?.amount);
  const accumulated = Number(asset?.amortized || 0);
  const proceeds = Number(input?.proceeds ?? 0);
  const type = String(input?.type || "");
  const date = String(input?.date || "");
  if (!asset || typeof asset !== "object") errors.push("Immobilisation introuvable.");
  if (asset?.disposedAt || asset?.disposalId) errors.push("Cette immobilisation a déjà fait l'objet d'une sortie.");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("La valeur d'origine de l'immobilisation est invalide.");
  if (!Number.isFinite(accumulated) || accumulated < 0 || accumulated > amount) errors.push("Le cumul des amortissements est invalide.");
  if (!validDate(date)) errors.push("La date de sortie est invalide.");
  else if (validDate(asset?.date) && date < asset.date) errors.push("La sortie ne peut pas précéder la date de mise en service.");
  if (!Number.isFinite(proceeds) || proceeds < 0 || proceeds > 999999999999) errors.push("Le prix de cession doit être positif ou nul et valide.");
  if (!["cession", "mise_rebut", "destruction"].includes(type)) errors.push("Le motif de sortie est invalide.");
  if (type === "cession" && proceeds <= 0) errors.push("Une cession doit comporter un prix de vente supérieur à zéro.");
  if (type === "destruction" && proceeds > 0) errors.push("Une destruction ne peut pas comporter de produit de cession.");
  return { ok: errors.length === 0, errors };
}
export function buildAssetDisposal(asset, input = {}) {
  const validation = validateAssetDisposal(asset, input);
  if (!validation.ok) return { ok: false, errors: validation.errors, disposal: null };
  const grossValue = round2(asset.amount);
  const accumulated = round2(asset.amortized || 0);
  const netBookValue = round2(Math.max(0, grossValue - accumulated));
  const proceeds = round2(input.proceeds || 0);
  const gainLoss = round2(proceeds - netBookValue);
  return { ok: true, errors: [], disposal: {
    assetKey: String(asset.client_uid || asset.id || [asset.account, asset.date, asset.name].join(":")),
    assetName: String(asset.name || ""), account: String(asset.account || ""),
    date: input.date, type: input.type, grossValue, accumulated, netBookValue,
    proceeds, gainLoss,
    result: gainLoss > 0 ? "plus_value" : gainLoss < 0 ? "moins_value" : "equilibre",
    recordedAt: input.recordedAt || new Date().toISOString(),
  }};
}
export function summarizeAssetDisposals(disposals = []) {
  const rows = (Array.isArray(disposals) ? disposals : []).filter(item => item && typeof item === "object");
  return {
    count: rows.length,
    grossValue: round2(rows.reduce((sum, item) => sum + Number(item.grossValue || 0), 0)),
    accumulated: round2(rows.reduce((sum, item) => sum + Number(item.accumulated || 0), 0)),
    netBookValue: round2(rows.reduce((sum, item) => sum + Number(item.netBookValue || 0), 0)),
    proceeds: round2(rows.reduce((sum, item) => sum + Number(item.proceeds || 0), 0)),
    gains: round2(rows.filter(item => Number(item.gainLoss) > 0).reduce((sum, item) => sum + Number(item.gainLoss), 0)),
    losses: round2(rows.filter(item => Number(item.gainLoss) < 0).reduce((sum, item) => sum + Math.abs(Number(item.gainLoss)), 0)),
    rows,
  };
}
