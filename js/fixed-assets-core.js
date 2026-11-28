// MIZANE — Registre et plans d'amortissement des immobilisations.
import { round2 } from "./accounting.js";

const DAY = 86400000;
const validDate = value => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
};
const addDays = (value, days) => new Date(Date.parse(value + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);
const addYears = (value, years) => {
  const [year, month, day] = value.split("-").map(Number);
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return new Date(Date.UTC(year + years, month - 1, Math.min(day, last))).toISOString().slice(0, 10);
};
const daysBetween = (start, end) => Math.max(0, Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / DAY));

export function validateFixedAsset(asset) {
  const errors = [];
  const amount = Number(asset?.amount);
  const residualValue = Number(asset?.residualValue || 0);
  const years = Number(asset?.years);
  if (!String(asset?.name || "").trim()) errors.push("Le libellé de l'immobilisation est obligatoire.");
  if (!/^\d{1,12}$/.test(String(asset?.account || "")) || !String(asset.account).startsWith("2")) errors.push("Le compte d'immobilisation doit être un compte de classe 2 valide.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) errors.push("La valeur d'origine doit être positive et valide.");
  if (!Number.isFinite(residualValue) || residualValue < 0 || residualValue >= amount) errors.push("La valeur résiduelle doit être positive ou nulle et inférieure à la valeur d'origine.");
  if (!Number.isInteger(years) || years < 1 || years > 100) errors.push("La durée d'utilisation doit être comprise entre 1 et 100 ans.");
  if (!["lineaire", "degressif"].includes(asset?.method)) errors.push("La méthode d'amortissement est invalide.");
  if (!validDate(asset?.date)) errors.push("La date de mise en service est invalide.");
  return { ok: errors.length === 0, errors };
}

export function buildFixedAssetSchedule(asset, options = {}) {
  const validation = validateFixedAsset(asset);
  if (!validation.ok) return { ok: false, errors: validation.errors, rows: [], totals: null };
  const cost = round2(Number(asset.amount));
  const residual = round2(Number(asset.residualValue || 0));
  const depreciable = round2(cost - residual);
  const life = Number(asset.years);
  const serviceDate = asset.date;
  const usefulEnd = addYears(serviceDate, life);
  const requestedStart = options.startDate && validDate(options.startDate) ? options.startDate : serviceDate;
  const requestedEnd = options.endDate && validDate(options.endDate) ? options.endDate : addDays(usefulEnd, -1);
  if (requestedStart > requestedEnd) return { ok: false, errors: ["La période demandée est inversée."], rows: [], totals: null };
  const start = requestedStart < serviceDate ? serviceDate : requestedStart;
  const end = requestedEnd >= usefulEnd ? addDays(usefulEnd, -1) : requestedEnd;
  if (start > end) return { ok: true, errors: [], rows: [], totals: { depreciation: 0, accumulated: 0, netBookValue: cost } };

  const rows = [];
  let accumulated = 0;
  let cursor = serviceDate;
  let yearIndex = 0;
  while (cursor < usefulEnd) {
    const nextAnniversary = addYears(serviceDate, yearIndex + 1);
    const periodEnd = addDays(nextAnniversary, -1);
    const sliceStart = cursor;
    const sliceEnd = periodEnd;
    const totalDays = Math.max(1, daysBetween(sliceStart, nextAnniversary));
    const remainingBefore = round2(depreciable - accumulated);
    let annualCharge;
    let rate = 1 / life;
    if (asset.method === "degressif") {
      const coefficient = life <= 3 ? 1.25 : life <= 4 ? 1.5 : life <= 5 ? 1.75 : life <= 6 ? 2 : 2.25;
      const decliningRate = Math.min(1, coefficient / life);
      const remainingYears = life - yearIndex;
      const straightLineRate = 1 / remainingYears;
      rate = decliningRate;
      annualCharge = remainingBefore * decliningRate;
      if (remainingBefore * decliningRate < remainingBefore * straightLineRate) {
        annualCharge = remainingBefore * straightLineRate;
        rate = straightLineRate;
      }
    } else {
      annualCharge = depreciable / life;
    }
    const overlapStart = start > sliceStart ? start : sliceStart;
    const overlapEnd = end < sliceEnd ? end : sliceEnd;
    const overlapDays = overlapStart <= overlapEnd ? daysBetween(overlapStart, addDays(overlapEnd, 1)) : 0;
    const fullPeriodCharge = yearIndex === life - 1 ? remainingBefore : round2(annualCharge);
    const charge = overlapDays ? round2(Math.min(remainingBefore, fullPeriodCharge * overlapDays / totalDays)) : 0;
    if (overlapDays) {
      const before = accumulated;
      accumulated = round2(Math.min(depreciable, accumulated + charge));
      rows.push({
        year: new Date(sliceStart + "T00:00:00Z").getUTCFullYear() + yearIndex,
        startDate: overlapStart,
        endDate: overlapEnd,
        days: overlapDays,
        rate: round2(rate * 10000) / 100,
        openingValue: round2(cost - before),
        depreciation: round2(accumulated - before),
        annuite: round2(accumulated - before),
        accumulated: round2(accumulated),
        cumul: round2(accumulated),
        netBookValue: round2(Math.max(residual, cost - accumulated)),
        vnc: round2(Math.max(residual, cost - accumulated)),
      });
    }
    cursor = nextAnniversary;
    yearIndex++;
  }
  const depreciation = round2(rows.reduce((sum, row) => sum + row.depreciation, 0));
  const bookValueAtEnd = round2(Math.max(residual, cost - accumulated));
  return { ok: true, errors: [], rows, totals: { cost, residualValue: residual, depreciable, depreciation, accumulated: round2(accumulated), netBookValue: bookValueAtEnd, usefulEnd } };
}

export function fixedAssetsSummary(assets = []) {
  const rows = (Array.isArray(assets) ? assets : []).map(asset => {
    const validation = validateFixedAsset(asset);
    const cost = Number(asset?.amount) || 0;
    const residual = Number(asset?.residualValue) || 0;
    const accumulated = Math.min(Math.max(0, Number(asset?.amortized) || 0), Math.max(0, cost - residual));
    return {
      name: String(asset?.name || ""),
      account: String(asset?.account || ""),
      valid: validation.ok,
      errors: validation.errors,
      cost: round2(cost),
      residualValue: round2(residual),
      accumulated: round2(accumulated),
      netBookValue: round2(Math.max(residual, cost - accumulated)),
      progress: cost > residual ? round2(accumulated / (cost - residual) * 100) : 100,
    };
  });
  return {
    count: rows.length,
    grossValue: round2(rows.reduce((sum, row) => sum + row.cost, 0)),
    accumulated: round2(rows.reduce((sum, row) => sum + row.accumulated, 0)),
    netBookValue: round2(rows.reduce((sum, row) => sum + row.netBookValue, 0)),
    rows,
  };
}
