// ==========================================
// MÓDULO 7: PANEL DEV Y DIAGNÓSTICO (dev.js)
// ==========================================

const DevModule = {
  // 🔘 INTERRUPTOR MASTER (Ponlo en 'false' cuando vayas a producción)
  ACTIVAR_DEV_MODE: false,

  flags: {
    geocoding: true,
    optimistic: true,
    sync: true,
    tags: true,
    fotos: true,
    // 🟡 Sugerencia de frente (motorFrente.js) — activada 2026-08-06 a
    // pedido explícito, ANTES de correr la validación formal contra los
    // casos reales de HALLAZGOS_mapa_calles.md (ver CLAUDE.md, "Frente
    // de lote"). El resultado en pantalla queda etiquetado "sin
    // validar" a propósito — usar esto en campo también sirve como
    // validación en vivo mientras se decide si el criterio aguanta.
    frenteSugerido: true
  },

  backups: {},

  init: function () {
    // Si el modo DEV está desactivado, el módulo se apaga por completo
    if (!this.ACTIVAR_DEV_MODE) return;

    // 1. Guardar respaldos de funciones globales para simular caídas
    if (typeof window.Tags !== 'undefined') this.backups.Tags = window.Tags;
    if (typeof window.Fotos_renderizarCarruselHTML === 'function') this.backups.Fotos_renderizarCarruselHTML = window.Fotos_renderizarCarruselHTML;
    if (typeof window.Fotos_abrirVisorHD === 'function') this.backups.Fotos_abrirVisorHD = window.Fotos_abrirVisorHD;
    if (typeof window.obtenerDireccionDesdeCoordenadas === 'function') this.backups.obtenerDireccionDesdeCoordenadas = window.obtenerDireccionDesdeCoordenadas;

    // 2. Inyectar HTML del Panel Modal directamente en el DOM (CSS maneja los estilos)
    this.inyectarInterfazDEV();

    // 3. Atajo secreto de teclado: Presiona "Shift + D" para abrir/cerrar el panel
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        this.toggleModal();
      }
    });

    console.log("🛠️ DevModule Activado. Usa 'Shift + D' para abrir el panel de diagnóstico.");
  },

  inyectarInterfazDEV: function () {
    if (document.getElementById('modal-dev')) return;

    // Inyectar HTML Modal 100% limpio sin tags <style> inline
    const modalHTML = document.createElement('div');
    modalHTML.id = 'modal-dev';
    modalHTML.className = 'dev-modal-overlay';
    modalHTML.style.display = 'none';
    modalHTML.innerHTML = `
      <div class="dev-modal-card">
        <h3>⚙️ Panel Diagnóstico & Módulos</h3>
        <p>Enciende o destruye módulos en vivo para probar resiliencia. (Atajo: Shift + D)</p>
        
        <div class="dev-switch-item">
          <span>📍 Geocodificación (Búsqueda Calle)</span>
          <input type="checkbox" id="dev-geocoding" checked onchange="DevModule.toggleModulo('geocoding')">
        </div>

        <div class="dev-switch-item">
          <span>📺 Monitor de Layout en vivo</span>
          <input type="checkbox" id="toggle-monitor-layout" onchange="toggleMonitorOrientacion(this)">
        </div>

        <div class="dev-switch-item">
          <span>👻 Pin Fantasma (UI Optimista)</span>
          <input type="checkbox" id="dev-optimistic" checked onchange="DevModule.toggleModulo('optimistic')">
        </div>
        <div class="dev-switch-item">
          <span>🔄 Sincronización Automática</span>
          <input type="checkbox" id="dev-sync" checked onchange="DevModule.toggleModulo('sync')">
        </div>
        <div class="dev-switch-item">
          <span>🏷️ Módulo de Tags</span>
          <input type="checkbox" id="dev-tags" checked onchange="DevModule.toggleModulo('tags')">
        </div>
        <div class="dev-switch-item">
          <span>📸 Módulo de Fotos & Lightbox</span>
          <input type="checkbox" id="dev-fotos" checked onchange="DevModule.toggleModulo('fotos')">
        </div>

        <button onclick="DevModule.cerrarPanel()" class="dev-btn-cerrar">Cerrar Panel</button>
      </div>
    `;
    document.body.appendChild(modalHTML);
  },

  toggleModal: function () {
    if (!this.ACTIVAR_DEV_MODE) return;
    const modal = document.getElementById('modal-dev');
    if (!modal) return;

    if (modal.style.display === 'none') {
      this.abrirPanel();
    } else {
      this.cerrarPanel();
    }
  },

  abrirPanel: function () {
    if (!this.ACTIVAR_DEV_MODE) return;
    const modal = document.getElementById('modal-dev');
    if (!modal) return;

    Object.keys(this.flags).forEach(modulo => {
      const check = document.getElementById(`dev-${modulo}`);
      if (check) check.checked = this.flags[modulo];
    });

    modal.style.display = 'flex';
  },

  cerrarPanel: function () {
    const modal = document.getElementById('modal-dev');
    if (modal) modal.style.display = 'none';
  },

  toggleModulo: function (modulo) {
    if (!this.ACTIVAR_DEV_MODE) return;
    const checkbox = document.getElementById(`dev-${modulo}`);
    if (!checkbox) return;

    this.flags[modulo] = checkbox.checked;
    const activo = this.flags[modulo];

    switch (modulo) {
      case 'tags':
        if (activo) window.Tags = this.backups.Tags;
        else delete window.Tags;
        break;

      case 'fotos':
        if (activo) {
          window.Fotos_renderizarCarruselHTML = this.backups.Fotos_renderizarCarruselHTML;
          window.Fotos_abrirVisorHD = this.backups.Fotos_abrirVisorHD;
        } else {
          delete window.Fotos_renderizarCarruselHTML;
          delete window.Fotos_abrirVisorHD;
        }
        break;

      case 'geocoding':
        if (activo) window.obtenerDireccionDesdeCoordenadas = this.backups.obtenerDireccionDesdeCoordenadas;
        else delete window.obtenerDireccionDesdeCoordenadas;
        break;
    }

    const estadoTexto = activo ? 'CONECTADO 🟢' : 'DESTRUIDO 🔴';
    if (typeof mostrarToast === 'function') {
      const idToast = mostrarToast(`Módulo ${modulo.toUpperCase()}: ${estadoTexto}`);
      setTimeout(() => ocultarToast(idToast), 1800);
    }
  }
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => DevModule.init());

// Exposición limpia de alias en window
window.DevModule = DevModule;
window.devFlags = DevModule.flags;