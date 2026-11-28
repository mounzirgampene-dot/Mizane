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
import { viewBudget } from "./budget.js";
import { viewAnalytical } from "./analytical.js";
import { viewBilling } from "./billing.js";
import { viewStock } from "./stock.js";
import { viewPurchases } from "./purchases.js";
import { viewCommercialMargins } from "./commercial-margins.js";
import { viewCustomerFollowups } from "./customer-followups.js";
import { viewTax } from "./tax.js";
import { initWorkHistory, canAccessWorkHistory, viewActivityHistory, viewMyWork } from "./work-history.js";
import { syncCloudIfReady, getCurrentCompanyRole } from "./cloud-sync.js";
import { getCompanyStorageStatus } from "./company-storage.js";
import { initNotifications, getUnreadNotificationCount, notifySyncFailure, refreshUnreadCount, viewNotifications } from "./notifications.js";
import { initBoussole, setBoussoleContext } from "./boussole.js";
import { initAcademy } from "./academy.js";
import { initBoussoleEditor } from "./boussole-editor.js";

let currentCompanyRole = null;

async function refreshCompanyRole() {
  const companyId = localStorage.getItem("mizane_active_company_v1");
  if (!companyId) { currentCompanyRole = null; return true; }
  try {
    currentCompanyRole = await getCurrentCompanyRole();
    return ["admin", "accountant", "reader"].includes(currentCompanyRole);
  } catch (error) {
    console.warn("Vérification du rôle MIZANE impossible :", error?.message || error);
    currentCompanyRole = null;
    return false;
  }
}

const isReader = () => currentCompanyRole === "reader";
const readerRestrictedRoutes = ["entry", "tools", "financial", "billing", "stock", "purchases", "commercial-margins", "customer-followups", "budget", "analytical", "tax", "notifications"];

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
  ["customer-followups", "Relances clients"],
  ["stock", "Gestion de stock"],
  ["purchases", "Achats"],
  ["commercial-margins", "Marges commerciales"],
  ["budget", "Budget et écarts"],
  ["analytical", "Comptabilité analytique"],
  ["tax", "Fiscalité"],
  ["tools", "Outils"],
  ["calculator", "Calculatrice"],
  ["assistant", "Assistant IA"],
  ["notifications", "Notifications"],
  ["settings", "Paramètres"],
];

const VIEWS = {
  dashboard: () => viewDashboard(isReader()), entry: viewEntry, entries: () => viewEntries(isReader()), ledger: viewLedger,
  balance: viewBalance, income: viewIncome, sheet: viewSheet, thirds: () => viewThirds(isReader()),
  tools: viewTools, financial: viewFinancial, billing: viewBilling, stock: () => viewStock(isReader(), currentCompanyRole), purchases: () => viewPurchases(isReader(), currentCompanyRole), "commercial-margins": viewCommercialMargins, "customer-followups": viewCustomerFollowups, budget: viewBudget, analytical: viewAnalytical, tax: viewTax, calculator: viewCalculator,
  assistant: viewAssistant, settings: viewSettings,
  history: viewActivityHistory, "my-work": viewMyWork, notifications: viewNotifications,
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
  $nav.innerHTML = visibleNav.map(([id, label]) => {
    const count = id === "notifications" ? getUnreadNotificationCount() : 0;
    return `<button data-route="${id}" class="${id === currentRoute ? "active" : ""}">${label}${count ? ` <span class="nav-notification-count">${count > 99 ? "99+" : count}</span>` : ""}</button>`;
  }).join("") + '<a class="account-nav-link" href="espace.html" aria-label="Ouvrir le compte utilisateur">Compte</a>';
}

function render() {
  renderWorkSidebar();
  setLang(store.settings.language);
  setBoussoleContext(currentRoute);
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

async function handleSyncError(error, label) {
  try { await notifySyncFailure(error); }
  catch (notificationError) { console.warn("Création de la notification impossible :", notificationError?.message || notificationError); }
  toast(label + (error?.message || "erreur inconnue"), 5500);
}

window.addEventListener("mizane:notifications-changed", renderNav);

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

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chart-toggle]");
  if (!button) return;
  const card = button.closest(".financial-chart");
  const visual = card?.querySelector(".chart-visual");
  if (!visual) return;
  visual.hidden = !visual.hidden;
  const expanded = !visual.hidden;
  button.setAttribute("aria-expanded", String(expanded));
  button.textContent = expanded ? "Masquer les graphiques" : "Afficher les graphiques";
});

$app.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (btn) go(btn.dataset.route);
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
  const roleVerified = await refreshCompanyRole();
  const activeCompanyId = localStorage.getItem("mizane_active_company_v1");
  const storageStatus = getCompanyStorageStatus();
  if (storageStatus.reason === "session-locked" || (activeCompanyId && (!roleVerified || !storageStatus.ok))) {
    $nav.innerHTML = "";
    document.getElementById("work-sidebar").hidden = true;
    document.getElementById("company-tag").textContent = "Espace professionnel";
    const locked = storageStatus.reason === "session-locked";
    $app.innerHTML = `<section class="panel"><p class="eyebrow">Protection des données</p><h1>${locked ? "Comptabilité locale verrouillée" : "Vérification de l’espace nécessaire"}</h1><p>${locked ? "Vous avez été déconnecté. Les données comptables restent conservées sur cet appareil, mais leur accès est verrouillé jusqu’à une nouvelle connexion avec le compte autorisé et la vérification de l’entreprise associée." : "Les données locales de cet appareil ne sont pas encore associées de manière vérifiée à l’entreprise sélectionnée, ou votre appartenance n’a pas pu être confirmée. Pour éviter qu’une comptabilité d’une autre entreprise soit affichée ou synchronisée, MIZANE a bloqué temporairement cet espace sur cet appareil."}</p><p>Ouvrez l’espace professionnel et reconnectez-vous avec le compte autorisé. Aucune donnée locale ne sera supprimée.</p><div class="actions"><a class="button" href="espace.html">Ouvrir l’espace professionnel</a><a class="button secondary" href="index.html">Réessayer</a></div></section>`;
    return;
  }
  const hash = location.hash.replace("#", "");
  const initialRoute = isReader() && readerRestrictedRoutes.includes(hash) ? "dashboard" : hash;
  setRoute(NAV.some(([id]) => id === initialRoute) ? initialRoute : "dashboard");
  initStore(loadStore(allAccounts("syscohada")));
  renderNav();
  render();
  initBoussole();
  initAcademy();
  void initBoussoleEditor();
  const historyAccess = await initWorkHistory();
  await initNotifications();
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
    await handleSyncError(error, "Synchronisation cloud automatique impossible : ");
  }
}

// Si le portail SaaS met à jour le stockage local dans un autre onglet,
 // recharger l'état en mémoire avant toute nouvelle sauvegarde comptable.
window.addEventListener("mizane:legacy-stock-loaded", (event) => {
  if (event.detail && typeof event.detail === "object") store.stock = event.detail;
  if (currentRoute === "stock") render();
});

window.addEventListener("storage", (event) => {
  if (["mizane_active_company_v1", "mizane_active_user_v1", "mizane_local_company_binding_v1", "mizane_v1"].includes(event.key)) {
    // Un changement d'espace ou de magasin impose une nouvelle vérification avant affichage.
    location.reload();
  }
});


window.addEventListener("mizane:billing-changed", () => {
  void syncCloudIfReady().catch(error => {
    void handleSyncError(error, "Synchronisation de la facturation impossible : ");
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
  const roleVerified = await refreshCompanyRole();
  if (localStorage.getItem("mizane_active_company_v1") && !roleVerified) {
    location.reload();
    return;
  }
  try { await refreshUnreadCount(); } catch (error) { console.warn("Actualisation des notifications impossible :", error?.message || error); }
  if (isReader() && readerRestrictedRoutes.includes(currentRoute)) setRoute("dashboard");
  renderNav();
  render();
  try {
    await syncCloudIfReady();
  } catch (error) {
    await handleSyncError(error, "Synchronisation cloud automatique impossible : ");
  }
}
window.addEventListener("focus", syncWhenActive);
document.addEventListener("visibilitychange", syncWhenActive);

start();
