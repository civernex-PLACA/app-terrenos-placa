// ==========================================
// MÓDULO 1: SEGURIDAD Y LOGIN (BLINDADO)
// ==========================================
const CLIENT_ID = "320507378351-hkvsd05ap7s30jpn0uv6k0q1domvde6f.apps.googleusercontent.com";
// 🟢 Scopes reducidos: antes usaba 'drive' completo (lectura Y escritura de
// TODO el Drive del usuario). 'drive.readonly' alcanza para leer las capas
// catastrales que ya existen en Drive (capasDrive.js) y 'drive.file' alcanza
// para crear/escribir solo los archivos que la app misma genera (fotos.js).
// Ninguno de los dos permite modificar o borrar archivos ajenos del usuario.
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
let tokenClient;

async function inicializarAuth() {
  // Verificamos si ya hay un token guardado para saltar el login
  const token = obtenerToken();
  if (!token) return; // sin token: la pantalla de login ya está visible por default (CSS)

  // ✅ CORRECCIÓN: Inyectamos el token en window para que drive.js y api.js lo encuentren
  window.gapiToken = token;

  // 🟢 Validamos el token guardado ANTES de abrir la app: un token viejo
  // en localStorage no garantiza que siga siendo válido (pasó la hora,
  // o el usuario revocó el acceso). Si `fetchConAuth` no lo puede
  // renovar solo, nos quedamos en la pantalla de login en vez de abrir
  // un mapa vacío sin pines y sin ninguna explicación de por qué.
  const sesionValida = await obtenerDatosUsuarioYConectarPresencia(token);
  if (!sesionValida) {
    _volverAPantallaLogin();
    return;
  }

  iniciarApp();
  _programarRenovacionProactiva();
}

// 🟢 Renovación proactiva: los tokens de Google duran ~1h. Antes solo se
// renovaban de forma "reactiva" (cuando una petición ya fallaba con 401,
// ver fetchConAuth), lo que corta en medio de una acción del relevador
// (ej. a mitad de subir fotos). Este timer pide uno nuevo cada 45 min
// mientras la app sigue abierta, para que la renovación pase de fondo
// entre acciones en vez de durante una. No reemplaza el reintento por
// 401 (fetchConAuth lo sigue teniendo como red de seguridad) — sigue sin
// poder evitar el re-login manual si la sesión de Google del navegador
// en sí ya venció (ver CLAUDE.md, sección de autenticación) — en ese
// caso, igual que en cualquier otra renovación fallida, se vuelve a la
// pantalla de login (ver _volverAPantallaLogin).
let _intervaloRenovacionProactiva = null;
function _programarRenovacionProactiva() {
  if (_intervaloRenovacionProactiva) return; // ya programado, no duplicar
  _intervaloRenovacionProactiva = setInterval(async () => {
    console.log("🔄 [Auth] Renovación proactiva de token (cada 45 min)...");
    const nuevoToken = await window.renovarToken();
    if (!nuevoToken) _volverAPantallaLogin();
  }, 45 * 60 * 1000);
}

// 🟢 Punto único para "no hay token válido y no se pudo renovar solo":
// limpia el token guardado, corta el timer de renovación proactiva, y
// vuelve a mostrar la pantalla de login — sin importar si el fallo pasó
// al abrir la app por primera vez, en medio de una sincronización de
// fondo, o durante una acción del relevador. Antes cada lugar (o
// ninguno) decidía qué hacer con un token muerto, y en varios casos no
// se hacía nada visible (ver CLAUDE.md, "mapa vacío sin pines").
//
// 🟢 Dos variantes visuales (2026-08-06), según si el relevador ya
// estaba trabajando con el mapa abierto o no:
// - Mid-trabajo (#app-content ya estaba en 'block'): el mapa/formulario
//   NO se ocultan — quedan de fondo, atenuados y difuminados
//   (backdrop-filter, ver estilos.css ".modo-popup"), con el login
//   flotando como popup encima. La idea es que quede claro que el
//   trabajo sigue ahí, no un "se perdió todo y hay que arrancar de
//   nuevo". Reemplaza al alert() bloqueante que había antes.
// - Primera vez / token vencido antes de abrir la app (#app-content
//   nunca llegó a mostrarse): pantalla completa de siempre, sin blur.
//   Al loguearse de nuevo, `iniciarApp()` hace una carga completa
//   (mapa, capas, pines) como cualquier primer arranque.
function _volverAPantallaLogin() {
  const pantallaLogin = document.getElementById('login-screen');
  const contenidoApp = document.getElementById('app-content');
  const mensajeReautenticacion = document.getElementById('login-mensaje-reautenticacion');

  const veniaDeLaAppAbierta = contenidoApp && contenidoApp.style.display === 'block';

  localStorage.removeItem('google_access_token');
  window.gapiToken = null;
  if (_intervaloRenovacionProactiva) {
    clearInterval(_intervaloRenovacionProactiva);
    _intervaloRenovacionProactiva = null;
  }

  if (pantallaLogin) {
    pantallaLogin.style.display = '';
    pantallaLogin.classList.toggle('modo-popup', veniaDeLaAppAbierta);
  }
  if (mensajeReautenticacion) {
    mensajeReautenticacion.style.display = veniaDeLaAppAbierta ? '' : 'none';
  }

  // 🟢 En el caso popup, #app-content queda visible a propósito (el
  // blur/atenuado de estilos.css lo cubre) — solo se oculta del todo en
  // el caso de pantalla completa, igual que antes.
  if (contenidoApp && !veniaDeLaAppAbierta) {
    contenidoApp.style.display = 'none';
  }
}

// Variable para capturar la promesa cuando intentamos renovar
let tokenPromiseResolver = null;

function prepararClienteGoogle() {
  if (!tokenClient) {
    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            localStorage.setItem('google_access_token', tokenResponse.access_token);
            window.gapiToken = tokenResponse.access_token;

            // Si estábamos renovando un token vencido...
            if (tokenPromiseResolver) {
              tokenPromiseResolver(tokenResponse.access_token);
              tokenPromiseResolver = null; // Limpiamos
            } else {
              // Si es un inicio de sesión normal por primera vez...
              iniciarApp();
              obtenerDatosUsuarioYConectarPresencia(tokenResponse.access_token);
              _programarRenovacionProactiva();
            }
          } else {
            // Si falló la renovación
            if (tokenPromiseResolver) {
              tokenPromiseResolver(null);
              tokenPromiseResolver = null;
            }
          }
        },
      });
    } catch (error) {
      console.error("Error al inicializar Google:", error);
    }
  }
}

function iniciarSesion() {
  if (typeof google === 'undefined' || !google.accounts) {
    alert("La librería de Google no ha podido cargar. Revisa tu conexión.");
    return;
  }
  prepararClienteGoogle();
  // Pedimos consentimiento explícito en el primer login
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// NUEVA FUNCIÓN GLOBAL PARA RENOVAR TOKEN EN PLENO VUELO
window.renovarToken = function () {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.accounts) {
      resolve(null);
      return;
    }
    console.warn("🔄 [Auth] Solicitando nuevo token a Google...");
    prepararClienteGoogle();

    // 🟢 Salvavidas: si Google nunca llama al callback (renovación
    // "silenciosa" bloqueada por el navegador — cookies de terceros
    // restringidas, PWA en el celular, ventana emergente bloqueada —
    // esto pasaba y quedaba colgado para siempre: ni resolvía con token
    // ni con null, y todo lo que esperaba esta promesa (fetchConAuth,
    // la validación al abrir la app) se trababa sin ningún aviso —
    // mapa vacío, sin pines, sin pantalla de login. A los 8s sin
    // respuesta, damos la renovación por fallida.
    let yaResolvio = false;
    const resolverUnaVez = (valor) => {
      if (yaResolvio) return;
      yaResolvio = true;
      tokenPromiseResolver = null;
      resolve(valor);
    };
    tokenPromiseResolver = resolverUnaVez;
    setTimeout(() => resolverUnaVez(null), 8000);

    // Al no pasar 'prompt: consent', Google suele renovarlo silenciosamente
    // o con un popup que se cierra casi al instante.
    tokenClient.requestAccessToken({ prompt: '' });
  });
};

/**
 * Helper centralizado para fetch con autenticación Google y renovación automática.
 * @param {string} url - URL del recurso.
 * @param {object} options - Opciones del fetch original.
 * @returns {Promise<Response>} - Promesa del fetch.
 */
window.fetchConAuth = async function (url, options = {}) {
  // Aseguramos que el objeto headers exista
  options.headers = options.headers || {};

  // Función interna para aplicar el token actual a las cabeceras
  const aplicarToken = () => {
    const token = obtenerToken() || window.gapiToken;
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  };

  aplicarToken();

  try {
    let respuesta = await fetch(url, options);

    // Si detectamos 401 (Unauthorized), intentamos renovar
    if (respuesta.status === 401) {
      console.warn(`⚠️ [Auth] 401 detectado en ${url}. Intentando renovar token...`);
      const nuevoToken = await window.renovarToken();

      if (nuevoToken) {
        console.log("✅ [Auth] Token renovado. Reintentando petición...");
        aplicarToken(); // Aplicamos el nuevo token a las cabeceras
        respuesta = await fetch(url, options);
      } else {
        console.error("❌ [Auth] No se pudo renovar el token. Sesión expirada.");
        _volverAPantallaLogin();
      }
    }

    return respuesta;
  } catch (error) {
    console.error(`Error en fetchConAuth para ${url}:`, error);
    throw error;
  }
};


// Obtiene Nombre, Email y Foto de perfil desde Google UserInfo para el
// módulo de Presencia. Devuelve true/false — inicializarAuth lo usa para
// decidir si el token guardado sigue siendo válido antes de abrir la app.
async function obtenerDatosUsuarioYConectarPresencia(accessToken) {
  try {
    // 🟢 Usamos fetchConAuth (no fetch crudo) para que, si el token guardado
    // en localStorage ya venció (típico al reabrir la app después de un
    // rato cerrada), se renueve solo en vez de fallar en silencio.
    const respuesta = await window.fetchConAuth('https://www.googleapis.com/oauth2/v3/userinfo');

    if (respuesta.ok) {
      const usuarioGoogle = await respuesta.json();
      // Conectar con el módulo de presencia si la función existe
      if (typeof inicializarPresencia === 'function') {
        inicializarPresencia(usuarioGoogle);
      }
      return true;
    }
    console.warn("No se pudieron obtener los datos de usuario de Google UserInfo.");
    return false;
  } catch (error) {
    console.error("Error al consultar perfil del usuario:", error);
    return false;
  }
}

function cerrarSesion() {
  localStorage.removeItem('google_access_token');
  window.gapiToken = null; // Limpiamos también la variable global por seguridad
  location.reload();
}

function obtenerToken() {
  return localStorage.getItem('google_access_token');
}