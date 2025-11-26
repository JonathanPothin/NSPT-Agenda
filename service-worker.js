self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("agenda-cache-v1").then((cache) => {
      return cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./app.js",
        "./supabase.js",
        "./manifest.json",
        "./favicon-32X32.png",
        "./icon-192.png",
        "./icon-512.png"
      ]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
