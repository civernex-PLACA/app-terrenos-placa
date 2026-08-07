// ==========================================
// MÓDULO: GESTIÓN DE POLÍGONOS EN LEAFLET
// ==========================================

window.Poligonos = {
  mapaRef: null,
  capaFantasma: null,          // Parcela individual en edición/creación
  capaPermanentesGroup: null,  // Grupo de polígonos guardados de los terrenos
  capaPermanentesPorId: {},    // 🟢 id de terreno -> su capa de polígono, para actualizar/borrar solo el que cambió

  init: function(mapa) {
    this.mapaRef = mapa;
    if (this.mapaRef && !this.capaPermanentesGroup) {
      // 🟢 Pane propio, por arriba del 'paneCatastroCompleto' de
      // OverlayCatastro y de 'paneCalles' de CapasCalles (ver esos
      // módulos) — los polígonos ya relevados siempre tienen que quedar
      // por encima de la guía gris de parcelas y de las calles, sin
      // depender de cuál canvas se creó primero.
      if (!this.mapaRef.getPane('panePoligonosRelevados')) {
        this.mapaRef.createPane('panePoligonosRelevados');
        this.mapaRef.getPane('panePoligonosRelevados').style.zIndex = 403;
      }
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
        fillOpacity: 0.25,
        // 🟢 Activa la animación de guiones en movimiento (estilos.css,
        // .poligono-fantasma-animado + @keyframes marchaGuiones) — deja
        // claro que este polígono todavía se está por confirmar/guardar.
        className: 'poligono-fantasma-animado'
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
  dibujarPermanente: function(geoJsonGPS, opciones = {}, id = null) {
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

    // 🟢 Si ya había un polígono dibujado para este terreno, lo sacamos
    // antes de dibujar el nuevo (evita que queden duplicados superpuestos
    // al actualizar un terreno que cambió).
    if (id && this.capaPermanentesPorId[id]) {
      this.capaPermanentesGroup.removeLayer(this.capaPermanentesPorId[id]);
      delete this.capaPermanentesPorId[id];
    }

    // 🟢 Canvas compartido en vez de SVG (mismo cambio que se hizo en el
    // overlay de parcelas): antes cada terreno con polígono agregaba su
    // propio <path> al DOM; ahora se dibujan todos sobre un único
    // <canvas>. Acá el volumen puede ser mayor que en el overlay (son
    // TODOS los terrenos con GIS cargado, no solo lo visible en pantalla).
    if (!this.renderer) {
      this.renderer = L.canvas({ pane: 'panePoligonosRelevados', padding: 0.5 });
    }

    try {
      const capaPoligono = L.geoJSON(objetoGeoJSON, {
        renderer: this.renderer,
        interactive: false, // 🟢 nada escucha clics sobre estos polígonos
        style: {
          color: opciones.color || '#1a73e8',
          weight: opciones.weight || 2,
          opacity: opciones.opacity || 0.8,
          fillColor: opciones.fillColor || opciones.color || '#1a73e8',
          fillOpacity: opciones.fillOpacity || 0.2
        }
      });

      this.capaPermanentesGroup.addLayer(capaPoligono);
      if (id) this.capaPermanentesPorId[id] = capaPoligono;
      return capaPoligono;
    } catch (err) {
      console.error("❌ [Polígonos] Error de Leaflet al dibujar polígono:", err);
      return null;
    }
  },

  // 🟢 Saca del mapa el polígono de un terreno puntual (terreno borrado de
  // la planilla, o paso previo antes de redibujarlo actualizado).
  eliminarPermanente: function(id) {
    if (id && this.capaPermanentesPorId[id] && this.capaPermanentesGroup) {
      this.capaPermanentesGroup.removeLayer(this.capaPermanentesPorId[id]);
      delete this.capaPermanentesPorId[id];
    }
  },

  // 🟢 FUNCIÓN CLAVE PARA EVITAR EL TypeError
  limpiarPermanentes: function() {
    if (this.capaPermanentesGroup) {
      this.capaPermanentesGroup.clearLayers();
    }
    this.capaPermanentesPorId = {};
  }
};