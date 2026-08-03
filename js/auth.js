// ==========================================
// MÓDULO 1: SEGURIDAD Y LOGIN (BLINDADO)
// ==========================================
const CLIENT_ID = "320507378351-hkvsd05ap7s30jpn0uv6k0q1domvde6f.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
let tokenClient;

function inicializarAuth() {
  // Verificamos si ya hay un token guardado para saltar el login
  const token = obtenerToken();
  if (token) {
    // ✅ CORRECCIÓN: Inyectamos el token en window para que drive.js y api.js lo encuentren
    window.gapiToken = token;
    iniciarApp();
    obtenerDatosUsuarioYConectarPresencia(token);
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
    tokenPromiseResolver = resolve; // Guardamos la resolución de la promesa

    // Al no pasar 'prompt: consent', Google suele renovarlo silenciosamente 
    // o con un popup que se cierra casi al instante.
    tokenClient.requestAccessToken({ prompt: '' });
  });
};

// Obtiene Nombre, Email y Foto de perfil desde Google UserInfo para el módulo de Presencia
async function obtenerDatosUsuarioYConectarPresencia(accessToken) {
  try {
    const respuesta = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (respuesta.ok) {
      const usuarioGoogle = await respuesta.json();
      // Conectar con el módulo de presencia si la función existe
      if (typeof inicializarPresencia === 'function') {
        inicializarPresencia(usuarioGoogle);
      }
    } else {
      console.warn("No se pudieron obtener los datos de usuario de Google UserInfo.");
    }
  } catch (error) {
    console.error("Error al consultar perfil del usuario:", error);
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