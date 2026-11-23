// MIZANE — Service worker : cache hors-ligne.
const CACHE = "mizane-v34";
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/state.js",
  "js/accounting.js",
  "js/ai.js",
  "js/crypto.js",
  "js/finance.js",
  "js/periods.js",
  "js/cloud-sync.js",
  "js/billing-sync.js",
  "js/billing.js",
  "js/billing-core.js",
  "js/billing-accounting.js",
  "js/countries.js",
  "js/i18n.js",
  "js/db.js",
  "js/accounting-sync.js",
  "js/notifications.js",
  "js/invoice.js",
  "js/print.js",
  "js/plans.js",
  "js/plans/syscohada.js",
  "js/plans/pcg.js",
  "js/plans/nct.js",
  "js/plans/cgnc.js",
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
