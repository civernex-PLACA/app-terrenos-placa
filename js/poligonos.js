// ==========================================
// MÓDULO: GESTIÓN DE POLÍGONOS EN LEAFLET
// ==========================================

window.Poligonos = {
  mapaRef: null,
  capaFantasma: null,          // Parcela individual en edición/creación
  capaPermanentesGroup: null,  // Grupo de polígonos guardados de los terrenos
  capaSeccionesMap: null,      // Capa maestra de secciones de Posadas
  modoSeccionesActivo: false,

  init: function(mapa) {
    this.mapaRef = mapa;
    if (this.mapaRef && !this.capaPermanentesGroup) {
      this.capaPermanentesGroup = L.layerGroup().addTo(this.mapaRef);
    }
  },

  // ----------------------------------------------------
  // 1. DIBUJAR / LIMPIAR PARCELA FANTASMA INDIVIDUAL
  // ----------------------------------------------------
  dibujarFantasma: function(geoJsonGPS) {
    this.limpiarFantasma();
    if (!this.mapaRef || !geoJsonGPS) return;

    let objetoGeoJSON = geoJsonGPS;
    if (typeof geoJsonGPS === 'string') {
      try { objetoGeoJSON = JSON.parse(geoJsonGPS); } catch (e) { return; }
    }

    this.capaFantasma = L.geoJSON(objetoGeoJSON, {
      style: {
        color: '#ea4335',
        weight: 3,
        opacity: 0.9,
        fillColor: '#ea4335',
        fillOpacity: 0.25
      }
    }).addTo(this.mapaRef);
  },

  limpiarFantasma: function() {
    if (this.capaFantasma && this.mapaRef) {
      this.mapaRef.removeLayer(this.capaFantasma);
      this.capaFantasma = null;
    }
  },

  // ----------------------------------------------------
  // 2. GESTIÓN DE POLÍGONOS PERMANENTES
  // ----------------------------------------------------
  dibujarPermanente: function(geoJsonGPS, opciones = {}) {
    if (!this.mapaRef || !geoJsonGPS) return null;

    let objetoGeoJSON = geoJsonGPS;
    if (typeof geoJsonGPS === 'string') {
      try {
        objetoGeoJSON = JSON.parse(geoJsonGPS);
      } catch (e) {
        console.error("❌ [Polígonos] No se pudo parsear el GeoJSON recibido:", e);
        return null;
      }
    }

    if (!objetoGeoJSON || (!objetoGeoJSON.type && !objetoGeoJSON.coordinates)) {
      return null;
    }

    if (!this.capaPermanentesGroup) {
      this.capaPermanentesGroup = L.layerGroup().addTo(this.mapaRef);
    }

    try {
      const capaPoligono = L.geoJSON(objetoGeoJSON, {
        style: {
          color: opciones.color || '#1a73e8',
          weight: opciones.weight || 2,
          opacity: opciones.opacity || 0.8,
          fillColor: opciones.fillColor || opciones.color || '#1a73e8',
          fillOpacity: opciones.fillOpacity || 0.2
        }
      });

      this.capaPermanentesGroup.addLayer(capaPoligono);
      return capaPoligono;
    } catch (err) {
      console.error("❌ [Polígonos] Error de Leaflet al dibujar polígono:", err);
      return null;
    }
  },

  // 🟢 FUNCIÓN CLAVE PARA EVITAR EL TypeError
  limpiarPermanentes: function() {
    if (this.capaPermanentesGroup) {
      this.capaPermanentesGroup.clearLayers();
    }
  },

  // ----------------------------------------------------
  // 3. CAPA MAESTRA DE SECCIONES (ESTÁTICA Y PASIVA)
  // ----------------------------------------------------
  toggleSecciones: function() {
    this.modoSeccionesActivo = !this.modoSeccionesActivo;
    const btn = document.getElementById('btn-secciones');

    if (this.modoSeccionesActivo) {
      if (btn) btn.classList.add('herramienta-activa');
      this.dibujarSeccionesMaestras();
      if (typeof mostrarToast === 'function') mostrarToast("Capa de Secciones activada");
    } else {
      if (btn) btn.classList.remove('herramienta-activa');
      this.ocultarSeccionesMaestras();
      if (typeof mostrarToast === 'function') mostrarToast("Capa de Secciones desactivada");
    }

    setTimeout(() => {
      if (typeof ocultarToast === 'function') ocultarToast();
    }, 1200);
  },

  dibujarSeccionesMaestras: async function() {
    if (!this.mapaRef || !window.CatastroGIS) return;

    const geoJsonSecciones = await window.CatastroGIS.cargarSeccionesDelRepo();
    if (!geoJsonSecciones) return;

    this.ocultarSeccionesMaestras();

    const geoJsonConvertido = {
      type: "FeatureCollection",
      features: geoJsonSecciones.features.map(feat => ({
        type: "Feature",
        properties: feat.properties,
        geometry: window.CatastroGIS.convertirMultiPoligonoGPS(feat.geometry)
      }))
    };

    this.capaSeccionesMap = L.geoJSON(geoJsonConvertido, {
      style: {
        color: '#1a73e8',
        weight: 1.5,
        opacity: 0.6,
        dashArray: '4, 4',
        fillColor: '#1a73e8',
        fillOpacity: 0.05,
        interactive: false
      },
      onEachFeature: function(feature, layer) {
        const numSeccion = feature.properties?.Text || feature.properties?.SECCCION || "S/N";
        
        layer.bindTooltip(`Sección ${numSeccion}`, {
          permanent: true,
          direction: 'center',
          className: 'etiqueta-seccion-discreta'
        });
      }
    }).addTo(this.mapaRef);
  },

  ocultarSeccionesMaestras: function() {
    if (this.capaSeccionesMap && this.mapaRef) {
      this.mapaRef.removeLayer(this.capaSeccionesMap);
      this.capaSeccionesMap = null;
    }
  }
};