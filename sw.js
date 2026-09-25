const CACHE = "mallet-sr-v4";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app.css",
  "./app.js",
  "./audio.js",
  "./generator.js",
  "./renderer.js",
  "./theory.js",
  "./abcjs.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
