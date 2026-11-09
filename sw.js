/* ==========================================================================
   KLUG Sound — service worker
   Static shell caching for GitHub Pages. Audio streams, API calls and
   cross-origin artwork are intentionally left to the browser/network.
   ========================================================================== */

const VERSION = "klug-sound-v2";
const SHELL = [
  "./",
  "./index.html",
  "./player.html",
  "./404.html",
  "./manifest.webmanifest",
  "./css/fonts.css",
  "./css/base.css",
  "./css/landing.css",
  "./css/player.css",
  "./js/landing.js",
  "./js/app.js",
  "./js/api.js",
  "./js/icons.js",
  "./js/store.js",
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/og.png",
  "./assets/fonts/manrope-cyrillic.woff2",
  "./assets/fonts/manrope-cyrillic-ext.woff2",
  "./assets/fonts/manrope-latin.woff2",
  "./assets/fonts/manrope-latin-ext.woff2",
  "./assets/fonts/unbounded-cyrillic.woff2",
  "./assets/fonts/unbounded-cyrillic-ext.woff2",
  "./assets/fonts/unbounded-latin.woff2",
  "./assets/fonts/unbounded-latin-ext.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
