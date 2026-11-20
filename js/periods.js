// MIZANE — Règles locales de contrôle des périodes comptables.
import { validDate } from "./accounting.js";

export function validatePeriodRange(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate)) return { ok: false, error: "Dates de période invalides." };
  if (startDate > endDate) return { ok: false, error: "La date de début doit précéder la date de fin." };
  return { ok: true };
}

export function isDateInClosedPeriod(date, periods = []) {
  if (!validDate(date)) return false;
  return periods.some(period =>
    period && period.status !== "open" &&
    validDate(period.startDate) && validDate(period.endDate) &&
    date >= period.startDate && date <= period.endDate
  );
}

export function addClosedPeriod(periods = [], period) {
  const check = validatePeriodRange(period?.startDate, period?.endDate);
  if (!check.ok) throw new Error(check.error);
  const list = Array.isArray(periods) ? periods : [];
  const overlap = list.find(item =>
    item.status !== "open" &&
    period.startDate <= item.endDate && period.endDate >= item.startDate
  );
  if (overlap) throw new Error("Cette période chevauche une période déjà clôturée.");
  return [...list, { ...period, status: "closed" }].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function removeClosedPeriod(periods = [], startDate, endDate) {
  return (Array.isArray(periods) ? periods : []).filter(item =>
    !(item.status === "closed" && item.startDate === startDate && item.endDate === endDate)
  );
}
