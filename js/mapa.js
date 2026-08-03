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
window.datosGisTemporales = null; // 🟢 Memoria RAM para el polígono que estamos por agregar

// Regla y GPS
let modoRegla = false;
let reglaPuntos = [];
let reglaLinea = null;
let userLocationMarker = null;

// Variables para las capas del mapa
let capaOSM;
let capaGoogleSatelite;
let modoSatelite = false;

function inicializarMapa() {
  if (map) return;

  // Removidos los botones de zoom (+/-) de Leaflet
  map = L.map('map', { zoomControl: false }).setView([-27.362, -55.890], 13);

  // 1. Capa estándar OpenStreetMap
  capaOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
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
}

// 🟢 FUNCIÓN PARA CONMUTAR CAPAS DESDE TU DOCK
function toggleCapasMapa() {
  modoSatelite = !modoSatelite;
  const btn = document.getElementById('btn-satelite');

  if (modoSatelite) {
    map.removeLayer(capaOSM);
    capaGoogleSatelite.addTo(map);
    if (btn) btn.classList.add('herramienta-activa');
    if (typeof mostrarToast === 'function') mostrarToast("Modo Satelital activado");
  } else {
    map.removeLayer(capaGoogleSatelite);
    capaOSM.addTo(map);
    if (btn) btn.classList.remove('herramienta-activa');
    if (typeof mostrarToast === 'function') mostrarToast("Modo Mapa activado");
  }

  setTimeout(() => {
    if (typeof ocultarToast === 'function') ocultarToast();
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

  const popupContent = `
    <div class="popup-terreno-container">
      ${carruselPopupHTML}
      <h3 class="popup-titulo">${id}</h3>
      ${tagsHTML}
      <p class="popup-direccion">${direccion}</p>
      <hr class="popup-divider">
      
      <div class="popup-datos">
        ${ficha.distrito || ficha.barrio ? `<b>Ubicación:</b> ${ficha.distrito || '-'} / ${ficha.barrio || '-'}<br>` : ''}
        ${ficha.frente || ficha.fondo ? `<b>Medidas:</b> ${ficha.frente || '-'}m x ${ficha.fondo || '-'}m<br>` : ''}
        ${ficha.tipolote ? `<b>Tipo Lote:</b> ${ficha.tipolote}<br>` : ''}
        ${ficha.agua || ficha.cloaca ? `<b>Servicios:</b> Agua: ${ficha.agua || 'No'} | Cloaca: ${ficha.cloaca || 'No'}<br>` : ''}
        ${ficha.propietario ? `<b>Propietario:</b> ${ficha.propietario}<br>` : ''}
        ${ficha.contacto ? `<b>Contacto:</b> ${ficha.contacto}<br>` : ''}
        ${ficha.notas ? `<b>Notas:</b> <span class="popup-notas">${ficha.notas}</span><br>` : ''}
      </div>

      <button class="btn-popup-editar" onclick="window.iniciarEdicionDirecta('${id}')">✏️ Editar Terreno</button>
    </div>
  `;

  marker.bindPopup(popupContent);
  marker.on('click', function () { terrenoSeleccionadoActual = terrenoCompleto; });
  markersGroup.addLayer(marker);
}

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
    if (modoRegla) toggleRegla();
    if (window.Editor) window.Editor.cerrar(false);
    mostrarInstruccion("Toca una ubicación en el mapa para ubicar el terreno");
  } else {
    if (btn) btn.classList.remove('herramienta-activa'); 
    ocultarToast();
  }
}

function onMapClick(e) {
  if (modoRegla) {
    reglaPuntos.push(e.latlng);
    if (reglaPuntos.length === 2) {
      const distMetros = reglaPuntos[0].distanceTo(reglaPuntos[1]);
      const distTexto = distMetros > 1000
        ? `${(distMetros / 1000).toFixed(2)} km`
        : `${distMetros.toFixed(1)} m`;

      if (reglaLinea) map.removeLayer(reglaLinea);
      reglaLinea = L.polyline(reglaPuntos, { color: '#fbbc04', weight: 4, dashArray: '6, 8' }).addTo(map);
      mostrarInstruccion(`Distancia: ${distTexto}`);
      reglaPuntos = [];
    }
    return;
  }

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

            const fSeccion = document.getElementById('f-seccion');
            if (fSeccion && datosGIS.seccion) fSeccion.value = datosGIS.seccion;

            const fChacra = document.getElementById('f-chacra');
            if (fChacra && datosGIS.chacra) fChacra.value = datosGIS.chacra;

            const fManzana = document.getElementById('f-manzana');
            if (fManzana && datosGIS.manzana) fManzana.value = datosGIS.manzana;

            const fParcela = document.getElementById('f-parcela');
            if (fParcela && datosGIS.parcela) fParcela.value = datosGIS.parcela;

            // Dibujar el perímetro rojo en el mapa
            if (window.Poligonos) window.Poligonos.dibujarFantasma(datosGIS.geoJson);
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
// HERRAMIENTAS ADICIONALES (GPS, Regla, Toasts)
// ==========================================

function mostrarInstruccion(mensaje) {
  const toast = document.getElementById('loading-toast');
  const msgText = document.getElementById('toast-msg');
  if (toast && msgText) {
    toast.className = 'toast-container instruction-toast visible';
    msgText.innerText = mensaje;
  }
}

function mostrarToast(mensaje) {
  const toast = document.getElementById('loading-toast');
  const msgText = document.getElementById('toast-msg');
  if (toast && msgText) {
    toast.className = 'toast-container visible';
    msgText.innerText = mensaje;
  }
}

function ocultarToast() {
  const toast = document.getElementById('loading-toast');
  if (toast) {
    toast.classList.remove('visible', 'instruction-toast');
  }
}

function obtenerUbicacionActual() {
  if (!navigator.geolocation) {
    alert("Tu navegador no soporta geolocalización.");
    return;
  }
  mostrarToast("Obteniendo ubicación GPS...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      userLocationMarker = L.circleMarker([lat, lng], {
        radius: 9, fillColor: '#1a73e8', color: '#FFFFFF', weight: 3, opacity: 1, fillOpacity: 0.9
      }).addTo(map);
      map.setView([lat, lng], 16);
      ocultarToast();
    },
    (err) => {
      alert("No se pudo obtener tu ubicación actual.");
      ocultarToast();
    },
    { enableHighAccuracy: true }
  );
}

function toggleRegla() {
  modoRegla = !modoRegla;
  const btn = document.getElementById('btn-ruler');

  if (modoRegla) {
    if (window.modoAgregar) toggleAddMode();
    if (btn) btn.classList.add('herramienta-activa');
    mostrarInstruccion("Haz clic en dos puntos del mapa para medir la distancia");
    limpiarRegla();
  } else {
    if (btn) btn.classList.remove('herramienta-activa');
    limpiarRegla();
    ocultarToast();
  }
}

function limpiarRegla() {
  reglaPuntos = [];
  if (reglaLinea && map) {
    map.removeLayer(reglaLinea);
    reglaLinea = null;
  }
}