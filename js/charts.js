// MIZANE — Visualisations financières accessibles et sans dépendance externe.
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[char]));

export function chartModeControls(id) {
  return `<div class="chart-mode actions" role="group" aria-label="Mode d’affichage">
    <button type="button" class="secondary active" data-chart-mode="table" data-chart-id="${escapeHTML(id)}" aria-pressed="true">Tableau</button>
    <button type="button" class="secondary" data-chart-mode="chart" data-chart-id="${escapeHTML(id)}" aria-pressed="false">Graphiques</button>
  </div>`;
}

export function bindChartMode(id) {
  const root = document;
  const table = root.getElementById(`${id}-table-view`);
  const chart = root.getElementById(`${id}-chart-view`);
  if (!table || !chart) return;
  root.querySelectorAll(`[data-chart-id="${id}"]`).forEach(button => {
    button.addEventListener("click", () => {
      const showChart = button.dataset.chartMode === "chart";
      table.hidden = showChart;
      chart.hidden = !showChart;
      root.querySelectorAll(`[data-chart-id="${id}"]`).forEach(item => {
        const active = (item.dataset.chartMode === "chart") === showChart;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });
  });
}

export function renderHorizontalBars(title, rows, series, formatValue = value => Number(value).toLocaleString("fr-FR")) {
  const cleanRows = (rows || []).map(row => ({
    label: String(row.label ?? ""),
    values: series.map(item => Math.max(0, Number(row[item.key]) || 0)),
  })).filter(row => row.values.some(value => value > 0));
  if (!cleanRows.length) return `<section class="card financial-chart"><h2>${escapeHTML(title)}</h2><p class="muted">Aucune donnée à représenter pour cette période.</p></section>`;
  const max = Math.max(1, ...cleanRows.flatMap(row => row.values));
  return `<section class="card financial-chart"><h2>${escapeHTML(title)}</h2>
    <div class="chart-legend">${series.map((item,index) => `<span><i class="chart-swatch chart-color-${index%4}"></i>${escapeHTML(item.label)}</span>`).join("")}</div>
    <div class="chart-rows">${cleanRows.map(row => `<div class="chart-row">
      <div class="chart-row-label" title="${escapeHTML(row.label)}">${escapeHTML(row.label)}</div>
      <div class="chart-row-bars">${row.values.map((value,index) => `<div class="chart-bar-line"><div class="chart-bar-track"><div class="chart-bar-fill chart-color-${index%4}" style="width:${Math.max(value>0?1:0,Math.min(100,value/max*100))}%"></div></div><span class="chart-bar-value">${escapeHTML(formatValue(value))}</span></div>`).join("")}</div>
    </div>`).join("")}</div>
  </section>`;
}
