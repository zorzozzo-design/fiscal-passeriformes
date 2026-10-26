const CACHE = 'fp-v35';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'parser.js', 'normas.js', 'docs.js', 'graficos.js', 'abordagens.js', 'style.css', 'manifest.webmanifest',
  'vendor/xlsx.mini.min.js', 'vendor/chart.umd.js', 'vendor/cytoscape.min.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Rede primeiro, revalidando com o servidor (cache:'no-cache') para não pegar a cópia antiga
  // que o GitHub Pages deixa no cache do navegador por alguns minutos. Sem internet, usa o cache do SW.
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
