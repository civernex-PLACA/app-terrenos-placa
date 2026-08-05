// ==========================================
// MÓDULO: INTEGRACIÓN LOCAL GIS (POSADAS / MAPAMUNI)
// ==========================================

window.CatastroGIS = {
  capaSeccionesMaestra: null,

  puntoEnPoligono: function(punto, vs) {
    const x = punto[0], y = punto[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  mercatorToLatLng: function(x, y) {
    const rMajor = 6378137;
    const lng = (x / rMajor) * (180 / Math.PI);
    const latRad = Math.atan(Math.exp(y / rMajor));
    const lat = (2 * latRad - Math.PI / 2) * (180 / Math.PI);
    return [lng, lat];
  },

  // 🟢 Inversa de mercatorToLatLng — usada por el overlay de parcelas para
  // convertir las esquinas del viewport del mapa a Mercator, y así poder
  // comparar contra las coordenadas de las capas (que ya vienen en
  // Mercator) sin tener que convertir cada parcela candidata.
  latLngToMercator: function(lat, lng) {
    const r = 6378137;
    const x = lng * Math.PI / 180 * r;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
    return [x, y];
  },

  // 🟢 Rectángulo (bounding box) en Mercator de una geometría GeoJSON.
  // Sirve para saber rápido si una parcela "puede" estar en el viewport,
  // sin tener que revisar punto por punto.
  calcularBBoxMercator: function(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const recorrer = (coords) => {
      if (typeof coords[0] === 'number') {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach(recorrer);
      }
    };
    recorrer(geometry.coordinates);

    return { minX, minY, maxX, maxY };
  },

  // 🟢 Calcula el bbox de una feature UNA sola vez y lo guarda en la
  // misma feature (caché simple) para no recalcularlo en cada movimiento
  // de mapa mientras el overlay de parcelas está activo.
  obtenerBBoxCacheado: function(feature) {
    if (!feature || !feature.geometry) return null;
    if (!feature._bboxMercatorCache) {
      feature._bboxMercatorCache = this.calcularBBoxMercator(feature.geometry);
    }
    return feature._bboxMercatorCache;
  },

  bboxIntersecta: function(a, b) {
    if (!a || !b) return false;
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  },

  convertirMultiPoligonoGPS: function(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    
    const coordenadasGPS = geometry.coordinates.map(poligono => {
      return poligono.map(anillo => {
        return anillo.map(puntoMercator => {
          return this.mercatorToLatLng(puntoMercator[0], puntoMercator[1]);
        });
      });
    });

    return {
      type: geometry.type,
      coordinates: coordenadasGPS
    };
  },

  // 🟢 CARGA DIRECTA DE capas/secciones.geojson SIN FALLBACKS
  cargarSeccionesDelRepo: async function() {
    if (this.capaSeccionesMaestra) return this.capaSeccionesMaestra;

    try {
      console.log("⚡ [GIS Local] Cargando mapa de secciones desde capas/secciones.geojson...");
      const res = await fetch('capas/secciones.geojson');

      if (res.ok) {
        this.capaSeccionesMaestra = await res.json();
        console.log(`✅ [GIS Local] ¡Capa maestra cargada desde el repo! (${this.capaSeccionesMaestra.features?.length || 0} secciones).`);
        return this.capaSeccionesMaestra;
      } else {
        console.error("❌ [GIS Local] No se encontró el archivo en /capas/secciones.geojson (HTTP Error " + res.status + ")");
      }
    } catch (e) {
      console.error("❌ [GIS Local] Error leyendo el archivo local de secciones:", e);
    }
    return null;
  },

  obtenerDatosPorCoordenada: async function(lat, lng) {
    console.log(`\n-----------------------------------------`);
    console.log(`[GIS Local] 🎯 Búsqueda para Lat: ${lat}, Lng: ${lng}`);

    const capaSecciones = await this.cargarSeccionesDelRepo();
    if (!capaSecciones || !capaSecciones.features) {
      console.error(`[GIS Local] ❌ La capa maestra de secciones no está disponible.`);
      return null;
    }

    const tInicio = performance.now();

    // 🟢 capas/secciones.geojson (capa MAESTRA, solo para saber en qué
    // sección cayó el clic) sigue viniendo en Mercator — no forma parte
    // de la migración a capas enriquecidas (ver CLAUDE.md, aclaración de
    // alcance). Por eso este punto de clic sigue necesitando Mercator.
    const puntoClickMercator = this.latLngToMercator(lat, lng);

    // ----------------------------------------------------
    // PASO 1: Detectar Sección usando "Text"
    // ----------------------------------------------------
    let seccionEncontrada = null;

    for (const feature of capaSecciones.features) {
      const geom = feature.geometry;
      if (!geom) continue;

      let anillos = [];
      if (geom.type === 'MultiPolygon') {
        anillos = geom.coordinates[0][0];
      } else if (geom.type === 'Polygon') {
        anillos = geom.coordinates[0];
      }

      if (anillos.length > 0 && this.puntoEnPoligono(puntoClickMercator, anillos)) {
        const props = feature.properties || {};
        seccionEncontrada = props.Text || props.SECCCION || props.SECCION || props.seccion;
        break;
      }
    }

    if (!seccionEncontrada) {
      console.warn(`[GIS Local] ⚠️ El punto tocado no cae dentro de ninguna sección conocida.`);
      return null;
    }

    // 🟢 NOMENCLATURA DIRECTA DE 2 DÍGITOS: "01" -> "seccion01", "26" -> "seccion26"
    const numLimpio = parseInt(seccionEncontrada, 10).toString().padStart(2, '0');
    const claveSeccion = `seccion${numLimpio}`;

    console.log(`⚡ [GIS Local] PASO 1 ÉXITO: Clic en '${claveSeccion}'`);

    // ----------------------------------------------------
    // PASO 2: Buscar Parcela en RAM (Cargada previamente desde Drive)
    // ----------------------------------------------------
    if (!window.CapasDrive || !window.CapasDrive.capasCargadas) {
      console.warn(`[GIS Local] ⚠️ CapasDrive no está cargado en memoria.`);
      return null;
    }

    const capaDetallada = window.CapasDrive.capasCargadas[claveSeccion];

    if (!capaDetallada || !capaDetallada.features) {
      console.warn(`[GIS Local] ⚠️ La capa '${claveSeccion}' no ha sido cargada desde Drive aún.`);
      return null;
    }

    // 🟢 Capa enriquecida (Catastro + Ordenamiento, ver CLAUDE.md "Diseño
    // del motor renovado") — a diferencia de secciones.geojson de arriba,
    // esta YA viene en lat/lng (el backend hace la conversión Gauss-
    // Krüger una sola vez, al sincronizar). Por eso el punto de clic acá
    // es directo [lng, lat], sin pasar por Mercator, y la geometría
    // encontrada tampoco necesita convertirMultiPoligonoGPS.
    const puntoClickLatLng = [lng, lat];

    for (const parcela of capaDetallada.features) {
      const geom = parcela.geometry;
      if (!geom) continue;

      let anillos = [];
      if (geom.type === 'MultiPolygon') {
        anillos = geom.coordinates[0][0];
      } else if (geom.type === 'Polygon') {
        anillos = geom.coordinates[0];
      }

      if (anillos.length > 0 && this.puntoEnPoligono(puntoClickLatLng, anillos)) {
        const tFin = performance.now();
        const props = parcela.properties || {};

        console.log(`🚀 [GIS Local] PASO 2 ÉXITO en ${(tFin - tInicio).toFixed(2)} ms!`);
        console.log(`📌 cca/IDGIS: ${props.cca} | Distrito: ${props.DISTRITO}`);

        return {
          idGis: props.cca || "",
          distrito: props.DISTRITO || "",
          seccion: props.SECCCION || seccionEncontrada || "",
          chacra: props.CHACRA || "",
          manzana: props.MANZANA || "",
          parcela: props.PARCELA || "",
          geoJson: parcela.geometry
        };
      }
    }

    console.warn(`[GIS Local] ⚠️ Clic en ${claveSeccion}, pero fuera de parcelas.`);
    return null;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.CatastroGIS) {
    window.CatastroGIS.cargarSeccionesDelRepo();
  }
});