// ==========================================
// MÓDULO 4: ORQUESTADOR PRINCIPAL
// ==========================================

window.onload = function () {
  console.log("⚙️ Página cargada. Inicializando Auth...");
  inicializarAuth();
};

// UTILIDAD GLOBAL: Detección por proporción (Igual que CSS)
function esModoHorizontal() {
  // Evaluamos la misma regla CSS. Si NO cumple max-aspect-ratio 1/1, es horizontal.
  return !window.matchMedia("(max-aspect-ratio: 1/1)").matches;
}

// También podemos exponérsela a window para que los demás módulos la consulten si quieren
window.esModoHorizontal = esModoHorizontal;

// UTILIDAD GLOBAL: Traductor de datos a interfaz visual (Pin)
window.obtenerAtributosPin = function (estado, visitado, calificacion, esFantasma) {
  // 1. Si es el Pin Fantasma mientras se cargan datos -> GRIS
  if (esFantasma) {
    return {
      colorHex: '#9aa0a6',
      forma: (estado && estado.toLowerCase().includes('constru')) ? 'casa' : 'gota',
      visitado: false,
      tachado: false
    };
  }

  const califUpper = String(calificacion || '').trim().toUpperCase();
  const visitadoBool = String(visitado || '').trim().toLowerCase() === 'sí' || String(visitado || '').trim().toLowerCase() === 'si';
  const esConstruccion = (estado && estado.toLowerCase().includes('constru'));

  let colorHex = '#9aa0a6'; // Gris por defecto (para cuando no es ni FAVORABLE ni DESFAVORABLE)
  let tachado = false;

  // 2. Evaluación de la Columna U (Calificación)
  if (califUpper.includes('DESCARTADO')) {
    colorHex = '#ea4335'; // Rojo
    tachado = true;      // Flag para tachar
  } else if (califUpper.includes('DESFAVORABLE')) {
    colorHex = '#ea4335'; // Rojo
    tachado = false;
  } else if (califUpper.includes('FAVORABLE')) {
    colorHex = '#34a853'; // Verde (Se mantiene VERDE tanto si fue visitado como si NO)
    tachado = false;
  }

  return {
    colorHex: colorHex,
    forma: esConstruccion ? 'casa' : 'gota',
    visitado: visitadoBool,
    tachado: tachado
  };
};

// NUEVA FUNCIÓN: Inyecta los SVGs en el DOM
function cargarIconosUI() {
  const icoSpinner = document.getElementById('icono-spinner');
  if (icoSpinner) icoSpinner.innerHTML = Iconos.spinner();

  const icoAgregar = document.getElementById('icono-agregar');
  if (icoAgregar) icoAgregar.innerHTML = Iconos.agregar();

  const icoGps = document.getElementById('icono-gps');
  if (icoGps) icoGps.innerHTML = Iconos.gps();

  const icoRegla = document.getElementById('icono-regla');
  if (icoRegla) icoRegla.innerHTML = Iconos.regla();

  const icoLogout = document.getElementById('icono-logout');
  if (icoLogout && typeof Iconos !== 'undefined' && Iconos.salir) {
    icoLogout.innerHTML = Iconos.salir();
  }

  // Mantenemos el chequeo defensivo por si el panel DEV está activo o no
  const icoDev = document.getElementById('icono-dev');
  if (icoDev && typeof Iconos !== 'undefined' && Iconos.dev) {
    icoDev.innerHTML = Iconos.dev();
  }
  const contenedorIconoSecciones = document.getElementById('icono-secciones');
  if (contenedorIconoSecciones && typeof Iconos !== 'undefined' && Iconos.capas) {
    contenedorIconoSecciones.innerHTML = Iconos.capas();
  }

  const contenedorIconoParcelas = document.getElementById('icono-overlay-parcelas');
  if (contenedorIconoParcelas && typeof Iconos !== 'undefined' && Iconos.parcelas) {
    contenedorIconoParcelas.innerHTML = Iconos.parcelas();
  }
}

async function iniciarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';

  // 1. Inyectamos los iconos en la barra
  cargarIconosUI();

  // 2. Iniciamos el mapa
  inicializarMapa();

  // 🟢 3. DESCARGA AUTOMÁTICA DE CAPAS GEOJSON DESDE DRIVE
  if (window.CapasDrive) {
    window.CapasDrive.sincronizarCapas();
  }

  // 4. Descargar datos de terrenos (Sheets)
  await descargarYCruzarDatos();

  // 5. Reconstruir los menúes desplegables
  if (typeof construirFormularioDinamico === 'function') {
    construirFormularioDinamico();
  }
}

// ==========================================
// AUTO-SINCRONIZACIÓN DE FONDO (POLLING)
// ==========================================

// ==========================================
// AUTO-SINCRONIZACIÓN DE FONDO (POLLING)
// ==========================================

// Temporizador de 30 segundos para refrescar datos desde Google Sheets
const INTERVALO_REFRESCO_MS = 30 * 1000;

setInterval(() => {
  // Verificamos si devFlags permite la sincro y si la función existe
  const syncPermitida = typeof devFlags === 'undefined' || devFlags.sync;

  if (syncPermitida && typeof descargarYCruzarDatos === 'function') {
    // Le pasamos 'true' para que se ejecute en segundo plano sin abrir el Toast
    descargarYCruzarDatos(true);
  }

  // 🟢 NUEVO: Disparar el procesador de la cola de fotos rezagadas
  if (syncPermitida && typeof window.ProcesarColaFotos === 'function') {
    window.ProcesarColaFotos();
  }

}, INTERVALO_REFRESCO_MS);