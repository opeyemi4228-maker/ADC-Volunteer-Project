/*
 * Service worker for field agent mode only (scope /workspace/agent). It
 * keeps the registration page, its scripts and the geography files on the
 * device so agents can register people with no signal. Nothing else on the
 * site is cached by it.
 */
const CACHE = "adc-agent-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/workspace/agent"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const staticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/geo/") || url.pathname.startsWith("/brand/");
  if (staticAsset) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(e.request)) ?? fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
  } else if (e.request.mode === "navigate" && url.pathname.startsWith("/workspace/agent")) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r ?? caches.match("/workspace/agent"))));
  }
});
