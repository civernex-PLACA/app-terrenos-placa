// ==========================================
// MÓDULO 6: SISTEMA DE TAGS Y FILTROS (tags.js)
// ==========================================

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
      if (estado.toLowerCase().includes("constru")) {
        html += this.crearChip(`🏚️ ${estado}`, "chip-construccion");
      } else if (estado.toLowerCase().includes("bald")) {
        html += this.crearChip(`🌱 ${estado}`, "chip-baldio");
      } else {
        html += this.crearChip(estado, "chip-default");
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