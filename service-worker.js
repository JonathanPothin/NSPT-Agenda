// service-worker.js

// Change la version à chaque mise à jour du site
const CACHE_NAME = "agenda-cache-v5"

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./supabase.js",
  "./manifest.json",
  "./favicon-32.png",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALL → pré-cache + skipWaiting pour éviter l’ancienne version
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // Nouveau SW prêt immédiatement
});

// ACTIVATE → supprime anciens caches + clients.claim()
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim(); // Le nouveau SW prend le contrôle
});

// FETCH
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Pour les NAVIGATIONS (icône sur l’écran d’accueil / refresh)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);

          // Mise à jour du cache en arrière-plan
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, networkResponse.clone());

          return networkResponse;
        } catch (e) {
          // Offline → fallback version cache
          const cached = await caches.match(req);
          return cached || caches.match("./index.html");
        }
      })()
    );
    return;
  }

  // Pour les autres requêtes (CSS/JS/img)
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});