// ==========================================
// SERVICE WORKER - PWA OFFLINE CATCHING
// ==========================================

const CACHE_NAME = 'terrenos-app-v1';

// Archivos críticos que la app necesita para arrancar sin internet
const ARCHIVOS_ESTATICOS = [
  './',
  './index.html',
  './manifest.json',
  './css/estilos.css', // O estilos-v2.css si estás usando la versión optimizada
  './js/app.js',
  './js/api.js',
  './js/auth.js',
  './js/dev.js',
  './js/editor.js',
  './js/formulario.js',
  './js/fotos.js',
  './js/geocoding.js',
  './js/iconos.js',
  './js/mapa.js',
  './js/presencia.js',
  './js/tags.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 1. INSTALACIÓN: Guardar todo en la caché
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 [Service Worker] Cacheando archivos estáticos...');
      return cache.addAll(ARCHIVOS_ESTATICOS);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVACIÓN: Limpiar cachés viejas si cambiamos la versión
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) => {
      return Promise.all(
        claves.map((clave) => {
          if (clave !== CACHE_NAME) {
            console.log('🧹 [Service Worker] Borrando caché antigua:', clave);
            return caches.delete(clave);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. INTERCEPCIÓN DE RED (Fetch): Servir desde caché si no hay internet
self.addEventListener('fetch', (evento) => {
  const url = evento.request.url;

  // Ignoramos las llamadas a APIs externas para que siempre intenten ir a la red
  if (url.includes('googleapis.com') || url.includes('nominatim.openstreetmap.org')) {
    return;
  }

  // Estrategia "Network First, falling back to cache" (Prioridad Red, respaldo Caché)
  evento.respondWith(
    fetch(evento.request).catch(() => {
      return caches.match(evento.request);
    })
  );
});