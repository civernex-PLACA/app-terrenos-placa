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
    
    const r = 6378137; 
    const clickX = lng * Math.PI / 180 * r;
    const clickY = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
    const puntoClick = [clickX, clickY];

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

      if (anillos.length > 0 && this.puntoEnPoligono(puntoClick, anillos)) {
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

    for (const parcela of capaDetallada.features) {
      const geom = parcela.geometry;
      if (!geom) continue;

      let anillos = [];
      if (geom.type === 'MultiPolygon') {
        anillos = geom.coordinates[0][0];
      } else if (geom.type === 'Polygon') {
        anillos = geom.coordinates[0];
      }

      if (anillos.length > 0 && this.puntoEnPoligono(puntoClick, anillos)) {
        const tFin = performance.now();
        const props = parcela.properties || {};

        console.log(`🚀 [GIS Local] PASO 2 ÉXITO en ${(tFin - tInicio).toFixed(2)} ms!`);
        console.log(`📌 IDGIS: ${props.IDGIS} | Distrito: ${props.DISTRITO}`);

        const geoJsonGPS = this.convertirMultiPoligonoGPS(parcela.geometry);

        return {
          idGis: props.IDGIS || "",
          distrito: props.DISTRITO || props.DISTRITO_1 || "",
          seccion: props.SECCCION || props.SECCION || seccionEncontrada || "",
          chacra: props.CHACRA || "",
          manzana: props.MANZANA || "",
          parcela: props.PARCELA || "",
          geoJson: geoJsonGPS
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