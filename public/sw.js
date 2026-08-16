// This app is online-first. Do not keep an old published page in a service
// worker cache: users need the newest Lovable release when reopening the app.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  // A network-only navigation fetch prevents a phone's installed-web-app
  // shell from repeatedly reopening an old index.html after a publish.
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});
