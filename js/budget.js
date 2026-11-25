// MIZANE — Budgets prévisionnels et contrôle des écarts.
import { saveStore } from "./db.js";
import { store, planAccounts, $app, toast, esc, money } from "./state.js";
import { buildBudgetReport, validateBudgetLines } from "./budget-core.js";

const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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
  const start = fiscalStart(), end = fiscalEnd();
  const accounts = accountOptions();
  const report = buildBudgetReport({ lines: plan.lines, entries: store.entries || [], startDate: start, endDate: end, currency: store.settings.currency });
  const accountMap = new Map(accounts.map(item => [String(item.code), item]));
  const lines = plan.lines.map(item => ({ ...item, label: accountMap.get(String(item.account))?.label || item.label || "Compte " + item.account }));
  const total = report.ok ? report.totals : { budgetExpenses: 0, actualExpenses: 0, budgetIncome: 0, actualIncome: 0, netBudget: 0, netActual: 0, netVariance: 0 };
  const monthRows = report.ok ? report.months.map(month => {
    const label = new Date(month.key + "-01T00:00:00").toLocaleDateString(store.settings.locale || "fr", { month: "long", year: "numeric" });
    return "<tr><td>" + esc(label) + "</td><td class=\\"num\\">" + money(month.budgetExpenses) + "</td><td class=\\"num\\">" + money(month.actualExpenses) + "</td><td class=\\"num\\">" + money(month.expenseVariance) + "</td><td class=\\"num\\">" + money(month.budgetIncome) + "</td><td class=\\"num\\">" + money(month.actualIncome) + "</td><td class=\\"num\\">" + money(month.incomeVariance) + "</td></tr>";
  }).join("") : "";
  const lineRows = report.ok ? report.lines.map(item => {
    const label = accountMap.get(item.account)?.label || item.label;
    return "<tr><td>" + esc(item.account) + "</td><td>" + esc(label) + "</td><td>" + (item.type === "expense" ? "Charge" : "Produit") + "</td><td class=\\"num\\">" + money(item.budgetTotal) + "</td><td class=\\"num\\">" + money(item.actualTotal) + "</td><td class=\\"num\\">" + money(item.variance) + "</td><td><button type=\\"button\\" class=\\"danger small\\" data-budget-delete=\\"" + esc(item.account) + "\\">Supprimer</button></td></tr>";
  }).join("") : "";
  const alerts = report.ok ? report.alerts.map(item => {
    const label = item.type === "expense_overrun" ? "Dépassement des charges" : "Produits inférieurs au budget";
    return "<tr><td>" + esc(item.month) + "</td><td>" + label + "</td><td class=\\"num\\">" + money(item.amount) + "</td></tr>";
  }).join("") : "";
  const options = accounts.map(item => "<option value=\\"" + esc(item.code) + "\\">" + esc(item.code + " — " + item.label) + " (" + (item.type === "expense" ? "Charge" : "Produit") + ")</option>").join("");
  $app.innerHTML = `
    <h1>Gestion budgétaire</h1>
    <p class="muted">Exercice : ${esc(start)} → ${esc(end)} · Devise : ${esc(store.settings.currency)}. Les réalisations proviennent exclusivement des écritures comptabilisées.</p>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Charges — budget / réel</div><div class="value">${money(total.budgetExpenses)}</div><div class="muted">Réel : ${money(total.actualExpenses)}</div></section>
      <section class="card kpi"><div class="label">Produits — budget / réel</div><div class="value">${money(total.budgetIncome)}</div><div class="muted">Réel : ${money(total.actualIncome)}</div></section>
      <section class="card kpi"><div class="label">Résultat budgété / réalisé</div><div class="value">${money(total.netActual)}</div><div class="muted">Budget : ${money(total.netBudget)} · Écart : ${money(total.netVariance)}</div></section>
    </div>
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
    <p class="muted">Les budgets sont enregistrés dans les paramètres de l’entreprise. Ce suivi est analytique : il ne génère aucune écriture, ne modifie aucun règlement et ne clôture aucune période.</p>
  `;
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
