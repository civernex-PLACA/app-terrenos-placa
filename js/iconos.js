// ==========================================
// MÓDULO: DICCIONARIO DE ÍCONOS SVG
// ==========================================

const Iconos = {
  // MOTOR DINÁMICO DE PINES (Soporta Favorables, Desfavorables, Pendientes y Descartados/Tachados)
  generarPinDinamico: function({ colorHex, forma, visitado, tachado, esFantasma }) {
    const isConstruccion = (forma === 'casa');
    let innerSVG = "";

    if (isConstruccion) {
      if (visitado) {
        // Casa Visitada (Sólida con Tick)
        innerSVG = `<path d='M12 2L3 9h3v12h12V9h3L12 2z' stroke='#ffffff' stroke-width='1.5'/><path d='M9 14l2 2 4-4' stroke='#ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' fill='none'/>`;
      } else {
        // Casa No Visitada (Con Agujero en el centro)
        innerSVG = `<path fill-rule='evenodd' d='M12 2L3 9h3v12h12V9h3L12 2z M12 11c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z' stroke='#ffffff' stroke-width='1.5'/>`;
      }
    } else {
      if (visitado) {
        // Gota Visitada (Sólida con Tick)
        innerSVG = `<path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z' stroke='#ffffff' stroke-width='1.5'/><path d='M9 9l2 2 4-4' stroke='#ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' fill='none'/>`;
      } else {
        // Gota No Visitada (Con Agujero en el centro)
        innerSVG = `<path d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' stroke='#ffffff' stroke-width='1.5'/>`;
      }
    }

    // Línea de tachado para Terrenos Descartados
    let lineaTachado = "";
    if (tachado) {
      lineaTachado = `<line x1='4' y1='4' x2='20' y2='20' stroke='#ffffff' stroke-width='3' stroke-linecap='round'/><line x1='4' y1='4' x2='20' y2='20' stroke='#ea4335' stroke-width='1.5' stroke-linecap='round'/>`;
    }

    const claseCSS = esFantasma ? 'ghost-pin-animated' : 'pin-normal';
    
    return `
      <svg class="${claseCSS}" xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${colorHex}' width='30px' height='30px' overflow='visible'>
        ${innerSVG}
        ${lineaTachado}
      </svg>
    `;
  },

  // ÍCONOS DE LA INTERFAZ
  spinner: function() {
    return `<svg class="spinner-6" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="none" stroke="#1a73e8" stroke-width="3" stroke-dasharray="15 45" stroke-linecap="round"/></svg>`;
  },
  agregar: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
  },
  gps: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`;
  },
  regla: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v3h2V8h2v4h2V8h2v3h2V8h2v8z"/></svg>`;
  },
  capas: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>`;
  },
  // 🟢 Parecido al de "capas" (misma familia visual) pero con cuadraditos
  // chicos, para sugerir "muchas unidades pequeñas" (parcelas) en vez de
  // "pocas capas grandes" (secciones).
  parcelas: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>`;
  },
  dev: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.6C.4 7 1 10 3 12c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.4-.4.4-1.1 0-1.3z"/></svg>`;
  },
  satelite: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
  },
  salir: function() {
    return `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>`;
  }
};
