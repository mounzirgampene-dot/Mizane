// MIZANE — État global de l'application et helpers partagés.
import { newStore, buildAccountCache } from "./accounting.js";
import { allAccounts } from "./plans.js";
import { formatMoney } from "./countries.js";

export let store = null;
export let planAccounts = [];
export let currentRoute = "dashboard";
export const aiHistory = [];
export let draftLines = [
  { account: "", label: "", debit: "", credit: "" },
  { account: "", label: "", debit: "", credit: "" },
];

export const $app = document.getElementById("app");
export const $nav = document.getElementById("main-nav");
export const $modal = document.getElementById("modal");
export const $modalContent = document.getElementById("modal-content");
export const $toast = document.getElementById("toast");

export const router = { go: () => {}, render: () => {} };

export function setRoute(route) { currentRoute = route; }
export function getDraftLines() { return draftLines; }
export function setDraftLines(lines) { draftLines = lines; }

export function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => $toast.classList.add("hidden"), ms);
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function money(n) { return formatMoney(n, store.settings.currency, store.settings.locale); }

export function refreshPlan() {
  planAccounts = allAccounts(store.settings.plan);
  buildAccountCache(store, planAccounts);
}

export function initStore(data) {
  store = data || newStore();
  if (!store.settings.aiEndpoint) store.settings.aiEndpoint = "https://api.mistral.ai/v1/chat/completions";
  if (!store.settings.language) store.settings.language = "fr";
  refreshPlan();
  saveNow();
}

export function saveNow() {
  const { __planAccounts, __accountCache, ...clean } = store;
  localStorage.setItem("mizane_v1", JSON.stringify(clean));
}

export function planLabel(code) {
  const a = planAccounts.find((x) => x.code === String(code)) || store.settings.customAccounts.find((x) => x.code === String(code));
  return a ? a.label : "";
}

export function openModal(html) {
  $modalContent.innerHTML = html;
  $modal.showModal();
  $modalContent.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
}

export function closeModal() { $modal.close(); }
