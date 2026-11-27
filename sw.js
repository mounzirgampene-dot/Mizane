// MIZANE — Service worker : cache hors-ligne.
const CACHE = "mizane-v129";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/charts.js",
  "js/boussole.js",
  "js/boussole-cloud.js",
  "js/boussole-editor.js",
  "js/supabase-config.js",
  "js/boussole-search.js",
  "js/academy.js",
  "js/academy-en.js",
  "js/state.js",
  "js/accounting.js",
  "js/accounting-controls.js",
  "js/third-party-reconciliation.js",
  "js/bank-statement-import.js",
  "js/bank-reconciliation-advanced.js",
  "js/ai.js",
  "js/ai-documents.js",
  "js/accounting-documents.js",
  "js/accounting-documents-cloud.js",
  "js/document-vault-recovery.js",
  "js/crypto.js",
  "js/finance.js",
  "js/fixed-assets-core.js",
  "js/asset-disposals-core.js",
  "js/financial-forecast-core.js",
  "js/budget-core.js",
  "js/budget-outlook-core.js",
  "js/analytical-budget-core.js",
  "js/analytical-core.js",
  "js/analytical-advanced-core.js",
  "js/analytical.js",
  "js/receivables-core.js",
  "js/customer-followups-core.js",
  "js/customer-followups.js",
  "js/tax-core.js",
  "js/tax-compliance-core.js",
  "js/tax-documents-core.js",
  "js/tax-documents-store.js",
  "js/tax-documents-cloud.js",
  "js/foreign-tax-calculators.js",
  "js/african-tax-calculators.js",
  "js/regional-african-tax-calculators.js",
  "js/tax.js",
  "js/budget.js",
  "js/periods.js",
  "js/cloud-sync.js",
  "js/company-storage.js",
  "js/document-storage-scope.js",
  "js/billing-sync.js",
  "js/billing.js",
  "js/billing-core.js",
  "js/billing-accounting.js",
  "js/purchases.js",
  "js/purchase-delivery-tracking.js",
  "js/purchase-accounting.js",
  "js/purchase-tax.js",
  "js/purchase-credit-notes.js",
  "js/stock-accounting.js",
  "js/stock.js",
  "js/stock-replenishment.js",
  "js/purchase-receipts.js",
  "js/purchase-controls.js",
  "js/supplier-payables.js",
  "js/commercial-margin-core.js",
  "js/commercial-performance-core.js",
  "js/strategic-dashboard-core.js",
  "js/commercial-margins.js",
  "js/purchase-validation.js",
  "js/countries.js",
  "js/i18n.js",
  "js/db.js",
  "js/accounting-sync.js",
  "js/notifications.js",
  "js/invoice.js",
  "js/print.js",
  "js/plans.js",
  "js/plans/custom.js",
  "js/plans/mapping.js",
  "js/plans/migration.js",
  "js/plans/migration-audit.js",
  "js/plans/conversion-assistant.js",
  "js/plans/syscohada.js",
  "js/plans/pcg.js",
  "js/plans/nct.js",
  "js/plans/cgnc.js",
  "js/plans/templates.js",
  "js/plans/frameworks.js",
  "js/views/core.js",
  "js/views/ops.js",
  "js/views/financial.js",
  "js/views/reports.js",
  "js/views/assistant.js",
  "js/work-history.js",
  "manifest.webmanifest",
  "icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Seuls les fichiers statiques explicitement listés peuvent entrer dans le cache.
// Les routes inconnues et réponses applicatives/API restent toujours réseau uniquement.
const CACHEABLE_URLS = new Set(ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname));
const APP_SHELL_URLS = new Set([
  new URL("./", self.registration.scope).pathname,
  new URL("index.html", self.registration.scope).pathname,
]);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Le portail et les autres navigations ne sont jamais enregistrés en cache.
  // Seule l'application principale bénéficie du mode réseau d'abord / cache hors ligne.
  if (e.request.mode === "navigate") {
    if (!APP_SHELL_URLS.has(url.pathname)) return;
    e.respondWith((async () => {
      try {
        const response = await fetch(e.request);
        if (response.ok && !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
          const cache = await caches.open(CACHE);
          await cache.put(e.request, response.clone());
        }
        return response;
      } catch (_error) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        return new Response("MIZANE est momentanément hors ligne.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    })());
    return;
  }

  // Toute ressource non répertoriée est servie par le réseau sans mise en cache.
  if (!CACHEABLE_URLS.has(url.pathname)) return;

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    const response = await fetch(e.request);
    if (response.ok && !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
      const cache = await caches.open(CACHE);
      await cache.put(e.request, response.clone());
    }
    return response;
  })());
});
