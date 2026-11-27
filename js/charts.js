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


const chartNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const chartPalette = ["var(--chart-0)","var(--chart-1)","var(--chart-2)","var(--chart-3)"];

export function renderBarChart(title, rows, series, formatValue = value => Number(value).toLocaleString("fr-FR")) {
  const data=(rows||[]).map(row=>({label:String(row.label??""),values:series.map(item=>Math.max(0,chartNumber(row[item.key])))})).filter(row=>row.values.some(value=>value>0)).slice(0,12);
  if(!data.length)return '<section class="card financial-chart"><h3>'+escapeHTML(title)+'</h3><p class="muted">Aucune donnée à représenter pour cette période.</p></section>';
  const max=Math.max(1,...data.flatMap(row=>row.values)),left=190,top=24,plotW=520,rowH=34,barH=Math.min(11,Math.max(7,(rowH-6)/series.length)),height=top+data.length*rowH+18;
  const ticks=Array.from({length:5},(_,i)=>max*i/4);
  const grid=ticks.map(v=>{const x=left+plotW*v/max;return '<line x1="'+x+'" y1="'+top+'" x2="'+x+'" y2="'+(height-12)+'" class="chart-gridline"/><text x="'+x+'" y="'+(height-1)+'" text-anchor="middle" class="chart-axis-label">'+escapeHTML(formatValue(v))+'</text>';}).join("");
  const bars=data.map((row,i)=>'<text x="'+(left-12)+'" y="'+(top+i*rowH+rowH/2+4)+'" text-anchor="end" class="chart-axis-label">'+escapeHTML(row.label.length>27?row.label.slice(0,26)+"…":row.label)+'</text>'+row.values.map((v,j)=>'<rect x="'+left+'" y="'+(top+i*rowH+j*(barH+3)+3)+'" width="'+Math.max(v?2:0,plotW*v/max)+'" height="'+barH+'" rx="5" fill="'+chartPalette[j%4]+'"><title>'+escapeHTML(series[j].label+": "+formatValue(v))+'</title></rect>').join("")).join("");
  return '<section class="card financial-chart"><div class="chart-heading"><div><h3>'+escapeHTML(title)+'</h3><p class="muted">Comparaison des valeurs — données limitées aux 12 premières catégories</p></div><button type="button" class="secondary small" data-chart-toggle aria-expanded="false">Afficher les graphiques</button><div class="chart-legend">'+series.map((item,i)=>'<span><i class="chart-swatch" style="background:'+chartPalette[i%4]+'"></i>'+escapeHTML(item.label)+'</span>').join("")+'</div></div><div class="chart-visual" hidden><div class="chart-svg-wrap"><svg viewBox="0 0 760 '+height+'" role="img" aria-label="'+escapeHTML(title)+'">'+grid+bars+'</svg></div></div></section>';
}

export function renderLineChart(title, rows, series, formatValue = value => Number(value).toLocaleString("fr-FR")) {
  const data=(rows||[]).map(row=>({label:String(row.label??""),values:series.map(item=>chartNumber(row[item.key]))})).filter(row=>row.values.some(value=>value!==0));
  if(!data.length)return '<section class="card financial-chart"><h3>'+escapeHTML(title)+'</h3><p class="muted">Aucune donnée à représenter pour cette période.</p></section>';
  const values=data.flatMap(row=>row.values),min=Math.min(0,...values),max=Math.max(1,...values),range=max-min||1,left=54,right=18,top=20,bottom=48,w=760,h=280,pw=w-left-right,ph=h-top-bottom;
  const x=i=>left+(data.length===1?pw/2:i*pw/(data.length-1)),y=v=>top+(max-v)*ph/range;
  const grid=Array.from({length:5},(_,i)=>{const v=min+range*i/4,yy=y(v);return '<line x1="'+left+'" y1="'+yy+'" x2="'+(w-right)+'" y2="'+yy+'" class="chart-gridline"/><text x="'+(left-8)+'" y="'+(yy+4)+'" text-anchor="end" class="chart-axis-label">'+escapeHTML(formatValue(v))+'</text>';}).join("");
  const paths=series.map((item,j)=>{const points=data.map((row,i)=>x(i)+","+y(row.values[j])).join(" ");return '<polyline points="'+points+'" fill="none" stroke="'+chartPalette[j%4]+'" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+data.map((row,i)=>'<circle cx="'+x(i)+'" cy="'+y(row.values[j])+'" r="4.5" fill="'+chartPalette[j%4]+'"><title>'+escapeHTML(row.label+" · "+item.label+": "+formatValue(row.values[j]))+'</title></circle>').join("");}).join("");
  const labels=data.map((row,i)=>'<text x="'+x(i)+'" y="'+(h-18)+'" text-anchor="middle" class="chart-axis-label">'+escapeHTML(row.label)+'</text>').join("");
  return '<section class="card financial-chart"><div class="chart-heading"><div><h3>'+escapeHTML(title)+'</h3><p class="muted">Évolution chronologique</p></div><div class="chart-legend">'+series.map((item,i)=>'<span><i class="chart-swatch" style="background:'+chartPalette[i%4]+'"></i>'+escapeHTML(item.label)+'</span>').join("")+'</div></div><div class="chart-visual" hidden><div class="chart-svg-wrap"><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+escapeHTML(title)+'">'+grid+paths+labels+'</svg></div></div></section>';
}
