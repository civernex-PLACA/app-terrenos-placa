// ==========================================
// MÓDULO: PRESENCIA MULTIUSUARIO EN TIEMPO REAL
// ==========================================

// ⚠️ REEMPLAZA ESTOS DOS VALORES CON TUS CREDENCIALES DE SUPABASE:
const SUPABASE_URL = 'https://ysdcoglbdtxgmlinlcax.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_O1VZAK-d01drI4JgexkUjw__XiC-ZhH';

let supabaseClient = null;
let presenciaChannel = null;
let ultimoContactoUsuario = Date.now();

// ⏱️ TIEMPO DE INACTIVIDAD CONFIGURADO A 1 MINUTO
const TIEMPO_INACTIVIDAD_MS = 1 * 60 * 1000;

// 1. INICIALIZAR EL SISTEMA DE PRESENCIA AL LOGUEARSE
function inicializarPresencia(usuarioGoogle) {
  if (!window.supabase) {
    console.warn("Librería de Supabase no cargada en index.html.");
    return;
  }

  if (SUPABASE_URL.includes('TU_PROYECTO')) {
    console.warn("Presencia deshabilitada: Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en js/presencia.js");
    return;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // Si ya existía un canal previo, nos desuscribimos antes de crear uno nuevo
  if (presenciaChannel) {
    supabaseClient.removeChannel(presenciaChannel);
  }

  // Crear canal de presencia efímero en tiempo real
  presenciaChannel = supabaseClient.channel('estudio_terrenos_presencia', {
    config: {
      presence: {
        key: usuarioGoogle.email, // Clave única por usuario
      },
    },
  });

  // 🔴 IMPORTANTE: Los eventos .on() SIEMPRE van ANTES de .subscribe()
  presenciaChannel
    .on('presence', { event: 'sync' }, () => {
      const estadoGlobal = presenciaChannel.presenceState();
      renderizarAvatarStack(estadoGlobal);
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      const estadoGlobal = presenciaChannel.presenceState();
      renderizarAvatarStack(estadoGlobal);
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      const estadoGlobal = presenciaChannel.presenceState();
      renderizarAvatarStack(estadoGlobal);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Una vez suscrito exitosamente, transmitimos nuestro estado
        await transmitirEstadoPresencia(usuarioGoogle, 'activo');
        configurarDetectoresActividad(usuarioGoogle);
      }
    });
}

// 2. TRANSMITIR ESTADO ACTUAL (ACTIVO O IDLE)
async function transmitirEstadoPresencia(usuarioGoogle, estado) {
  if (!presenciaChannel) return;

  await presenciaChannel.track({
    nombre: usuarioGoogle.name || usuarioGoogle.given_name || usuarioGoogle.email.split('@')[0],
    email: usuarioGoogle.email,
    foto: usuarioGoogle.picture || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png',
    estado: estado, // 'activo' o 'idle'
    ultimaActividad: Date.now()
  });
}

// 3. DETECTAR INTERACCIONES DEL USUARIO (REGISTRO DE PINGS)
function configurarDetectoresActividad(usuarioGoogle) {
  let estadoActual = 'activo';

  const resetInactividad = () => {
    const ahora = Date.now();
    
    // Si estaba inactivo o pasaron más de 10 segundos desde el último toque, volvemos a 'activo'
    if (estadoActual === 'idle' || (ahora - ultimoContactoUsuario > 10000)) {
      ultimoContactoUsuario = ahora;
      estadoActual = 'activo';
      transmitirEstadoPresencia(usuarioGoogle, 'activo');
    } else {
      ultimoContactoUsuario = ahora;
    }
  };

  // Escuchar toques en la pantalla, clics y teclas
  window.addEventListener('click', resetInactividad);
  window.addEventListener('touchstart', resetInactividad);
  window.addEventListener('keydown', resetInactividad);

  // Verificación en segundo plano cada 10 segundos para evaluar si pasó a Inactivo (>1 min)
  setInterval(() => {
    if (estadoActual === 'activo' && (Date.now() - ultimoContactoUsuario >= TIEMPO_INACTIVIDAD_MS)) {
      estadoActual = 'idle';
      transmitirEstadoPresencia(usuarioGoogle, 'idle');
    }
  }, 10000);
}

// 4. RENDERIZAR LOS AVATARES APILADOS EN LA ESQUINA SUPERIOR DERECHA
function renderizarAvatarStack(presenceState) {
  const container = document.getElementById('avatar-stack');
  if (!container) return;

  container.innerHTML = '';

  // Iterar sobre todos los usuarios con sesión activa
  Object.keys(presenceState).forEach((key) => {
    const listaPresencia = presenceState[key];
    if (listaPresencia && listaPresencia.length > 0) {
      const datosUsuario = listaPresencia[0]; // Datos de la sesión activa del usuario

      const avatarDiv = document.createElement('div');
      avatarDiv.className = `avatar-item ${datosUsuario.estado === 'idle' ? 'idle' : ''}`;
      
      const textoEstado = datosUsuario.estado === 'idle' ? 'Inactivo' : 'En línea';
      avatarDiv.setAttribute('data-nombre', `${datosUsuario.nombre} (${textoEstado})`);

      avatarDiv.innerHTML = `
        <img class="avatar-img" src="${datosUsuario.foto}" alt="${datosUsuario.nombre}" />
        <span class="avatar-status-dot"></span>
      `;

      container.appendChild(avatarDiv);
    }
  });
}