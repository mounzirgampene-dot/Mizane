// MIZANE — Filtres de période communs aux états financiers.
import { validatePeriodRange } from "./periods.js";

export function periodControls(id, start, end, compare = true) {
  return `<form class="card report-period-controls" data-period-form="${id}">
    <div class="row">
      <div><label for="${id}-period-start">Du</label><input id="${id}-period-start" name="start" type="date" value="${start}" required></div>
      <div><label for="${id}-period-end">Au</label><input id="${id}-period-end" name="end" type="date" value="${end}" required></div>
      <div class="period-compare"><label><input type="checkbox" name="compare" ${compare ? "checked" : ""}> Comparer avec la période équivalente de N-1</label></div>
      <div class="nogrow"><button type="submit">Appliquer</button></div>
    </div>
    <p class="muted" data-period-error hidden></p>
  </form>`;
}

export function bindPeriodControls(id, onApply) {
  const form = document.querySelector(`[data-period-form="${id}"]`);
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const start = form.elements.start.value;
    const end = form.elements.end.value;
    const check = validatePeriodRange(start, end);
    const error = form.querySelector("[data-period-error]");
    if (!check.ok) {
      error.textContent = check.error;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    onApply({ start, end, compare: form.elements.compare.checked });
  });
}

export function previousYearRange(start, end) {
  const shift = value => {
    const [year, month, day] = value.split("-").map(Number);
    const targetYear = year - 1;
    const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
    return `${targetYear}-${String(month).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
  };
  return { start: shift(start), end: shift(end) };
}

export function comparisonTable(title, currentLabel, previousLabel, rows, format = value => String(value)) {
  return `<section class="card table-wrap report-comparison">
    <h2>${title}</h2>
    <table><thead><tr><th>Indicateur</th><th class="num">${currentLabel}</th><th class="num">${previousLabel}</th><th class="num">Évolution</th></tr></thead>
    <tbody>${rows.map(row => {
      const current = Number(row.current) || 0;
      const previous = Number(row.previous) || 0;
      const delta = current - previous;
      const ratio = Math.abs(previous) > 0.000001 ? ` (${((delta / Math.abs(previous)) * 100).toFixed(1).replace(".",",")} %)` : "";
      return `<tr><td>${row.label}</td><td class="num">${format(current)}</td><td class="num">${format(previous)}</td><td class="num">${format(delta)}${ratio}</td></tr>`;
    }).join("")}</tbody></table>
  </section>`;
}
