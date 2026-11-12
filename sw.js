// MIZANE — Service worker : cache hors-ligne.
const CACHE = "mizane-v8";
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
  "js/countries.js",
  "js/db.js",
  "js/invoice.js",
  "js/print.js",
  "js/plans.js",
  "js/plans/syscohada.js",
  "js/plans/pcg.js",
  "js/plans/nct.js",
  "js/plans/cgnc.js",
  "js/views/core.js",
  "js/views/ops.js",
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
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
