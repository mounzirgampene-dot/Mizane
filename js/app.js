// MIZANE — Contrôleur principal : navigation, routage, démarrage PWA.
import { allAccounts } from "./plans.js";
import { loadStore, demoData } from "./db.js";
import { store, $nav, $app, $modalContent, router, setRoute, currentRoute, initStore, saveNow, toast } from "./state.js";
import { setLang, applyI18n, t } from "./i18n.js";
import { viewDashboard, viewEntry, viewEntries, viewLedger } from "./views/core.js";
import { viewBalance, viewIncome, viewSheet, viewThirds } from "./views/reports.js";
import { viewAssistant, viewSettings } from "./views/assistant.js";
import { viewTools, viewCalculator } from "./views/ops.js";
import { viewFinancial } from "./views/financial.js";
import { viewBilling } from "./billing.js";
import { viewStock } from "./stock.js";
import { initWorkHistory, canAccessWorkHistory, viewActivityHistory, viewMyWork } from "./work-history.js";
import { syncCloudIfReady, getCurrentCompanyRole } from "./cloud-sync.js";

let currentCompanyRole = null;

async function refreshCompanyRole() {
  const companyId = localStorage.getItem("mizane_active_company_v1");
  if (!companyId) { currentCompanyRole = null; return; }
  try {
    currentCompanyRole = await getCurrentCompanyRole();
    if (!["admin", "accountant", "reader"].includes(currentCompanyRole)) currentCompanyRole = "reader";
  } catch (error) {
    console.warn("Vérification du rôle MIZANE impossible :", error?.message || error);
    currentCompanyRole = "reader";
  }
}

const isReader = () => currentCompanyRole === "reader";
const readerRestrictedRoutes = ["entry", "tools", "financial", "billing", "stock"];

const NAV = [
  ["dashboard", "Tableau de bord"],
  ["entry", "Saisie"],
  ["entries", "Écritures"],
  ["ledger", "Grand livre"],
  ["balance", "Balance"],
  ["income", "Résultat"],
  ["sheet", "Bilan"],
  ["thirds", "Tiers"],
  ["financial", "Pilotage"],
  ["billing", "Facturation"],
  ["stock", "Gestion de stock"],
  ["tools", "Outils"],
  ["calculator", "Calculatrice"],
  ["assistant", "Assistant IA"],
  ["settings", "Paramètres"],
];

const VIEWS = {
  dashboard: () => viewDashboard(isReader()), entry: viewEntry, entries: viewEntries, ledger: viewLedger,
  balance: viewBalance, income: viewIncome, sheet: viewSheet, thirds: () => viewThirds(isReader()),
  tools: viewTools, financial: viewFinancial, billing: viewBilling, stock: () => viewStock(isReader(), currentCompanyRole), calculator: viewCalculator,
  assistant: viewAssistant, settings: viewSettings,
  history: viewActivityHistory, "my-work": viewMyWork,
};

function renderWorkSidebar() {
  const sidebar = document.getElementById("work-sidebar");
  const workspace = document.querySelector(".workspace");
  const enabled = canAccessWorkHistory();
  if (!sidebar || !workspace) return;
  sidebar.hidden = !enabled;
  workspace.classList.toggle("has-work-sidebar", enabled);
  if (!enabled) { sidebar.innerHTML = ""; return; }
  sidebar.innerHTML = `
    <p class="work-sidebar-title">Espace de travail</p>
    <button type="button" data-route="history" class="${currentRoute === "history" ? "active" : ""}">Historique des actions</button>
    <button type="button" data-route="my-work" class="${currentRoute === "my-work" ? "active" : ""}">Mes travaux</button>`;
}

function renderNav() {
  const visibleNav = NAV.filter(([id]) => !isReader() || !readerRestrictedRoutes.includes(id));
  $nav.innerHTML = visibleNav.map(([id, label]) => `<button data-route="${id}" class="${id === currentRoute ? "active" : ""}">${label}</button>`).join("") + '<a class="account-nav-link" href="espace.html" aria-label="Ouvrir le compte utilisateur">Compte</a>';
}

function render() {
  renderWorkSidebar();
  setLang(store.settings.language);
  document.getElementById("company-tag").textContent =
    `${store.settings.companyName} · ${store.settings.country} · ${store.settings.currency}`;
  (VIEWS[currentRoute] || viewDashboard)();
  applyI18n([$nav, $app, $modalContent]);
  document.title = t("MIZANE — Comptabilité générale");
}

function go(route) {
  if (isReader() && readerRestrictedRoutes.includes(route)) {
    toast("Accès réservé à l’administrateur et au comptable.");
    route = "dashboard";
  }
  if (["history", "my-work"].includes(route) && !canAccessWorkHistory()) route = "dashboard";
  setRoute(route);
  location.hash = route;
  renderNav();
  render();
  window.scrollTo(0, 0);
}

router.go = go;
router.render = render;

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("mizane_theme", t);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
}

document.addEventListener("click", (e) => {
  if (e.target.closest("#theme-toggle")) {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }
});
applyTheme(localStorage.getItem("mizane_theme") ||
  (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

document.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]");
  if (!act) return;
  if (act.dataset.act === "go-entry") go("entry");
  if (act.dataset.act === "go-assistant") go("assistant");
  if (act.dataset.act === "demo") {
    demoData(store);
    saveNow();
    go("dashboard");
  }
});

$nav.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (btn) go(btn.dataset.route);
});

document.getElementById("work-sidebar")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (btn) go(btn.dataset.route);
});

async function start() {
  await refreshCompanyRole();
  const hash = location.hash.replace("#", "");
  const initialRoute = isReader() && readerRestrictedRoutes.includes(hash) ? "dashboard" : hash;
  setRoute(NAV.some(([id]) => id === initialRoute) ? initialRoute : "dashboard");
  initStore(loadStore(allAccounts("syscohada")));
  renderNav();
  render();
  const historyAccess = await initWorkHistory();
  if (historyAccess && ["history", "my-work"].includes(hash)) setRoute(hash);
  else if (!historyAccess && ["history", "my-work"].includes(hash)) setRoute("dashboard");
  renderNav();
  render();
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js"); } catch (_e) { /* PWA optionnel */ }
  }
  try {
    await syncCloudIfReady();
  } catch (error) {
    toast("Synchronisation cloud automatique impossible : " + (error?.message || "erreur inconnue"), 5000);
  }
}

// Si le portail SaaS met à jour le stockage local dans un autre onglet,
 // recharger l'état en mémoire avant toute nouvelle sauvegarde comptable.
window.addEventListener("storage", async (event) => {
  if (event.key === "mizane_active_company_v1") {
    await refreshCompanyRole();
    const allowed = await initWorkHistory();
    if (isReader() && readerRestrictedRoutes.includes(currentRoute)) setRoute("dashboard");
    if (!allowed && ["history", "my-work"].includes(currentRoute)) setRoute("dashboard");
    renderNav();
    render();
    return;
  }
  if (event.key !== "mizane_v1" || !event.newValue) return;
  try {
    initStore(loadStore(allAccounts("syscohada")));
    renderNav();
    render();
    toast("Comptabilité actualisée depuis un autre onglet.");
  } catch (error) {
    toast("Mise à jour cloud reçue, mais le rechargement local a échoué : " + (error?.message || "erreur inconnue"), 5000);
  }
});


window.addEventListener("mizane:billing-changed", () => {
  void syncCloudIfReady().catch(error => {
    toast("Synchronisation de la facturation impossible : " + (error?.message || "erreur inconnue"), 5500);
  });
});

window.addEventListener("mizane:cloud-synced", (event) => {
  if (!(Number(event.detail?.pulled) > 0)) return;
  try {
    initStore(loadStore(allAccounts("syscohada")));
    renderNav();
    render();
    toast("Données actualisées depuis le cloud.");
  } catch (error) {
    toast("Données cloud reçues, mais actualisation impossible : " + (error?.message || "erreur inconnue"), 5000);
  }
});

async function syncWhenActive() {
  if (document.visibilityState !== "visible") return;
  await refreshCompanyRole();
  if (isReader() && readerRestrictedRoutes.includes(currentRoute)) setRoute("dashboard");
  renderNav();
  render();
  try {
    await syncCloudIfReady();
  } catch (error) {
    toast("Synchronisation cloud automatique impossible : " + (error?.message || "erreur inconnue"), 5000);
  }
}
window.addEventListener("focus", syncWhenActive);
document.addEventListener("visibilitychange", syncWhenActive);

start();
