// ==========================================
// MÓDULO 3: GESTIÓN DEL MAPA (LEAFLET)
// ==========================================

let map;
let markersGroup;
let ghostMarker = null;
let primeraCargaMapa = true;
let terrenoSeleccionadoActual = null;
let timeoutGeocoding = null;

// Variables globales del mapa
window.modoAgregar = false;
window.modoEdicionActivo = false;
window.idEdicionActual = null;
window.selectedLat = null;
window.selectedLng = null;
window.terrenosCache = window.terrenosCache || {};
window.markersPorId = window.markersPorId || {}; // 🟢 id de terreno -> su marcador de Leaflet, para poder tocar solo el que cambió
window.datosGisTemporales = null; // 🟢 Memoria RAM para el polígono que estamos por agregar

// GPS
let userLocationMarker = null;

// Variables para las capas del mapa
let capaOSM;
let capaGoogleSatelite;
let modoSatelite = false;

function inicializarMapa() {
  if (map) return;

  // Removidos los botones de zoom (+/-) de Leaflet
  // 🟢 maxZoom 20 explícito acá (antes solo lo definía cada capa de
  // tiles) — así el tope no cambia según cuál capa esté activa. OSM solo
  // tiene tiles nativos hasta 19 (maxNativeZoom abajo): Leaflet
  // "estira" el último nivel nativo para el zoom 20, mismo criterio que
  // ya usa la capa satelital de Google (nativa hasta 20).
  map = L.map('map', { zoomControl: false, maxZoom: 20 }).setView([-27.362, -55.890], 13);

  // 1. Capa estándar OpenStreetMap
  capaOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: '© OpenStreetMap'
  });

  // 2. Capa Satelital de Google Maps (Imágenes satelitales puras sin etiquetas)
  capaGoogleSatelite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps'
  });

  // Añadimos OSM por defecto
  capaOSM.addTo(map);

  markersGroup = L.layerGroup().addTo(map);
  map.on('click', onMapClick);

  // Inyectar el ícono en el botón satelital
  const contenedorIcono = document.getElementById('icono-satelite');
  if (contenedorIcono && typeof Iconos !== 'undefined' && Iconos.satelite) {
    contenedorIcono.innerHTML = Iconos.satelite();

    // 🟢 Inicializar motor de polígonos
    if (window.Poligonos) window.Poligonos.init(map);
  }

  // 🟢 Overlay de parcelas catastrales (guía visual al agregar/editar)
  if (window.OverlayCatastro) window.OverlayCatastro.init(map);

  // 🟢 Capa visual de calles (guía de referencia para el frente del lote)
  if (window.CapasCalles) window.CapasCalles.init(map);
}

// 🟢 FUNCIÓN PARA CONMUTAR CAPAS DESDE TU DOCK
function toggleCapasMapa() {
  modoSatelite = !modoSatelite;
  const btn = document.getElementById('btn-satelite');
  let idToast = null;

  if (modoSatelite) {
    map.removeLayer(capaOSM);
    capaGoogleSatelite.addTo(map);
    if (btn) btn.classList.add('herramienta-activa');
    if (typeof mostrarToast === 'function') idToast = mostrarToast("Modo Satelital activado");
  } else {
    map.removeLayer(capaGoogleSatelite);
    capaOSM.addTo(map);
    if (btn) btn.classList.remove('herramienta-activa');
    if (typeof mostrarToast === 'function') idToast = mostrarToast("Modo Mapa activado");
  }

  setTimeout(() => {
    if (typeof ocultarToast === 'function') ocultarToast(idToast);
  }, 1200);
}

// ==========================================
// DIBUJAR PINES EN EL MAPA
// ==========================================

function dibujarPinEnMapa(lat, lng, id, colorHex, direccion, ficha = {}) {
  const atributos = typeof window.obtenerAtributosPin === 'function'
    ? window.obtenerAtributosPin(ficha.estado, ficha.visitado, ficha.calificacion, false)
    : { colorHex: colorHex || '#1a73e8', forma: 'gota', visitado: false, tachado: false };

  const svgPin = typeof Iconos !== 'undefined'
    ? Iconos.generarPinDinamico({
      colorHex: atributos.colorHex,
      forma: atributos.forma,
      visitado: atributos.visitado,
      tachado: atributos.tachado,
      esFantasma: false
    })
    : '';

  const markerIcon = L.divIcon({
    className: 'custom-pin-svg',
    html: svgPin,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
  });

  const marker = L.marker([lat, lng], { icon: markerIcon });
  const terrenoCompleto = { id, direccion: direccion || '', lat, lng, ...ficha };
  window.terrenosCache[id] = terrenoCompleto;
  window.markersPorId[id] = marker;

  let carruselPopupHTML = "";
  try {
    if (typeof window.Fotos_renderizarCarruselHTML === 'function') {
      carruselPopupHTML = window.Fotos_renderizarCarruselHTML(ficha.fotosIds);
    }
  } catch (err) { console.error("Error Módulo Fotos:", err); }

  let tagsHTML = "";
  try {
    if (typeof Tags !== 'undefined' && typeof Tags.renderizarTagsHTML === 'function') {
      tagsHTML = Tags.renderizarTagsHTML(ficha);
    }
  } catch (err) { console.error("Error Módulo Tags:", err); }

  // 🟢 Todo texto que viene de la planilla (dirección, notas, propietario,
  // etc.) pasa por escaparHTML antes de entrar al HTML del popup, para que
  // nunca se pueda ejecutar como código (XSS) — ver tags.js donde está
  // definida la función.
  const esc = window.escaparHTML || (v => v);

  const popupContent = `
    <div class="popup-terreno-container">
      ${carruselPopupHTML}
      <h3 class="popup-titulo">${esc(id)}</h3>
      ${tagsHTML}
      <p class="popup-direccion">${esc(direccion)}</p>
      <hr class="popup-divider">

      <div class="popup-datos">
        ${ficha.distrito || ficha.barrio ? `<b>Ubicación:</b> ${esc(ficha.distrito) || '-'} / ${esc(ficha.barrio) || '-'}<br>` : ''}
        ${ficha.frente || ficha.fondo ? `<b>Medidas:</b> ${esc(ficha.frente) || '-'}m x ${esc(ficha.fondo) || '-'}m<br>` : ''}
        ${ficha.sup ? `<b>Superficie:</b> ${esc(ficha.sup)} m²<br>` : ''}
        ${ficha.tipolote ? `<b>Tipo Lote:</b> ${esc(ficha.tipolote)}<br>` : ''}
        ${ficha.agua || ficha.cloaca ? `<b>Servicios:</b> Agua: ${esc(ficha.agua) || 'No'} | Cloaca: ${esc(ficha.cloaca) || 'No'}<br>` : ''}
        ${ficha.propietario ? `<b>Propietario:</b> ${esc(ficha.propietario)}<br>` : ''}
        ${ficha.contacto ? `<b>Contacto:</b> ${esc(ficha.contacto)}<br>` : ''}
        ${ficha.notas ? `<b>Notas:</b> <span class="popup-notas">${esc(ficha.notas)}</span><br>` : ''}
      </div>

      <button class="btn-popup-editar">✏️ Editar Terreno</button>
    </div>
  `;

  marker.bindPopup(popupContent);
  // 🟢 El ID ya no se mete como texto dentro de un onclick="..." (eso es
  // frágil incluso escapando HTML, porque el navegador puede volver a
  // interpretar el código antes de ejecutarlo). En cambio, conectamos el
  // botón acá con el valor real de "id" ya en memoria, sin pasar por texto.
  marker.on('popupopen', function () {
    const popupEl = marker.getPopup()?.getElement();
    const btnEditar = popupEl?.querySelector('.btn-popup-editar');
    if (btnEditar) btnEditar.onclick = () => window.iniciarEdicionDirecta(id);
  });
  marker.on('click', function () { terrenoSeleccionadoActual = terrenoCompleto; });
  markersGroup.addLayer(marker);
}

// ==========================================
// ELIMINAR UN PIN PUNTUAL DEL MAPA
// (usado por el sincronizado incremental: antes de redibujar un terreno
// que cambió, o cuando un terreno se borró de la planilla)
// ==========================================
window.eliminarPinDelMapa = function (id) {
  const marker = window.markersPorId[id];
  if (marker && markersGroup) {
    markersGroup.removeLayer(marker);
  }
  delete window.markersPorId[id];
  delete window.terrenosCache[id];
};

// ==========================================
// PIN FANTASMA DINÁMICO
// ==========================================

window.actualizarPinFantasmaDesdeFormulario = function () {
  if (!window.selectedLat || !window.selectedLng) return;

  const estado = document.getElementById('f-estado')?.value;
  const visitado = document.getElementById('f-visitado')?.value;

  const atributos = typeof window.obtenerAtributosPin === 'function'
    ? window.obtenerAtributosPin(estado, visitado, null, true)
    : { colorHex: '#9aa0a6', forma: 'gota', visitado: false };

  crearPinFantasma(window.selectedLat, window.selectedLng, atributos);
};

function crearPinFantasma(lat, lng, atributos = { colorHex: '#9aa0a6', forma: 'gota', visitado: false }) {
  window.removerPinFantasma();

  const svgGhost = typeof Iconos !== 'undefined'
    ? Iconos.generarPinDinamico({
      colorHex: atributos.colorHex,
      forma: atributos.forma,
      visitado: atributos.visitado,
      esFantasma: true
    })
    : '';

  const ghostIcon = L.divIcon({
    className: 'custom-pin-svg',
    html: svgGhost,
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });

  ghostMarker = L.marker([lat, lng], { icon: ghostIcon, zIndexOffset: 1000 }).addTo(map);
}

window.removerPinFantasma = function () {
  if (ghostMarker && map) {
    map.removeLayer(ghostMarker);
    ghostMarker = null;
  }
  
  // 🟢 NUEVO: Limpiamos el polígono temporal y la memoria de la API de Catastro
  if (window.Poligonos) window.Poligonos.limpiarFantasma();
  window.datosGisTemporales = null; 
};

document.addEventListener('DOMContentLoaded', () => {
  ['f-estado', 'f-visitado'].forEach(id => {
    const selector = document.getElementById(id);
    if (selector) {
      selector.addEventListener('change', window.actualizarPinFantasmaDesdeFormulario);
    }
  });
});

// ==========================================
// INTERACCIÓN CON EL MAPA
// ==========================================

function toggleAddMode() {
  window.modoAgregar = !window.modoAgregar;
  const btn = document.getElementById('btn-add');

  if (window.modoAgregar) {
    if (btn) btn.classList.add('herramienta-activa');
    if (window.Editor) window.Editor.cerrar(false);
    // 🟢 El overlay de parcelas se prende apenas se activa el modo, no
    // recién cuando se hace el primer clic — así ayuda a decidir dónde
    // tocar, no solo después.
    if (window.OverlayCatastro) window.OverlayCatastro.activarAutomatico();
    mostrarInstruccion("Toca una ubicación en el mapa para ubicar el terreno");
  } else {
    if (btn) btn.classList.remove('herramienta-activa');
    ocultarInstruccion();

    // 🟢 Si el panel de ficha ya está abierto (esto pasa al desactivar el
    // modo agregar justo después de tocar el mapa y ubicar el pin), no
    // apagamos el overlay automático acá — Editor.cerrar() se encarga
    // cuando el panel realmente se cierre.
    // 🟢 Ojo: se chequea "style.display", no la clase 'active' — Editor
    // agrega esa clase recién 10ms después de abrir (para animar la
    // transición), y este toggleAddMode() corre en el mismo instante
    // síncrono que abre el panel. Chequear la clase acá siempre leía
    // "todavía no está abierto" (aunque display ya estaba en 'flex') y
    // apagaba el overlay justo al ubicar el pin, para prenderse recién
    // 150ms después con el próximo recálculo — eso se veía como que la
    // capa "se apagaba sola" al entrar a modo agregar.
    const modal = document.getElementById('modal-terreno');
    const panelSigueAbierto = modal && modal.style.display === 'flex';
    if (!panelSigueAbierto && window.OverlayCatastro) window.OverlayCatastro.desactivarAutomatico();
  }
}

function onMapClick(e) {
  const modal = document.getElementById('modal-terreno');
  const panelAbierto = modal && modal.classList.contains('active');

  if (window.modoAgregar || panelAbierto) {
    window.selectedLat = e.latlng.lat;
    window.selectedLng = e.latlng.lng;

    window.actualizarPinFantasmaDesdeFormulario();

    // 🟢 Guardamos si este clic fue para crear un terreno nuevo
    const esTerrenoNuevo = window.modoAgregar || !window.modoEdicionActivo;

    if (window.modoAgregar) {
      if (window.Editor) window.Editor.abrirParaNuevo(window.selectedLat, window.selectedLng);
      toggleAddMode(); // Desactiva la herramienta
    }

    const campoDireccion = document.getElementById('f-direccion');
    if (campoDireccion) {
      campoDireccion.value = "";
      campoDireccion.placeholder = "Buscando calle más cercana...";
    }

    if (timeoutGeocoding) {
      clearTimeout(timeoutGeocoding);
      console.log(`[Mapa] Clic rápido, reiniciando temporizador...`);
    }

    timeoutGeocoding = setTimeout(async () => {
      console.log(`[Mapa] Buscando información del terreno tocado...`);
      
      // 1. Buscar Calle (Geocoding Inverso)
      if (typeof devFlags !== 'undefined' && devFlags.geocoding && typeof window.obtenerDireccionDesdeCoordenadas === 'function') {
        window.obtenerDireccionDesdeCoordenadas(window.selectedLat, window.selectedLng)
          .then(infoLugar => {
            if (campoDireccion && infoLugar.direccion) campoDireccion.value = infoLugar.direccion;
            if (campoDireccion) campoDireccion.placeholder = "Dirección / Calle";
          })
          .catch(err => {
            if (campoDireccion) campoDireccion.placeholder = "Fallo al buscar calle";
          });
      }

      // 2. Buscar Polígono e Información Catastral en Memoria Local
      if (esTerrenoNuevo) {
        if (typeof window.CatastroGIS !== 'undefined') {
          console.log(`[Mapa] Consultando capa GIS local...`);
          
          const datosGIS = await window.CatastroGIS.obtenerDatosPorCoordenada(window.selectedLat, window.selectedLng);
          
          if (datosGIS) {
            console.log(`[Mapa] ¡Parcela encontrada en memoria! Dibujando polígono...`);
            window.datosGisTemporales = datosGIS;

            // 🟢 AUTOCOMPLETAR CAMPOS DEL FORMULARIO
            const fDistrito = document.getElementById('f-distrito');
            if (fDistrito && datosGIS.distrito) fDistrito.value = datosGIS.distrito;

            const fIdGis = document.getElementById('f-idgis');
            if (fIdGis && datosGIS.idGis) fIdGis.value = datosGIS.idGis;

            // 🟢 Superficie: solo vista previa, cálculo local aproximado
            // (ver CatastroGIS.calcularSuperficieAproximada, GeoJson.js)
            // — el valor real lo calcula el backend al guardar.
            const fSuperficiePreview = document.getElementById('f-superficie-preview');
            if (fSuperficiePreview && datosGIS.geoJson) {
              const areaAprox = window.CatastroGIS.calcularSuperficieAproximada(datosGIS.geoJson);
              fSuperficiePreview.value = areaAprox ? `${areaAprox} m² (aprox.)` : "";
            }

            // Dibujar el perímetro rojo en el mapa
            if (window.Poligonos) window.Poligonos.dibujarFantasma(datosGIS.geoJson);

// 🟢 Sugerencia de frente/contrafrente (motorFrente.js) activada en
// producción. NO escribe en .value (eso sería autocompletar sin que el
// relevador lo note) — pone el valor sugerido como placeholder gris y
// lo guarda en data-sugerido. El fallback real (usar el sugerido si el
// relevador guardó sin completar el campo a mano) vive en
// obtenerDatosFormulario (formulario.js), no acá.
const contenedorFrenteSugerido = document.getElementById('frente-sugerido-container');
const fFrenteInput = document.getElementById('f-frente');
const fFondoInput = document.getElementById('f-fondo');

// 🟢 valorMetros null = el algoritmo no pudo determinar este lado con
// confianza. En ese caso NO ponemos ningún placeholder (no queremos un
// número dudoso ahí, ni disfrazado de "sugerencia") — solo un tooltip
// (title nativo) avisando por qué, si se pasa mensajeSinValor.
function _setSugerencia(input, valorMetros, mensajeSinValor) {
  if (!input) return;
  if (valorMetros === null || valorMetros === undefined) {
    input.placeholder = '';
    input.title = mensajeSinValor || '';
    delete input.dataset.sugerido;
    return;
  }
  const texto = String(valorMetros).replace('.', ',');
  input.dataset.sugerido = texto;
  input.placeholder = `Sugerido: ${texto}`;
  input.title = '';
}

if (window.MotorFrente && window.CapasCalles && datosGIS.geoJson && contenedorFrenteSugerido) {
    const anillo = window.MotorFrente._extraerAnilloExterior(datosGIS.geoJson);
    const callesCercanas = window.CapasCalles.obtenerCallesDeSeccion(window.selectedLat, window.selectedLng);

    if (anillo) {
        const resultado = window.MotorFrente.clasificarLados(anillo, callesCercanas);
        document.getElementById('frente-sugerido-texto').innerText = window.MotorFrente.formatearSugerencia(resultado);
        contenedorFrenteSugerido.style.display = '';

        // El frente debe ser paralelo a la calle y estar cerca (confianza alta)
        const frentes = resultado.filter(r => r.clasificacion === 'frente' && r.confianza === 'alta');
        const cantLados = resultado.length;

        if (frentes.length >= 2) {
            // 🟥 Esquina / doble frente real (2+ lados de confianza alta):
            // el campo "Contrafrente / Frente 2" recibe acá el segundo
            // frente real, no un contrafrente geométrico.
            frentes.sort((a, b) => b.largoMetros - a.largoMetros);

            _setSugerencia(fFrenteInput, frentes[0].largoMetros);
            _setSugerencia(fFondoInput, frentes[1].largoMetros);

        } else if (frentes.length === 1) {
            // Hay 1 solo Frente claro. Lo sugerimos siempre.
            const frentePrincipal = frentes[0];
            const posFrente = resultado.indexOf(frentePrincipal);

            _setSugerencia(fFrenteInput, frentePrincipal.largoMetros);

            // Evaluamos la forma estructural para decidir sobre el Contrafrente
            if (cantLados === 4) {
                // 🟩 Lote regular (4 lados): tomamos topológicamente el
                // lado opuesto exacto (saltando 2 posiciones) como contrafrente.
                const posFondo = (posFrente + 2) % 4;
                const ladoFondo = resultado[posFondo];
                _setSugerencia(fFondoInput, ladoFondo ? ladoFondo.largoMetros : null, 'No se pudo determinar el contrafrente automáticamente — completar a mano.');

            } else {
                // 🟨 Triangular (3 lados) o irregular (5+): sin
                // contrafrente claro, no sugerimos nada en ese campo.
                _setSugerencia(fFondoInput, null, 'No se pudo determinar el contrafrente automáticamente (lote no es de 4 lados) — completar a mano.');
            }
        } else {
            // ⬛ Sin frentes claros (ningún lado paralelo/cercano a una calle)
            _setSugerencia(fFrenteInput, null, 'No se detectó ningún lado claramente paralelo a una calle cercana — completar a mano.');
            _setSugerencia(fFondoInput, null, 'No se detectó ningún lado claramente paralelo a una calle cercana — completar a mano.');
        }
    }
} else if (contenedorFrenteSugerido) {
    contenedorFrenteSugerido.style.display = 'none';
    _setSugerencia(fFrenteInput, null);
    _setSugerencia(fFondoInput, null);
}
          } else {
            console.log(`[Mapa] No se encontró parcela en esta ubicación.`);
            window.datosGisTemporales = null;
          }
        } else {
          console.error(`[Mapa] ❌ ERROR: Módulo window.CatastroGIS no inicializado.`);
        }
      }
    }, 200); // ⚡ Reducido a 200ms ya que la búsqueda local es casi instantánea
  }
}

window.iniciarEdicionDirecta = function (terrenoOrId) {
  if (map) map.closePopup();

  let terreno = terrenoOrId;
  if (typeof terrenoOrId === 'string' || typeof terrenoOrId === 'number') {
    terreno = window.terrenosCache ? window.terrenosCache[terrenoOrId] : null;
  }

  if (!terreno) {
    console.error("❌ [Editor] No se encontraron datos para el terreno:", terrenoOrId);
    if (typeof DevTrace !== 'undefined' && DevTrace.error) {
      DevTrace.error(`No se encontraron datos del terreno a editar (${terrenoOrId})`);
    }
    return;
  }

  window.selectedLat = terreno.lat;
  window.selectedLng = terreno.lng;
  window.actualizarPinFantasmaDesdeFormulario();

  if (window.Editor) {
    window.Editor.abrirParaEdicion(terreno);
  }
};

// ==========================================
// HERRAMIENTAS ADICIONALES (GPS, Toasts)
// ==========================================

function mostrarInstruccion(mensaje) {
  const toast = document.getElementById('loading-toast');
  const msgText = document.getElementById('toast-msg');
  if (toast && msgText) {
    toast.className = 'toast-container instruction-toast visible';
    msgText.innerText = mensaje;
  }
}

function ocultarInstruccion() {
  const toast = document.getElementById('loading-toast');
  if (toast) {
    toast.classList.remove('visible', 'instruction-toast');
  }
}

// ==========================================
// PILA DE NOTIFICACIONES DE CARGA
// A diferencia del cartel de instrucciones (uno solo), acá pueden convivir
// varias notificaciones al mismo tiempo sin pisarse: cada mostrarToast()
// agrega una tarjeta nueva a la pila y devuelve un id. Guardá ese id y
// pasáselo a ocultarToast(id) para cerrar justo esa notificación. Si no se
// pasa id (compatibilidad con llamadas existentes), se cierra la más
// antigua todavía visible.
// ==========================================
let contadorToasts = 0;

function mostrarToast(mensaje) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return null;

  const idToast = 'toast-' + (++contadorToasts);
  const item = document.createElement('div');
  item.id = idToast;
  item.className = 'toast-item';
  item.innerHTML = `<span class="toast-item-spinner"></span><span class="toast-item-msg"></span>`;
  item.querySelector('.toast-item-spinner').innerHTML = (typeof Iconos !== 'undefined' && Iconos.spinner) ? Iconos.spinner() : '';
  item.querySelector('.toast-item-msg').innerText = mensaje;

  stack.appendChild(item);
  // Fuerza el "entrar deslizándose": si agregáramos la clase 'visible' en
  // el mismo instante que se crea el elemento, el navegador no anima la
  // transición (no hay un estado inicial distinto que animar desde).
  requestAnimationFrame(() => item.classList.add('visible'));

  // 🟢 Salvaguarda: si nadie cierra este toast explícitamente, se
  // autocierra a los 6s para que no quede pegado en pantalla para siempre.
  setTimeout(() => ocultarToast(idToast), 6000);

  return idToast;
}

function ocultarToast(idToast) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const item = (idToast && document.getElementById(idToast)) || stack.querySelector('.toast-item');
  if (!item) return;

  item.classList.remove('visible');
  item.classList.add('saliendo');
  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 300); // debe coincidir con la transición CSS de .toast-item
}

function obtenerUbicacionActual() {
  if (!navigator.geolocation) {
    alert("Tu navegador no soporta geolocalización.");
    return;
  }
  const idToast = mostrarToast("Obteniendo ubicación GPS...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      userLocationMarker = L.circleMarker([lat, lng], {
        radius: 9, fillColor: '#1a73e8', color: '#FFFFFF', weight: 3, opacity: 1, fillOpacity: 0.9
      }).addTo(map);
      map.setView([lat, lng], 16);
      ocultarToast(idToast);
    },
    (err) => {
      alert("No se pudo obtener tu ubicación actual.");
      ocultarToast(idToast);
    },
    { enableHighAccuracy: true }
  );
}