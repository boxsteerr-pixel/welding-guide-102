const CACHE_NAME = "welding-guide-102-v25";
const CACHE_PREFIX = "welding-guide-102-";
const APP_ROOT = new URL("./", self.location.href);
const CORE_ASSETS = [
  "./css/mobile-header.css?v=2",
  "./js/system-time.js?v=1",
  "./",
  "./index.html",
  "./css/home-link.css?v=5",
  "./css/style.css",
  "./css/style.css?v=15",
  "./js/app.js",
  "./js/app.js?v=21",
  "./js/update-state.js?v=2",
  "./data/manual.json",
  "./manifest.json",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
].map(function (path) { return new URL(path, APP_ROOT).toString(); });

function isCacheable(response) {
  return response && response.ok && response.type !== "opaque";
}

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(CORE_ASSETS); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const current = await caches.open(CACHE_NAME);
    const names = (await caches.keys()).filter(function (name) {
      return name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME;
    });
    for (const name of names) {
      const previous = await caches.open(name);
      let copied = true;
      for (const request of await previous.keys()) {
        if (request.destination !== "image" || await current.match(request)) continue;
        const response = await previous.match(request);
        if (response) {
          try { await current.put(request, response); }
          catch (error) { copied = false; }
        }
      }
      if (copied) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await (await caches.open(CACHE_NAME)).match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return (await caches.open(CACHE_NAME)).match(new URL("./index.html", APP_ROOT).toString());
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await (await caches.open(CACHE_NAME)).match(request);
  if (cached) return cached;
  for (const name of await caches.keys()) {
    if (!name.startsWith(CACHE_PREFIX) || name === CACHE_NAME) continue;
    const previous = await (await caches.open(name)).match(request);
    if (previous) return previous;
  }
  const response = await fetch(request);
  if (isCacheable(response)) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch (error) {
      // A full cache must not prevent an online image from displaying.
    }
  }
  return response;
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return;
  if (request.mode === "navigate" || ["document", "script", "style", "manifest"].includes(request.destination) || url.pathname.endsWith("/data/manual.json")) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (["image", "font", "video", "audio"].includes(request.destination)) event.respondWith(cacheFirst(request));
});
