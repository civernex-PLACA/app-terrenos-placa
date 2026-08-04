// ==========================================
// MÓDULO 6: SISTEMA DE TAGS Y FILTROS (tags.js)
// ==========================================

// 🟢 Escapa caracteres HTML peligrosos antes de insertar texto de usuario
// (notas, propietario, dirección, etc.) en el HTML de los popups.
// Sin esto, alguien podría escribir código en un campo de texto y que
// se ejecute en la pantalla de cualquiera que abra ese popup (XSS).
window.escaparHTML = function (valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.TagsDefinicion = {
  // 1. GENERADOR DE ETIQUETAS VISUALES PARA EL POPUP
  renderizarTagsHTML: function(ficha) {
    let html = `<div class="contenedor-tags-popup">`;

    // A. CALIFICACIÓN
    const califUpper = String(ficha.calificacion || '').trim().toUpperCase();
    if (califUpper.includes("DESCARTADO")) {
      html += this.crearChip("DESCARTADO", "chip-descartado");
    } else if (califUpper.includes("DESFAVORABLE")) {
      html += this.crearChip("DESFAVORABLE", "chip-desfavorable");
    } else if (califUpper.includes("FAVORABLE")) {
      html += this.crearChip("FAVORABLE", "chip-favorable");
    }

    // B. ESTADO ACTUAL
    const estado = String(ficha.estado || '').trim();
    if (estado) {
      const estadoSeguro = window.escaparHTML(estado);
      if (estado.toLowerCase().includes("constru")) {
        html += this.crearChip(`🏚️ ${estadoSeguro}`, "chip-construccion");
      } else if (estado.toLowerCase().includes("bald")) {
        html += this.crearChip(`🌱 ${estadoSeguro}`, "chip-baldio");
      } else {
        html += this.crearChip(estadoSeguro, "chip-default");
      }
    }

    // C. VISITADO
    const visitado = String(ficha.visitado || '').trim().toLowerCase();
    const esVisitado = visitado === "sí" || visitado === "si";
    if (esVisitado) {
      html += this.crearChip("👁️ Visitado", "chip-favorable");
    } else {
      html += this.crearChip("⏳ Pendiente", "chip-pendiente");
    }

    html += `</div>`;
    return html;
  },

  crearChip: function(texto, claseCss) {
    return `<span class="tag-chip ${claseCss}">${texto}</span>`;
  }
};
// Aliases por si lo llamas como Tags.renderizarTagsHTML
window.Tags = window.TagsDefinicion;