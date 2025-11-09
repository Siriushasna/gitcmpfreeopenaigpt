const CACHE = "gitmcp-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icons/favicon.svg"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e)=>{
  const url = new URL(e.request.url);
  // Cache-first pour nos assets, network-first sinon
  if (ASSETS.some(a => url.pathname.endsWith(a.replace("./","/")))) {
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  } else {
    e.respondWith(
      fetch(e.request).catch(()=>caches.match(e.request))
    );
  }
});
