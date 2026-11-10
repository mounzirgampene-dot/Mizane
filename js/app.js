// MIZANE — Contrôleur principal : navigation, routage, démarrage PWA.
import { allAccounts } from "./plans.js";
import { loadStore, demoData } from "./db.js";
import { store, $nav, $app, router, setRoute, currentRoute, initStore, saveNow } from "./state.js";
import { viewDashboard, viewEntry, viewEntries, viewLedger } from "./views/core.js";
import { viewBalance, viewIncome, viewSheet, viewThirds } from "./views/reports.js";
import { viewAssistant, viewSettings } from "./views/assistant.js";

const NAV = [
  ["dashboard", "Tableau de bord"],
  ["entry", "Saisie"],
  ["entries", "Écritures"],
  ["ledger", "Grand livre"],
  ["balance", "Balance"],
  ["income", "Résultat"],
  ["sheet", "Bilan"],
  ["thirds", "Tiers"],
  ["assistant", "Assistant IA"],
  ["settings", "Paramètres"],
];

const VIEWS = {
  dashboard: viewDashboard, entry: viewEntry, entries: viewEntries, ledger: viewLedger,
  balance: viewBalance, income: viewIncome, sheet: viewSheet, thirds: viewThirds,
  assistant: viewAssistant, settings: viewSettings,
};

function renderNav() {
  $nav.innerHTML = NAV.map(([id, label]) => `<button data-route="${id}" class="${id === currentRoute ? "active" : ""}">${label}</button>`).join("");
}

function render() {
  document.getElementById("company-tag").textContent =
    `${store.settings.companyName} · ${store.settings.country} · ${store.settings.currency}`;
  (VIEWS[currentRoute] || viewDashboard)();
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
    try { await navigator.serviceWorker.register("sw.js"); } catch (e) { /* PWA optionnel */ }
  }
}

start();
