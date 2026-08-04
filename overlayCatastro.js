// ==========================================
// MÓDULO: OVERLAY DE PARCELAS CATASTRALES
// Guía visual (polígonos grises translúcidos) que muestra los límites de
// las parcelas cercanas mientras se agrega o edita un terreno, para poder
// tocar con confianza dentro de la parcela correcta.
//
// Para no consumir recursos de más:
// - Solo se activa con zoom cercano (ZOOM_MINIMO).
// - Solo dibuja las parcelas que caen dentro del viewport actual.
// - Al mover el mapa o cambiar el zoom, agrega las que entraron a la
//   vista y saca las que quedaron afuera — nunca redibuja todo de cero.
// ==========================================

window.OverlayCatastro = {
  ZOOM_MINIMO: 17,

  mapaRef: null,

  // 🟢 Dos interruptores independientes — el overlay se muestra si
  // CUALQUIERA de los dos está prendido:
  // - manual: lo controla el botón del dock, queda como el usuario lo dejó.
  // - automatico: lo controla el modo agregar / panel de edición abierto.
  // Así, si el usuario lo prendió a mano, entrar y salir del modo edición
  // no se lo apaga solo.
  manual: false,
  automatico: false,
  activo: false, // estado combinado ya aplicado (para no redibujar de más)

  capaOverlay: null,
  poligonosDibujados: {}, // IDGIS -> capa de Leaflet ya dibujada
  timeoutRecalculo: null,

  init: function (mapa) {
    this.mapaRef = mapa;
    if (!this.mapaRef) return;
    this.mapaRef.on('moveend', () => this.actualizar());
    this.mapaRef.on('zoomend', () => this.actualizar());
  },

  toggleManual: function () {
    this.manual = !this.manual;
    const btn = document.getElementById('btn-overlay-parcelas');
    if (btn) btn.classList.toggle('herramienta-activa', this.manual);
    this._sincronizarEstado();
  },

  activarAutomatico: function () {
    this.automatico = true;
    this._sincronizarEstado();
  },

  desactivarAutomatico: function () {
    this.automatico = false;
    this._sincronizarEstado();
  },

  _sincronizarEstado: function () {
    const debeEstarActivo = this.manual || this.automatico;
    this.activo = debeEstarActivo;

    if (debeEstarActivo) {
      this.actualizar();
    } else {
      clearTimeout(this.timeoutRecalculo);
      this.limpiarTodo();
    }
  },

  limpiarTodo: function () {
    Object.keys(this.poligonosDibujados).forEach(idgis => this._quitarPoligono(idgis));
  },

  // Se llama cada vez que puede haber cambiado lo que hay que mostrar
  // (activación, movimiento o zoom del mapa). Con debounce chiquito para
  // no recalcular en cada frame de un gesto de pinch-zoom en celular.
  actualizar: function () {
    if (!this.activo) return;
    clearTimeout(this.timeoutRecalculo);
    this.timeoutRecalculo = setTimeout(() => this._recalcular(), 150);
  },

  _recalcular: function () {
    if (!this.activo || !this.mapaRef || !window.CatastroGIS) return;

    const zoom = this.mapaRef.getZoom();
    if (zoom < this.ZOOM_MINIMO) {
      this.limpiarTodo();
      return;
    }

    const capaSecciones = window.CatastroGIS.capaSeccionesMaestra;
    if (!capaSecciones || !capaSecciones.features) return; // todavía no cargó

    const bounds = this.mapaRef.getBounds();
    const esquinaSO = window.CatastroGIS.latLngToMercator(bounds.getSouth(), bounds.getWest());
    const esquinaNE = window.CatastroGIS.latLngToMercator(bounds.getNorth(), bounds.getEast());
    const viewportBbox = { minX: esquinaSO[0], minY: esquinaSO[1], maxX: esquinaNE[0], maxY: esquinaNE[1] };

    // 1. Filtro grueso: qué secciones tocan el viewport (son pocas, 26 en total)
    const seccionesRelevantes = [];
    capaSecciones.features.forEach(feature => {
      const bbox = window.CatastroGIS.obtenerBBoxCacheado(feature);
      if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBbox)) return;

      const props = feature.properties || {};
      const numSeccion = props.Text || props.SECCCION || props.SECCION || props.seccion;
      if (numSeccion) {
        seccionesRelevantes.push('seccion' + parseInt(numSeccion, 10).toString().padStart(2, '0'));
      }
    });

    // 2. Filtro fino: solo dentro de esas secciones, qué parcelas tocan el viewport
    const idsVistosAhora = new Set();
    seccionesRelevantes.forEach(claveSeccion => {
      const capa = window.CapasDrive && window.CapasDrive.capasCargadas ? window.CapasDrive.capasCargadas[claveSeccion] : null;
      if (!capa || !capa.features) return; // esa sección todavía no bajó de Drive

      capa.features.forEach(parcela => {
        const bbox = window.CatastroGIS.obtenerBBoxCacheado(parcela);
        if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBbox)) return;

        const idgis = parcela.properties ? parcela.properties.IDGIS : null;
        if (!idgis) return;

        idsVistosAhora.add(idgis);
        if (!this.poligonosDibujados[idgis]) {
          this._dibujarPoligono(idgis, parcela);
        }
      });
    });

    // 3. Sacar del mapa las parcelas que ya no están en el viewport
    Object.keys(this.poligonosDibujados).forEach(idgis => {
      if (!idsVistosAhora.has(idgis)) this._quitarPoligono(idgis);
    });
  },

  // Recién acá se convierte la parcela de Mercator a lat/lng — solo para
  // las que de verdad se van a dibujar, no para todas las candidatas.
  _dibujarPoligono: function (idgis, parcela) {
    const geoJsonGPS = window.CatastroGIS.convertirMultiPoligonoGPS(parcela.geometry);
    if (!geoJsonGPS) return;

    if (!this.capaOverlay) {
      this.capaOverlay = L.layerGroup().addTo(this.mapaRef);
    }
    // 🟢 Renderer de Canvas compartido para TODAS las parcelas del overlay:
    // en vez de un <path> SVG por parcela (pesado con muchas a la vez),
    // Leaflet las dibuja todas sobre un único <canvas>.
    if (!this.renderer) {
      this.renderer = L.canvas({ padding: 0.5 });
    }

    const capa = L.geoJSON(geoJsonGPS, {
      renderer: this.renderer,
      interactive: false, // guía visual: no compite con el clic del mapa
      style: {
        color: '#9aa0a6',
        weight: 1,
        opacity: 0.5,
        fillColor: '#9aa0a6',
        fillOpacity: 0.5
      }
    });

    this.capaOverlay.addLayer(capa);
    this.poligonosDibujados[idgis] = capa;
  },

  _quitarPoligono: function (idgis) {
    const capa = this.poligonosDibujados[idgis];
    if (capa && this.capaOverlay) this.capaOverlay.removeLayer(capa);
    delete this.poligonosDibujados[idgis];
  }
};
