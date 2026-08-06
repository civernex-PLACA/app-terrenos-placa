// ==========================================
// SERVICE WORKER - PWA OFFLINE CATCHING
// ==========================================

// 🟢 Subimos la versión para forzar que todos los clientes renueven la caché
// con la nueva estrategia (importante: cambiar este número cada vez que se
// modifique este archivo, para que el navegador descarte la caché vieja).
const CACHE_NAME = 'terrenos-app-v7';

// Archivos críticos que la app necesita para arrancar sin internet.
// 🟢 Se agregó capasDrive.js, que faltaba en la lista original.
// Nota: no hace falta escribir "?v=4" acá — el fetch handler de abajo
// ignora el query string al buscar en caché, así que esta lista y los
// <script src="js/app.js?v=4"> del index.html no necesitan coincidir.
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
  './js/GeoJson.js',
  './js/capasDrive.js',
  './js/overlayCatastro.js',
  './js/capasCalles.js',
  './js/poligonos.js',
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

  // Solo nos interesa cachear peticiones GET (evita romper POST/PUT a Sheets/Drive)
  if (evento.request.method !== 'GET') return;

  // Ignoramos las llamadas a APIs externas para que siempre intenten ir a la red
  if (url.includes('googleapis.com') || url.includes('nominatim.openstreetmap.org')) {
    return;
  }

  const esArchivoPropio = url.startsWith(self.location.origin);
  // 🟢 Las capas GeoJSON de catastro (capas/*.geojson) también se guardan
  // en caché apenas se descargan una vez, así funcionan sin internet después.
  const esCapaLocal = url.includes('/capas/') && url.endsWith('.geojson');

  // Estrategia "Network First, falling back to cache" (Prioridad Red, respaldo Caché)
  evento.respondWith(
    fetch(evento.request)
      .then((respuestaRed) => {
        // 🟢 Cacheo dinámico: si la respuesta es válida y es un archivo propio
        // o una capa local, la guardamos para la próxima vez que falte internet.
        if (respuestaRed && respuestaRed.ok && (esArchivoPropio || esCapaLocal)) {
          const copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        }
        return respuestaRed;
      })
      .catch(() => {
        // 🟢 ignoreSearch:true = ignora "?v=4" y similares al buscar en caché,
        // así los scripts versionados en index.html sí se encuentran offline.
        return caches.match(evento.request, { ignoreSearch: true });
      })
  );
});