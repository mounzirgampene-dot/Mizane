// MIZANE — Budgets prévisionnels et contrôle des écarts.
import { saveStore } from "./db.js";
import { store, planAccounts, $app, toast, esc, money } from "./state.js";
import { buildBudgetReport, validateBudgetLines } from "./budget-core.js";
import { buildBudgetOutlook } from "./budget-outlook-core.js";
import { buildAnalyticalBudgetReport, validateAnalyticalBudgets } from "./analytical-budget-core.js";

const fiscalStart = () => store.settings.exerciceStart || new Date().getFullYear() + "-01-01";
const fiscalEnd = () => store.settings.exerciceEnd || new Date().getFullYear() + "-12-31";
const currentPlan = () => {
  const year = fiscalStart().slice(0, 4);
  if (!Array.isArray(store.settings.budgetPlans)) store.settings.budgetPlans = [];
  let plan = store.settings.budgetPlans.find(item => String(item.year) === year);
  if (!plan) {
    plan = { year, lines: [] };
    store.settings.budgetPlans.push(plan);
  }
  if (!Array.isArray(plan.lines)) plan.lines = [];
  return plan;
};
const accountOptions = () => {
  const accounts = [...planAccounts, ...(store.settings.customAccounts || [])];
  const seen = new Set();
  return accounts.filter(item => {
    const code = String(item.code || "");
    if (!["expense", "income"].includes(item.type) || seen.has(code)) return false;
    seen.add(code);
    return true;
  }).sort((a, b) => a.code.localeCompare(b.code));
};

export function viewBudget() {
  const plan = currentPlan();
  if (!Array.isArray(store.settings.analyticalBudgetPlans)) store.settings.analyticalBudgetPlans = [];
  const analyticalPlan = store.settings.analyticalBudgetPlans.find(item => String(item.year) === String(plan.year)) || { year: plan.year, lines: [] };
  if (!Array.isArray(analyticalPlan.lines)) analyticalPlan.lines = [];
  if (!store.settings.analyticalBudgetPlans.some(item => String(item.year) === String(plan.year))) store.settings.analyticalBudgetPlans.push(analyticalPlan);
  const start = fiscalStart(), end = fiscalEnd();
  const accounts = accountOptions();
  const centers = Array.isArray(store.settings.analyticalCenters) ? store.settings.analyticalCenters : [];
  const projects = Array.isArray(store.settings.analyticalProjects) ? store.settings.analyticalProjects : [];
  const baseCurrency = String(store.settings.currency || "MAD").toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const asOf = today < start ? start : today > end ? end : today;
  const analyticalBudgetReport = buildAnalyticalBudgetReport({ lines: analyticalPlan.lines, entries: store.entries || [], allocations: store.settings.analyticalAllocations || [], centers, projects, accounts, startDate: start, endDate: end, asOf, baseCurrency });
  const report = buildBudgetReport({ lines: plan.lines, entries: store.entries || [], startDate: start, endDate: end, currency: store.settings.currency });
  const outlook = buildBudgetOutlook({ report, entries: store.entries || [], startDate: start, asOf: new Date().toISOString().slice(0, 10) });
  const accountMap = new Map(accounts.map(item => [String(item.code), item]));
  const total = report.ok ? report.totals : { budgetExpenses: 0, actualExpenses: 0, budgetIncome: 0, actualIncome: 0, netBudget: 0, netActual: 0, netVariance: 0 };
  const monthRows = report.ok ? report.months.map(month => {
    const label = new Date(month.key + "-01T00:00:00").toLocaleDateString(store.settings.locale || "fr", { month: "long", year: "numeric" });
    return "<tr><td>" + esc(label) + "</td><td class=\"num\">" + money(month.budgetExpenses) + "</td><td class=\"num\">" + money(month.actualExpenses) + "</td><td class=\"num\">" + money(month.expenseVariance) + "</td><td class=\"num\">" + money(month.budgetIncome) + "</td><td class=\"num\">" + money(month.actualIncome) + "</td><td class=\"num\">" + money(month.incomeVariance) + "</td></tr>";
  }).join("") : "";
  const lineRows = report.ok ? report.lines.map(item => {
    const label = accountMap.get(item.account)?.label || item.label;
    return "<tr><td>" + esc(item.account) + "</td><td>" + esc(label) + "</td><td>" + (item.type === "expense" ? "Charge" : "Produit") + "</td><td class=\"num\">" + money(item.budgetTotal) + "</td><td class=\"num\">" + money(item.actualTotal) + "</td><td class=\"num\">" + money(item.variance) + "</td><td><button type=\"button\" class=\"danger small\" data-budget-delete=\"" + esc(item.account) + "\">Supprimer</button></td></tr>";
  }).join("") : "";
  const axisOptions = [
    ...centers.map(item => ({ value: "center|" + item.id, label: "Centre · " + item.name })),
    ...projects.map(item => ({ value: "project|" + item.id, label: "Projet · " + item.name })),
    ...[...new Set(projects.map(item => String(item.department || "").trim()).filter(Boolean))].map(name => ({ value: "department|" + name, label: "Département · " + name })),
  ];
  const dimensionLabel = line => line.dimensionType === "center" ? "Centre · " + (centers.find(x => String(x.id) === line.dimensionId)?.name || "Centre supprimé") : line.dimensionType === "project" ? "Projet · " + (projects.find(x => String(x.id) === line.dimensionId)?.name || "Projet supprimé") : "Département · " + line.dimensionId;
  const analyticCurrency = (amount, currency) => { try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(amount || 0)); } catch { return String(amount || 0) + " " + currency; } };
  const analyticLines = analyticalBudgetReport.ok ? analyticalBudgetReport.lines : [];
  const analyticRows = analyticLines.map(line => "<tr><td>" + esc(line.account) + " · " + esc(line.label) + "</td><td>" + esc(line.type === "expense" ? "Charge" : "Produit") + "</td><td>" + esc(dimensionLabel(line)) + "</td><td>" + esc(line.currency) + "</td><td class=\"num\">" + analyticCurrency(line.budgetTotal,line.currency) + "</td><td class=\"num\">" + analyticCurrency(line.actualTotal,line.currency) + "</td><td class=\"num\">" + analyticCurrency(line.variance,line.currency) + "</td><td class=\"num\">" + (line.varianceRate === null ? "—" : line.varianceRate + " %") + "</td><td class=\"num\">" + analyticCurrency(line.projected,line.currency) + "</td><td>" + (line.severity === "critical" ? "Critique" : line.severity === "warning" ? "Vigilance" : "Dans la cible") + "</td><td><button type=\"button\" class=\"danger small\" data-analytic-budget-delete=\"" + esc(line.id) + "\">Supprimer</button></td></tr>").join("");
  const dimensionRows = analyticalBudgetReport.ok ? analyticalBudgetReport.dimensions.map(row => "<tr><td>" + esc(row.name) + "</td><td>" + esc(row.dimensionType) + "</td><td>" + esc(row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.budget,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.actual,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.variance,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.projected,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.resultActual,row.currency) + "</td><td class=\"num\">" + (row.marginRate === null ? "—" : row.marginRate + " %") + "</td></tr>").join("") : "";
  const currencyRows = analyticalBudgetReport.ok ? analyticalBudgetReport.currencies.map(row => "<tr><td><strong>" + esc(row.currency) + "</strong></td><td class=\"num\">" + analyticCurrency(row.budgetExpenses,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.actualExpenses,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.budgetIncome,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.actualIncome,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.actualResult,row.currency) + "</td><td class=\"num\">" + analyticCurrency(row.projectedResult,row.currency) + "</td></tr>").join("") : "";
  const analyticAlerts = analyticalBudgetReport.ok ? analyticalBudgetReport.alerts.map(item => "<tr><td>" + esc(item.dimensionName) + "</td><td>" + esc(item.account) + "</td><td>" + esc(item.currency) + "</td><td>" + (item.severity === "critical" ? "Critique" : "Vigilance") + "</td><td class=\"num\">" + (item.forecastExecutionRate === null ? "—" : item.forecastExecutionRate + " %") + "</td><td class=\"num\">" + analyticCurrency(item.projectedVariance,item.currency) + "</td></tr>").join("") : "";
  const alerts = report.ok ? report.alerts.map(item => {
    const label = item.type === "expense_overrun" ? "Dépassement des charges" : "Produits inférieurs au budget";
    return "<tr><td>" + esc(item.month) + "</td><td>" + label + "</td><td class=\"num\">" + money(item.amount) + "</td></tr>";
  }).join("") : "";

  const outlookRows = outlook.ok ? outlook.lines.map(item => "<tr><td>" + esc(item.account) + "</td><td>" + esc(item.label) + "</td><td>" + (item.type === "expense" ? "Charge" : "Produit") + "</td><td >" + money(item.projectedYearEnd) + "</td><td >" + money(item.budgetTotal) + "</td><td >" + money(item.projectedVariance) + "</td><td>" + (item.severity === "critical" ? "Critique" : item.severity === "warning" ? "Vigilance" : "Dans la cible") + "</td></tr>").join("") : "";
  const options = accounts.map(item => "<option value=\"" + esc(item.code) + "\">" + esc(item.code + " — " + item.label) + " (" + (item.type === "expense" ? "Charge" : "Produit") + ")</option>").join("");
  $app.innerHTML = `
    <h1>Gestion budgétaire</h1>
    <p class="muted">Exercice : ${esc(start)} → ${esc(end)} · Devise : ${esc(store.settings.currency)}. Les réalisations proviennent exclusivement des écritures comptabilisées.</p>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Charges — budget / réel</div><div class="value">${money(total.budgetExpenses)}</div><div class="muted">Réel : ${money(total.actualExpenses)}</div></section>
      <section class="card kpi"><div class="label">Produits — budget / réel</div><div class="value">${money(total.budgetIncome)}</div><div class="muted">Réel : ${money(total.actualIncome)}</div></section>
      <section class="card kpi"><div class="label">Résultat budgété / réalisé</div><div class="value">${money(total.netActual)}</div><div class="muted">Budget : ${money(total.netBudget)} · Écart : ${money(total.netVariance)}</div></section>
    </div>
    <section class="card">
      <h2>Projection de fin d’exercice</h2>
      <p class="muted">${outlook.ok ? esc(outlook.method) : "Projection indisponible : " + esc(outlook.errors[0] || "données insuffisantes.")}</p>
      ${outlook.ok ? '<div class="grid cols-3"><div class="kpi"><div class="label">Charges projetées</div><div class="value">' + money(outlook.totals.expenses.projectedYearEnd) + '</div><div class="muted">Budget : ' + money(outlook.totals.expenses.fullYearBudget) + '</div></div><div class="kpi"><div class="label">Produits projetés</div><div class="value">' + money(outlook.totals.income.projectedYearEnd) + '</div><div class="muted">Budget : ' + money(outlook.totals.income.fullYearBudget) + '</div></div><div class="kpi"><div class="label">Résultat projeté</div><div class="value">' + money(outlook.totals.net.projectedYearEnd) + '</div><div class="muted">Écart au budget : ' + money(outlook.totals.net.projectedVariance) + '</div></div></div>' : ""}
      <p class="muted">Mois écoulés : ${outlook.elapsedMonths} · Mois restants : ${outlook.remainingMonths}. Projection fondée sur le rythme moyen constaté.</p>
      <div class="table-wrap"><table><thead><tr><th>Compte</th><th>Libellé</th><th>Nature</th><th class="num">Projection</th><th class="num">Budget</th><th class="num">Écart favorable</th><th>État</th></tr></thead><tbody>${outlookRows || '<tr><td colspan="7" class="muted">Aucune projection disponible.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card">
      <h2>Ajouter une ligne budgétaire</h2>
      <p class="muted">Saisissez un montant mensuel pour un compte de charges ou de produits. Le budget est réparti sur les mois de l’exercice ; les montants réels sont calculés à partir des écritures dont le compte commence par le code choisi.</p>
      <form id="budget-form">
        <div class="row">
          <div><label for="budget-account">Compte</label><select id="budget-account" required><option value="">Sélectionner un compte</option>${options}</select></div>
          <div><label for="budget-monthly">Budget mensuel (${esc(store.settings.currency)})</label><input id="budget-monthly" type="number" min="0.01" max="999999999999" step="0.01" required></div>
          <div class="nogrow"><button type="submit">Ajouter au budget</button></div>
        </div>
      </form>
    </section>
    <section class="card table-wrap">
      <h2>Budget par compte — exercice ${esc(start.slice(0,4))}</h2>
      <table><thead><tr><th>Compte</th><th>Libellé</th><th>Nature</th><th class="num">Budget annuel</th><th class="num">Réalisé</th><th class="num">Écart favorable</th><th>Action</th></tr></thead>
      <tbody>${lineRows || '<tr><td colspan="7" class="muted">Aucune ligne budgétaire définie.</td></tr>'}</tbody></table>
    </section>
    <section class="card table-wrap">
      <h2>Suivi mensuel des écarts</h2>
      <table><thead><tr><th>Mois</th><th class="num">Charges budgétées</th><th class="num">Charges réelles</th><th class="num">Écart</th><th class="num">Produits budgétés</th><th class="num">Produits réels</th><th class="num">Écart</th></tr></thead>
      <tbody>${monthRows || '<tr><td colspan="7" class="muted">Aucune donnée budgétaire.</td></tr>'}</tbody></table>
      <p class="muted">Pour les charges, un écart positif signifie une économie. Pour les produits, un écart positif signifie un dépassement favorable du budget.</p>
    </section>
    <section class="card table-wrap">
      <h2>Alertes budgétaires</h2>
      <table><thead><tr><th>Mois</th><th>Situation</th><th class="num">Montant de l'écart</th></tr></thead><tbody>${alerts || '<tr><td colspan="3" class="muted">Aucun dépassement de charges ou manque de produits détecté.</td></tr>'}</tbody></table>
    </section>
    <section class="card" id="analytical-budget-dashboard">
      <h2>Pilotage budgétaire analytique intégré</h2>
      <p class="muted">Budgets par centre, projet ou département, comparés aux affectations analytiques réellement enregistrées. Période : ${esc(start)} → ${esc(end)} · Date de référence : ${esc(asOf)}. Les montants restent séparés par devise ; aucune conversion n'est effectuée.</p>
      ${!analyticalBudgetReport.ok ? '<p class="muted">Rapport indisponible : '+esc(analyticalBudgetReport.errors[0]||"données invalides")+'</p>' : ''}
      <h3>Synthèse par devise</h3>
      <div class="table-wrap"><table><thead><tr><th>Devise</th><th class="num">Charges budgétées</th><th class="num">Charges réelles</th><th class="num">Produits budgétés</th><th class="num">Produits réels</th><th class="num">Résultat réel</th><th class="num">Résultat projeté</th></tr></thead><tbody>${currencyRows || '<tr><td colspan="7" class="muted">Aucun budget analytique défini.</td></tr>'}</tbody></table></div>
      <h3>Performance par centre, projet et département</h3>
      <div class="table-wrap"><table><thead><tr><th>Axe</th><th>Type</th><th>Devise</th><th class="num">Budget</th><th class="num">Réalisé</th><th class="num">Écart favorable</th><th class="num">Projection</th><th class="num">Résultat</th><th class="num">Marge</th></tr></thead><tbody>${dimensionRows || '<tr><td colspan="9" class="muted">Aucune réalisation analytique budgétée.</td></tr>'}</tbody></table></div>
      <h3>Détail des budgets par compte et axe</h3>
      <div class="table-wrap"><table><thead><tr><th>Compte</th><th>Nature</th><th>Axe</th><th>Devise</th><th class="num">Budget</th><th class="num">Réalisé</th><th class="num">Écart</th><th class="num">Écart %</th><th class="num">Projection</th><th>État</th><th>Action</th></tr></thead><tbody>${analyticRows || '<tr><td colspan="11" class="muted">Aucune ligne de budget analytique.</td></tr>'}</tbody></table></div>
      <h3>Alertes et prévisions de dépassement</h3>
      <div class="table-wrap"><table><thead><tr><th>Axe</th><th>Compte</th><th>Devise</th><th>Gravité</th><th class="num">Exécution projetée</th><th class="num">Écart projeté</th></tr></thead><tbody>${analyticAlerts || '<tr><td colspan="6" class="muted">Aucune alerte de dépassement projeté.</td></tr>'}</tbody></table></div>
      <h3>Ajouter un budget analytique</h3>
      <p class="muted">Les réalisations proviennent des affectations existantes. Les lignes non affectées ne sont pas attribuées arbitrairement à un axe.</p>
      <form id="analytical-budget-form"><div class="row">
        <div><label for="ab-account">Compte</label><select id="ab-account" required><option value="">Sélectionner</option>${options}</select></div>
        <div><label for="ab-axis">Axe analytique</label><select id="ab-axis" required><option value="">Sélectionner</option>${axisOptions.map(item=>'<option value="'+esc(item.value)+'">'+esc(item.label)+'</option>').join("")}</select></div>
        <div><label for="ab-monthly">Budget mensuel</label><input id="ab-monthly" type="number" min="0.01" step="0.01" required></div>
        <div><label for="ab-currency">Devise ISO</label><input id="ab-currency" value="${esc(baseCurrency)}" maxlength="3" pattern="[A-Za-z]{3}" required></div>
        <div class="nogrow"><button type="submit">Enregistrer</button></div>
      </div></form>
      <div class="row"><button type="button" id="ab-export">Exporter le rapport CSV</button><button type="button" class="secondary" id="ab-print">Imprimer / PDF</button></div>
      <p class="muted">Projection indicative fondée sur le rythme moyen constaté. Elle n'est ni probabiliste ni une garantie de résultat. Ce pilotage ne modifie aucune écriture comptable.</p>
    </section>
    <p class="muted">Les budgets sont enregistrés dans les paramètres de l’entreprise. Ce suivi est analytique : il ne génère aucune écriture, ne modifie aucun règlement et ne clôture aucune période.</p>
  `;
  document.getElementById("analytical-budget-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const account=document.getElementById("ab-account").value, axis=document.getElementById("ab-axis").value.split("|"), monthlyAmount=Number(document.getElementById("ab-monthly").value), currency=String(document.getElementById("ab-currency").value||"").trim().toUpperCase();
    const selected=accounts.find(item=>String(item.code)===account);
    if(!selected||axis.length!==2||!Number.isFinite(monthlyAmount)||monthlyAmount<=0)return toast("Compte, axe ou montant invalide.");
    const candidate={id:"ab-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),account,type:selected.type,monthlyAmount,label:selected.label,dimensionType:axis[0],dimensionId:axis[1],currency};
    const validation=validateAnalyticalBudgets([...analyticalPlan.lines,candidate],{centers,projects,accounts,baseCurrency});
    if(!validation.ok)return toast(validation.errors[0],4500);
    analyticalPlan.lines=validation.lines;saveStore(store);toast("Budget analytique enregistré.");viewBudget();
  });
  $app.querySelectorAll("[data-analytic-budget-delete]").forEach(button=>button.addEventListener("click",()=>{
    analyticalPlan.lines=analyticalPlan.lines.filter(item=>String(item.id)!==button.dataset.analyticBudgetDelete);
    saveStore(store);toast("Ligne de budget analytique supprimée.");viewBudget();
  }));
  $app.querySelector("#ab-export")?.addEventListener("click",()=>{
    const rows=[["Axe","Type axe","Compte","Nature","Devise","Budget","Réalisé","Écart favorable","Écart %","Projection","Écart projeté","Exécution projetée","Gravité"]];
    for(const line of analyticLines)rows.push([line.dimensionName,line.dimensionType,line.account,line.type,line.currency,line.budgetTotal,line.actualTotal,line.variance,line.varianceRate??"",line.projected,line.projectedVariance,line.forecastExecutionRate??"",line.severity]);
    const csv="\\uFEFF"+rows.map(row=>row.map(value=>'"'+String(value??"").replaceAll('"','""')+'"').join(";")).join("\\r\\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="mizane-pilotage-budgetaire-analytique.csv";a.click();URL.revokeObjectURL(url);
  });
  $app.querySelector("#ab-print")?.addEventListener("click",()=>{
    const section=$app.querySelector("#analytical-budget-dashboard");if(!section)return;
    const w=window.open("","_blank");if(!w)return toast("Autorisez la fenêtre d'impression pour exporter le rapport.");
    w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Pilotage budgétaire MIZANE</title><style>body{font:12px Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{border:1px solid #bbb;padding:6px;text-align:left}.num{text-align:right}button,form{display:none}</style></head><body>"+section.innerHTML+"</body></html>");w.document.close();w.focus();w.print();
  });
  document.getElementById("budget-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const account = document.getElementById("budget-account").value;
    const monthlyAmount = Number(document.getElementById("budget-monthly").value);
    const selected = accounts.find(item => String(item.code) === account);
    if (!selected || !Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return toast("Compte ou montant budgétaire invalide.");
    const candidate = [...plan.lines, { account, type: selected.type, monthlyAmount, label: selected.label }];
    const validation = validateBudgetLines(candidate);
    if (!validation.ok) return toast(validation.errors[0], 4500);
    plan.lines = validation.lines;
    saveStore(store);
    toast("Ligne budgétaire enregistrée.");
    viewBudget();
  });
  $app.querySelectorAll("[data-budget-delete]").forEach(button => button.addEventListener("click", () => {
    plan.lines = plan.lines.filter(item => String(item.account) !== button.dataset.budgetDelete);
    saveStore(store);
    toast("Ligne budgétaire supprimée.");
    viewBudget();
  }));
}
