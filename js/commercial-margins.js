// MIZANE — Rapport des coûts d'achat et des marges commerciales.
import { store, $app, esc, toast } from "./state.js";
import { hasActiveStockCompany, readCloudStock } from "./cloud-sync.js";
import { buildCommercialMarginReport } from "./commercial-margin-core.js";
import { buildCommercialPerformanceReport } from "./commercial-performance-core.js";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + "01";

export async function viewCommercialMargins() {
  if (!hasActiveStockCompany()) {
    $app.innerHTML = '<section class="card"><h2>Marges commerciales</h2><p>Ce rapport nécessite un espace professionnel connecté avec gestion du stock.</p></section>';
    return;
  }
  $app.innerHTML = '<section class="card"><p>Chargement des coûts de stock et des factures de vente…</p></section>';
  try {
    const stock = await readCloudStock();
    const render = (startDate, endDate) => {
      const billing = store.billing || {};
      const docs = Array.isArray(billing.documents) ? billing.documents : [];
      const report = buildCommercialMarginReport({
        invoices: docs.filter(doc => doc.type === "invoice"),
        creditNotes: docs.filter(doc => doc.type === "credit_note"),
        movements: stock.movements || [], products: stock.products || [],
        startDate, endDate, baseCurrency: store.settings.currency || "MAD",
      });
      if (!report.ok) { toast(report.errors[0]); return; }
      const performance = buildCommercialPerformanceReport({
        invoices: docs.filter(doc => doc.type === "invoice"),
        creditNotes: docs.filter(doc => doc.type === "credit_note"),
        movements: stock.movements || [], products: stock.products || [],
        startDate, endDate, baseCurrency: store.settings.currency || "MAD",
      });
      if (!performance.ok) { toast(performance.errors[0]); return; }
      const currencies = report.baseCurrencies;
      const format = (value, currency) => new Intl.NumberFormat(store.settings.locale || "fr-FR", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "MAD" }).format(Number(value || 0));
      const totalsByCurrency = currencies.map(currency => {
        const rows = report.rows.filter(row => row.currency === currency);
        return { currency, revenue: rows.reduce((sum,row)=>sum+row.revenue,0), cost: rows.reduce((sum,row)=>sum+row.cost,0), margin: rows.reduce((sum,row)=>sum+row.margin,0) };
      });
      const table = report.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Article</th><th>Référence</th><th class="num">Qté vendue</th><th class="num">CA HT net</th><th class="num">Coût stock</th><th class="num">Marge brute</th><th class="num">Taux</th><th class="num">Factures</th></tr></thead><tbody>' +
        report.rows.map(row => '<tr><td>'+esc(row.productName)+'</td><td>'+esc(row.sku)+'</td><td class="num">'+row.units+'</td><td class="num">'+format(row.revenue,row.currency)+'</td><td class="num">'+format(row.cost,row.currency)+'</td><td class="num">'+format(row.margin,row.currency)+'</td><td class="num">'+(row.marginRate==null?'—':row.marginRate.toFixed(2)+' %')+'</td><td class="num">'+row.invoices+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">Aucune vente d’article lié au stock sur cette période.</p>';
      const performanceHtml = currencies.map(currency => {
        const ranking = performance.rankings[currency];
        if (!ranking) return "";
        const rankingTable = (rows, label) => rows.length
          ? '<h3>'+label+'</h3><div class="table-wrap"><table><thead><tr><th>Article</th><th class="num">CA HT</th><th class="num">Marge</th><th class="num">Taux</th></tr></thead><tbody>'+rows.slice(0,5).map(row=>'<tr><td>'+esc(row.productName)+'</td><td class="num">'+format(row.revenue,currency)+'</td><td class="num">'+format(row.margin,currency)+'</td><td class="num">'+(row.marginRate==null?'—':row.marginRate.toFixed(2)+' %')+'</td></tr>').join('')+'</tbody></table></div>'
          : '<p class="muted">Données insuffisantes pour ce classement.</p>';
        return '<section class="card"><h2>Classement — '+esc(currency)+'</h2>'+rankingTable(ranking.byMargin,"Articles les plus rentables")+rankingTable(ranking.byRevenue,"Articles au chiffre d’affaires le plus élevé")+rankingTable(ranking.byMarginRate,"Meilleurs taux de marge")+'</section>';
      }).join('');
      const trendRows = performance.monthly.length ? '<div class="table-wrap"><table><thead><tr><th>Mois</th><th>Devise</th><th class="num">CA HT</th><th class="num">Coût</th><th class="num">Marge</th><th class="num">Taux</th><th class="num">Qté</th><th class="num">Lignes incomplètes</th></tr></thead><tbody>'+performance.monthly.map(item=>'<tr><td>'+item.month+'</td><td>'+esc(item.currency)+'</td><td class="num">'+format(item.revenue,item.currency)+'</td><td class="num">'+format(item.cost,item.currency)+'</td><td class="num">'+format(item.margin,item.currency)+'</td><td class="num">'+(item.marginRate==null?'—':item.marginRate.toFixed(2)+' %')+'</td><td class="num">'+item.units+'</td><td class="num">'+item.incompleteLines+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">Aucune donnée mensuelle sur la période sélectionnée.</p>';
      $app.querySelector("#cm-results").innerHTML =
        (totalsByCurrency.length ? '<div class="grid cols-3">'+totalsByCurrency.map(item=>'<section class="card kpi"><div class="value">'+format(item.revenue,item.currency)+'</div><div class="label">Chiffre d’affaires HT — '+item.currency+'</div><div class="muted">Coût : '+format(item.cost,item.currency)+' · Marge : '+format(item.margin,item.currency)+'</div></section>').join('')+'</div>' : '') +
        '<section class="card"><h2>Évolution mensuelle</h2>'+trendRows+'</section>' + performanceHtml + table + (report.totals.missingCostLines ? '<p class="errors">'+report.totals.missingCostLines+' ligne(s) sans coût de sortie associé : marge incomplète, à contrôler.</p>' : '<p class="ok-msg">Toutes les lignes analysées disposent d’un coût de sortie associé.</p>') +
        '<p class="muted">Les montants sont présentés dans la devise comptable de chaque facture convertie. Les devises ne sont jamais additionnées entre elles. Les prestations non liées au stock ne sont pas incluses.</p>';
    };
    $app.innerHTML = '<h1>Coûts d’achat et marges commerciales</h1><section class="card"><div class="row"><div><label for="cm-start">Du</label><input id="cm-start" type="date" value="'+monthStart()+'"></div><div><label for="cm-end">Au</label><input id="cm-end" type="date" value="'+today()+'"></div><div class="nogrow"><button id="cm-refresh">Analyser</button></div></div></section><div id="cm-results"></div>';
    const run = () => {
      const start = $app.querySelector("#cm-start").value, end = $app.querySelector("#cm-end").value;
      if (!start || !end || start > end) return toast("Période invalide : vérifiez les deux dates.");
      render(start, end);
    };
    $app.querySelector("#cm-refresh").addEventListener("click", run);
    run();
  } catch (error) {
    $app.innerHTML = '<section class="card"><h2>Analyse indisponible</h2><p class="errors"></p><button id="cm-retry">Réessayer</button></section>';
    $app.querySelector(".errors").textContent = error?.message || "Lecture des coûts de stock impossible.";
    $app.querySelector("#cm-retry").addEventListener("click", viewCommercialMargins);
  }
}
