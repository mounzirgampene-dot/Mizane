// MIZANE — Service worker : cache hors-ligne.
const CACHE = "mizane-v110";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/state.js",
  "js/accounting.js",
  "js/accounting-controls.js",
  "js/third-party-reconciliation.js",
  "js/bank-statement-import.js",
  "js/bank-reconciliation-advanced.js",
  "js/ai.js",
  "js/ai-documents.js",
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

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Les navigations HTML passent d'abord par le réseau pour éviter
  // qu'un ancien cache ne bloque le retour depuis l'espace professionnel.
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const response = await fetch(e.request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(e.request, response.clone());
        }
        return response;
      } catch (_error) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        const home = await caches.match(new URL("/index.html", self.location.origin).href);
        if (home) return home;
        return new Response("MIZANE est temporairement indisponible hors connexion.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  e.respondWith(caches.match(e.request).then((cached) => {
    const fetchPromise = fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => cached || new Response("Ressource temporairement indisponible.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }));
    return cached || fetchPromise;
  }));
});
