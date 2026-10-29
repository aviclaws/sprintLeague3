// Offline cache so the app works in a gym with bad wifi. Bump VERSION when files change.
var VERSION = "sl3-v2";
var FILES = ["./", "index.html", "coach.html", "style.css", "config.js", "core.js", "app.js", "view.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
// network-first (so updates show up), fall back to cache when offline
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return; // live feed (ntfy.sh) must not be cached
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
