// MIZANE — Contrôleur principal : navigation, routage, démarrage PWA.
import { allAccounts } from "./plans.js";
import { loadStore, demoData } from "./db.js";
import { store, $nav, $app, $modalContent, router, setRoute, currentRoute, initStore, saveNow } from "./state.js";
import { setLang, applyI18n, t } from "./i18n.js";
import { viewDashboard, viewEntry, viewEntries, viewLedger } from "./views/core.js";
import { viewBalance, viewIncome, viewSheet, viewThirds } from "./views/reports.js";
import { viewAssistant, viewSettings } from "./views/assistant.js";
import { viewTools } from "./views/ops.js";

const NAV = [
  ["dashboard", "Tableau de bord"],
  ["entry", "Saisie"],
  ["entries", "Écritures"],
  ["ledger", "Grand livre"],
  ["balance", "Balance"],
  ["income", "Résultat"],
  ["sheet", "Bilan"],
  ["thirds", "Tiers"],
  ["tools", "Outils"],
  ["assistant", "Assistant IA"],
  ["settings", "Paramètres"],
];

const VIEWS = {
  dashboard: viewDashboard, entry: viewEntry, entries: viewEntries, ledger: viewLedger,
  balance: viewBalance, income: viewIncome, sheet: viewSheet, thirds: viewThirds,
  tools: viewTools, assistant: viewAssistant, settings: viewSettings,
};

function renderNav() {
  $nav.innerHTML = NAV.map(([id, label]) => `<button data-route="${id}" class="${id === currentRoute ? "active" : ""}">${label}</button>`).join("");
}

function render() {
  setLang(store.settings.language);
  document.getElementById("company-tag").textContent =
    `${store.settings.companyName} · ${store.settings.country} · ${store.settings.currency}`;
  (VIEWS[currentRoute] || viewDashboard)();
  applyI18n([$nav, $app, $modalContent]);
  document.title = t("MIZANE — Comptabilité générale");
}

function go(route) {
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

async function start() {
  const hash = location.hash.replace("#", "");
  setRoute(NAV.some(([id]) => id === hash) ? hash : "dashboard");
  initStore(loadStore(allAccounts("syscohada")));
  renderNav();
  render();
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("sw.js"); } catch (_e) { /* PWA optionnel */ }
  }
}

start();
