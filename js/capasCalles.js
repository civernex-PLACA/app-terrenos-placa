// ==========================================
// MÓDULO: CAPA VISUAL DE CALLES
// Guía visual (líneas del callejero) para orientarse al decidir el frente
// de un lote al agregar/editar un terreno — lado frontend del "Motor de
// Frente" (ver CLAUDE.md); el algoritmo que clasifica lados como
// frente/medianera/ochava vive en el backend y todavía no está conectado
// a nada automático. Esto es solo la referencia visual en el mapa.
//
// Activación 100% manual (botón del dock) — a diferencia del overlay gris
// de parcelas, esta capa NO se prende sola al entrar a agregar/editar.
//
// Mismo patrón de performance que OverlayCatastro (overlayCatastro.js):
// - Solo se activa con zoom cercano (ZOOM_MINIMO).
// - Solo dibuja las calles que caen dentro del viewport actual.
// - Al mover el mapa o cambiar el zoom, agrega las que entraron a la
//   vista y saca las que quedaron afuera — nunca redibuja todo de cero.
// - Un único <canvas> compartido para todas las calles dibujadas (GPU).
//
// Los archivos callesNN.geojson viven en la misma carpeta de Drive que
// las secciones de parcelas — CapasDrive.sincronizarCapas() ya los baja
// solo (la query no filtra por prefijo, agarra cualquier .geojson), caen
// en capasCargadas['callesNN'] igual que 'seccionNN'.
// ==========================================

window.CapasCalles = {
  // Un poco antes que el overlay de parcelas (ZOOM_MINIMO 17 ahí): las
  // calles orientan a nivel de manzana, no hace falta estar tan cerca
  // como para distinguir cada parcela individual.
  ZOOM_MINIMO: 16,
  COLOR: '#f9ab00',

  mapaRef: null,
  activo: false,

  capaCalles: null,
  callesDibujadas: {}, // clave sintética (sección_índice) -> capa de Leaflet ya dibujada
  renderer: null,
  timeoutRecalculo: null,

  init: function (mapa) {
    this.mapaRef = mapa;
    if (!this.mapaRef) return;

    // 🟢 Pane propio, entre el overlay gris de parcelas y los polígonos
    // ya relevados (ver esos módulos) — así las líneas de calle quedan
    // siempre legibles por encima de la guía gris, sin taparse con ella.
    if (!this.mapaRef.getPane('paneCalles')) {
      this.mapaRef.createPane('paneCalles');
      this.mapaRef.getPane('paneCalles').style.zIndex = 402;
    }

    this.mapaRef.on('moveend', () => this.actualizar());
    this.mapaRef.on('zoomend', () => this.actualizar());
  },

  toggle: function () {
    this.activo = !this.activo;
    const btn = document.getElementById('btn-calles');
    if (btn) btn.classList.toggle('herramienta-activa', this.activo);

    if (this.activo) {
      this.actualizar();
    } else {
      clearTimeout(this.timeoutRecalculo);
      this.limpiarTodo();
    }
  },

  limpiarTodo: function () {
    Object.keys(this.callesDibujadas).forEach(clave => this._quitarCalle(clave));
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

    // 🟢 secciones.geojson (filtro grueso, paso 1) sigue en Mercator —
    // mismo motivo que en OverlayCatastro, no forma parte de la
    // migración a capas enriquecidas.
    const esquinaSO = window.CatastroGIS.latLngToMercator(bounds.getSouth(), bounds.getWest());
    const esquinaNE = window.CatastroGIS.latLngToMercator(bounds.getNorth(), bounds.getEast());
    const viewportBboxMercator = { minX: esquinaSO[0], minY: esquinaSO[1], maxX: esquinaNE[0], maxY: esquinaNE[1] };

    // 🟢 Capa enriquecida de calles (paso 2, filtro fino) ya viene en
    // lat/lng, mismo patrón que las parcelas.
    const viewportBboxLatLng = { minX: bounds.getWest(), minY: bounds.getSouth(), maxX: bounds.getEast(), maxY: bounds.getNorth() };

    // 1. Filtro grueso: qué secciones tocan el viewport
    const seccionesRelevantes = [];
    capaSecciones.features.forEach(feature => {
      const bbox = window.CatastroGIS.obtenerBBoxCacheado(feature);
      if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBboxMercator)) return;

      const props = feature.properties || {};
      const numSeccion = props.Text || props.SECCCION || props.SECCION || props.seccion;
      if (numSeccion) {
        seccionesRelevantes.push('calles' + parseInt(numSeccion, 10).toString().padStart(2, '0'));
      }
    });

    // 2. Filtro fino: solo dentro de esas secciones, qué calles tocan el viewport
    const clavesVistasAhora = new Set();
    seccionesRelevantes.forEach(claveSeccion => {
      const capa = window.CapasDrive && window.CapasDrive.capasCargadas ? window.CapasDrive.capasCargadas[claveSeccion] : null;
      if (!capa || !capa.features) return; // esa sección de calles todavía no bajó de Drive

      capa.features.forEach((calle, indice) => {
        const bbox = window.CatastroGIS.obtenerBBoxCacheado(calle);
        if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBboxLatLng)) return;

        // 🟢 Sin un id propio confiable en las propiedades de la capa de
        // calles, se arma una clave sintética (sección + índice) — esta
        // capa es solo visual, alcanza con saber qué ya está dibujado.
        const clave = claveSeccion + '_' + indice;
        clavesVistasAhora.add(clave);
        if (!this.callesDibujadas[clave]) {
          this._dibujarCalle(clave, calle);
        }
      });
    });

    // 3. Sacar del mapa las calles que ya no están en el viewport
    Object.keys(this.callesDibujadas).forEach(clave => {
      if (!clavesVistasAhora.has(clave)) this._quitarCalle(clave);
    });
  },

  _dibujarCalle: function (clave, calle) {
    const geoJsonGPS = calle.geometry;
    if (!geoJsonGPS) return;

    if (!this.capaCalles) {
      this.capaCalles = L.layerGroup().addTo(this.mapaRef);
    }
    // 🟢 Renderer de Canvas compartido para TODAS las calles (GPU), mismo
    // motivo que en OverlayCatastro/Poligonos: un único <canvas> en vez
    // de un <path> SVG por calle.
    if (!this.renderer) {
      this.renderer = L.canvas({ pane: 'paneCalles', padding: 0.5 });
    }

    const capa = L.geoJSON(geoJsonGPS, {
      renderer: this.renderer,
      interactive: false, // guía visual: no compite con el clic del mapa
      style: {
        color: this.COLOR,
        weight: 2,
        opacity: 0.85
      }
    });

    this.capaCalles.addLayer(capa);
    this.callesDibujadas[clave] = capa;
  },

  _quitarCalle: function (clave) {
    const capa = this.callesDibujadas[clave];
    if (capa && this.capaCalles) this.capaCalles.removeLayer(capa);
    delete this.callesDibujadas[clave];
  }
};
