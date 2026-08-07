// ==========================================
// MÓDULO: OVERLAY DE SECCIONES + PARCELAS CATASTRALES
// Guía visual con transición por zoom entre dos capas:
// - Secciones (límites gruesos, ~26 en toda la ciudad, siempre livianas de
//   dibujar) — visibles en zooms alejados, donde ubicar una parcela
//   individual todavía no tiene sentido.
// - Parcelas (polígonos grises translúcidos de cada lote) — visibles en
//   zooms cercanos, para poder tocar con confianza dentro de la parcela
//   correcta al agregar/editar un terreno.
// Antes eran dos botones independientes ("Ver Secciones" / "Ver Parcelas y
// Calles"); ahora es un solo interruptor (botón "Ver Secciones y
// Parcelas") que muestra una u otra según el zoom, con una transición
// suave (fade cruzado) en el medio — ver _calcularFactorFade.
//
// Para no consumir recursos de más:
// - Parcelas: solo se dibuja con zoom cercano (ZOOM_TRANSICION_INICIO) y
//   solo las que caen dentro del viewport actual.
// - Secciones: son pocas (~26), se dibujan todas una sola vez apenas se
//   activa el overlay, sin recalcular por viewport.
// - Al mover el mapa o cambiar el zoom, agrega las parcelas que entraron a
//   la vista y saca las que quedaron afuera — nunca redibuja todo de cero.
// ==========================================

window.OverlayCatastro = {
  // 🟢 Transición en cuartos: a ZOOM_TRANSICION_INICIO, Secciones 100% /
  // Parcelas 0%; a ZOOM_TRANSICION_FIN, Secciones 0% / Parcelas 100%; en
  // el medio (16, 17, 18) se reparte 25/50/75 — ver _calcularFactorFade.
  // Por encima de ZOOM_TRANSICION_FIN (19 y 20, el máximo útil del mapa)
  // queda como meseta: Parcelas 100%, Secciones 0%.
  ZOOM_TRANSICION_INICIO: 15,
  ZOOM_TRANSICION_FIN: 19,
  OPACIDAD_MAXIMA: 0.65,    // opacidad de cada polígono de Parcelas una vez que el fade llegó al 100%
  COLOR_CONTORNO: '#5f6368',

  // Estilo de Secciones — mismo criterio visual que tenía
  // Poligonos.dibujarSeccionesMaestras antes de fusionarse acá.
  SECCIONES_COLOR: '#1a73e8',
  SECCIONES_WEIGHT: 1.5,
  SECCIONES_OPACIDAD_LINEA: 0.6,
  SECCIONES_OPACIDAD_RELLENO: 0.05,

  // 🟢 El fade NO se hace restyleando cada polígono en cada zoomend (eso
  // cambiaba el color de golpe, sin transición visible, aunque el VALOR
  // calculado sí era gradual). Cada polígono se dibuja con opacidad fija
  // (OPACIDAD_MAXIMA para Parcelas, SECCIONES_OPACIDAD_* para Secciones),
  // y el fade se aplica una sola vez sobre el <div> de cada pane completo
  // (CSS opacity + transition) — un solo cambio por zoomend por capa, y
  // el navegador anima la transición solo (GPU, sin redibujar el canvas).
  DURACION_FADE_MS: 400,
  factorFadeActual: 0, // 0..1 — factor de Parcelas; Secciones usa (1 - este valor)

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
  poligonosDibujados: {}, // IDGIS -> capa de Leaflet ya dibujada (Parcelas)
  capaSecciones: null,    // capa única de Leaflet con las ~26 Secciones (null = todavía no dibujada)
  timeoutRecalculo: null,

  init: function (mapa) {
    this.mapaRef = mapa;
    if (!this.mapaRef) return;

    // 🟢 Panes propios (en vez del 'overlayPane' por defecto que
    // comparten otras cosas) para que el orden contra el pane de
    // Polígonos ya relevados sea determinístico, y para poder animar la
    // opacidad de cada capa completa de un solo cambio de CSS.
    if (!this.mapaRef.getPane('paneCatastroCompleto')) {
      const pane = this.mapaRef.createPane('paneCatastroCompleto');
      pane.style.zIndex = 401;
      pane.style.opacity = 0;
      pane.style.transition = 'opacity ' + this.DURACION_FADE_MS + 'ms ease';
    }
    if (!this.mapaRef.getPane('paneSeccionesMaestras')) {
      const paneSecciones = this.mapaRef.createPane('paneSeccionesMaestras');
      paneSecciones.style.zIndex = 400;
      paneSecciones.style.opacity = 1;
      paneSecciones.style.transition = 'opacity ' + this.DURACION_FADE_MS + 'ms ease';
    }

    this.mapaRef.on('moveend', () => this.actualizar());
    this.mapaRef.on('zoomend', () => this.actualizar());
  },

  // 🟢 0 en ZOOM_TRANSICION_INICIO (Parcelas recién empieza a existir)
  // hasta 1 en ZOOM_TRANSICION_FIN o más cerca — factor 0 a 1, NO el
  // valor final de opacidad de cada polígono (eso es OPACIDAD_MAXIMA,
  // fijo — ver _dibujarPoligono). Este factor es lo que se aplica como
  // opacity del pane completo de Parcelas; Secciones usa el complemento
  // (1 - factor).
  _calcularFactorFade: function (zoom) {
    if (zoom <= this.ZOOM_TRANSICION_INICIO) return 0;
    if (zoom >= this.ZOOM_TRANSICION_FIN) return 1;
    return (zoom - this.ZOOM_TRANSICION_INICIO) / (this.ZOOM_TRANSICION_FIN - this.ZOOM_TRANSICION_INICIO);
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
      this._dibujarSeccionesSiHaceFalta();
      this.actualizar();
    } else {
      clearTimeout(this.timeoutRecalculo);
      this.limpiarTodo();
      this._ocultarSecciones();
    }

    // 🟢 La capa de calles no tiene botón propio — se muestra siempre
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

    // 🟢 Un solo cambio de opacity por pane, no por polígono — el CSS
    // transition (ver init) hace que se anime suave hacia el valor nuevo.
    // Parcelas y Secciones son complementarios (factor y 1-factor), así
    // que en todo momento la suma "se siente" como una sola transición
    // cruzada entre las dos capas.
    const factorFadeNuevo = this._calcularFactorFade(zoom);
    if (factorFadeNuevo !== this.factorFadeActual) {
      this.factorFadeActual = factorFadeNuevo;
      const paneParcelas = this.mapaRef.getPane('paneCatastroCompleto');
      if (paneParcelas) paneParcelas.style.opacity = factorFadeNuevo;
      const paneSecciones = this.mapaRef.getPane('paneSeccionesMaestras');
      if (paneSecciones) paneSecciones.style.opacity = 1 - factorFadeNuevo;
    }

    if (zoom < this.ZOOM_TRANSICION_INICIO) {
      this.limpiarTodo(); // debajo del inicio de la transición, Parcelas no se dibuja (performance)
      return;
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
  },

  // ----------------------------------------------------
  // SECCIONES (capa maestra, estática y pasiva — ~26 polígonos en total)
  // ----------------------------------------------------

  // 🟢 Se dibuja UNA sola vez por activación (no depende del viewport, a
  // diferencia de Parcelas) — si ya está dibujada, no hace nada.
  _dibujarSeccionesSiHaceFalta: async function () {
    if (this.capaSecciones || !this.mapaRef || !window.CatastroGIS) return;

    const geoJsonSecciones = await window.CatastroGIS.cargarSeccionesDelRepo();
    if (!geoJsonSecciones || this.capaSecciones) return; // pudo haberse dibujado mientras esperaba el fetch

    const geoJsonConvertido = {
      type: "FeatureCollection",
      features: geoJsonSecciones.features.map(feat => ({
        type: "Feature",
        properties: feat.properties,
        geometry: window.CatastroGIS.convertirMultiPoligonoGPS(feat.geometry)
      }))
    };

    this.capaSecciones = L.geoJSON(geoJsonConvertido, {
      pane: 'paneSeccionesMaestras',
      style: {
        color: this.SECCIONES_COLOR,
        weight: this.SECCIONES_WEIGHT,
        opacity: this.SECCIONES_OPACIDAD_LINEA,
        dashArray: '4, 4',
        fillColor: this.SECCIONES_COLOR,
        fillOpacity: this.SECCIONES_OPACIDAD_RELLENO,
        interactive: false
      },
      onEachFeature: (feature, layer) => {
        const numSeccion = feature.properties?.Text || feature.properties?.SECCCION || "S/N";
        // 🟢 pane propio también para el tooltip: así la etiqueta se
        // desvanece JUNTO con el polígono al hacer zoom (ambos viven en
        // 'paneSeccionesMaestras', cuya opacity anima _recalcular).
        layer.bindTooltip(`Sección ${numSeccion}`, {
          permanent: true,
          direction: 'center',
          className: 'etiqueta-seccion-discreta',
          pane: 'paneSeccionesMaestras'
        });
      }
    }).addTo(this.mapaRef);
  },

  _ocultarSecciones: function () {
    if (this.capaSecciones && this.mapaRef) {
      this.mapaRef.removeLayer(this.capaSecciones);
      this.capaSecciones = null;
    }
  }
};
