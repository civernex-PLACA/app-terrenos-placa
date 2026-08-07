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
  ZOOM_MINIMO: 15,          // debajo de este zoom, se deja de dibujar (performance)
  ZOOM_OPACIDAD_PLENA: 19,  // en este zoom (o más cercano), el fade ya está al 100%
  OPACIDAD_MAXIMA: 0.65,    // opacidad de cada polígono una vez que el fade llegó al 100%
  COLOR_CONTORNO: '#5f6368',

  // 🟢 El fade ya NO se hace restyleando cada polígono en cada zoomend
  // (eso cambiaba el color de golpe, sin transición visible, aunque el
  // VALOR calculado sí era gradual). Ahora cada polígono se dibuja con
  // OPACIDAD_MAXIMA fija, y el fade se aplica una sola vez sobre el
  // <div> del pane completo (CSS opacity + transition) — un solo cambio
  // por zoomend en vez de uno por polígono, y el navegador anima la
  // transición solo (GPU, sin redibujar el canvas).
  DURACION_FADE_MS: 400,
  factorFadeActual: 0,

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

    // 🟢 Pane propio (en vez del 'overlayPane' por defecto que comparten
    // secciones/GPS) para que el orden contra el pane de Polígonos ya
    // relevados sea determinístico y no dependa de cuál de los dos
    // canvas se creó primero en tiempo de ejecución.
    if (!this.mapaRef.getPane('paneCatastroCompleto')) {
      const pane = this.mapaRef.createPane('paneCatastroCompleto');
      pane.style.zIndex = 401;
      pane.style.opacity = 0;
      // 🟢 Acá vive el fade suave: cambiar opacity en JS de golpe
      // (abajo, en _recalcular) dispara esta transición sola, animada
      // por el navegador — no hace falta requestAnimationFrame ni redibujar
      // el canvas para lograr el efecto.
      pane.style.transition = 'opacity ' + this.DURACION_FADE_MS + 'ms ease';
    }

    this.mapaRef.on('moveend', () => this.actualizar());
    this.mapaRef.on('zoomend', () => this.actualizar());
  },

  // 🟢 0 en ZOOM_MINIMO (recién empieza a existir) hasta 1 en
  // ZOOM_OPACIDAD_PLENA o más cerca — factor 0 a 1, NO el valor final de
  // opacidad (eso es OPACIDAD_MAXIMA, fijo en cada polígono — ver
  // _dibujarPoligono). Este factor es lo que se aplica como opacity del
  // pane completo.
  _calcularFactorFade: function (zoom) {
    if (zoom <= this.ZOOM_MINIMO) return 0;
    if (zoom >= this.ZOOM_OPACIDAD_PLENA) return 1;
    return (zoom - this.ZOOM_MINIMO) / (this.ZOOM_OPACIDAD_PLENA - this.ZOOM_MINIMO);
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

    // 🟢 La capa de calles ya no tiene botón propio — se muestra siempre
    // junto con este overlay (mismo interruptor manual/automático).
    if (window.CapasCalles) {
      if (debeEstarActivo) window.CapasCalles.activar();
      else window.CapasCalles.desactivar();
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

    // 🟢 Un solo cambio de opacity en el pane, no por polígono — el CSS
    // transition (ver init) hace que se anime suave hacia el valor nuevo.
    const factorFadeNuevo = this._calcularFactorFade(zoom);
    if (factorFadeNuevo !== this.factorFadeActual) {
      this.factorFadeActual = factorFadeNuevo;
      const pane = this.mapaRef.getPane('paneCatastroCompleto');
      if (pane) pane.style.opacity = factorFadeNuevo;
    }

    const capaSecciones = window.CatastroGIS.capaSeccionesMaestra;
    if (!capaSecciones || !capaSecciones.features) return; // todavía no cargó

    const bounds = this.mapaRef.getBounds();

    // 🟢 secciones.geojson (filtro grueso, paso 1) sigue en Mercator — no
    // forma parte de la migración a capas enriquecidas (ver CLAUDE.md).
    const esquinaSO = window.CatastroGIS.latLngToMercator(bounds.getSouth(), bounds.getWest());
    const esquinaNE = window.CatastroGIS.latLngToMercator(bounds.getNorth(), bounds.getEast());
    const viewportBboxMercator = { minX: esquinaSO[0], minY: esquinaSO[1], maxX: esquinaNE[0], maxY: esquinaNE[1] };

    // 🟢 Capa enriquecida (paso 2, filtro fino) ya viene en lat/lng — acá
    // el viewport se compara directo en grados, sin Mercator.
    // obtenerBBoxCacheado/calcularBBoxMercator no dependen de qué unidad
    // sea, solo comparan los dos primeros números de cada coordenada —
    // sirven igual para Mercator o para lat/lng, pese al nombre.
    const viewportBboxLatLng = { minX: bounds.getWest(), minY: bounds.getSouth(), maxX: bounds.getEast(), maxY: bounds.getNorth() };

    // 1. Filtro grueso: qué secciones tocan el viewport (son pocas, 26 en total)
    const seccionesRelevantes = [];
    capaSecciones.features.forEach(feature => {
      const bbox = window.CatastroGIS.obtenerBBoxCacheado(feature);
      if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBboxMercator)) return;

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
        if (!bbox || !window.CatastroGIS.bboxIntersecta(bbox, viewportBboxLatLng)) return;

        const cca = parcela.properties ? parcela.properties.cca : null;
        if (!cca) return;

        idsVistosAhora.add(cca);
        if (!this.poligonosDibujados[cca]) {
          this._dibujarPoligono(cca, parcela);
        }
      });
    });

    // 3. Sacar del mapa las parcelas que ya no están en el viewport
    Object.keys(this.poligonosDibujados).forEach(idgis => {
      if (!idsVistosAhora.has(idgis)) this._quitarPoligono(idgis);
    });
  },

  // 🟢 La capa enriquecida ya viene en lat/lng — a diferencia de antes,
  // acá no hace falta convertir nada, se dibuja la geometría tal cual.
  _dibujarPoligono: function (idgis, parcela) {
    const geoJsonGPS = parcela.geometry;
    if (!geoJsonGPS) return;

    if (!this.capaOverlay) {
      this.capaOverlay = L.layerGroup().addTo(this.mapaRef);
    }
    // 🟢 Renderer de Canvas compartido para TODAS las parcelas del overlay:
    // en vez de un <path> SVG por parcela (pesado con muchas a la vez),
    // Leaflet las dibuja todas sobre un único <canvas>. En su propio pane
    // ('paneCatastroCompleto', ver init) para que quede siempre por debajo
    // de los polígonos ya relevados sin importar cuál de los dos se creó
    // primero en tiempo de ejecución.
    if (!this.renderer) {
      this.renderer = L.canvas({ pane: 'paneCatastroCompleto', padding: 0.5 });
    }

    // 🟢 Opacidad fija (no depende del zoom acá) — el fade por zoom se
    // aplica una sola vez sobre el pane completo, no polígono por
    // polígono (ver _recalcular/init).
    const capa = L.geoJSON(geoJsonGPS, {
      renderer: this.renderer,
      interactive: false, // guía visual: no compite con el clic del mapa
      style: {
        color: this.COLOR_CONTORNO,
        weight: 1,
        opacity: this.OPACIDAD_MAXIMA,
        fillColor: this.COLOR_CONTORNO,
        fillOpacity: this.OPACIDAD_MAXIMA
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
