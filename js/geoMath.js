// ==========================================
// MÓDULO: GEOMATH (algoritmos/cálculos geométricos puros)
// ==========================================
// Sin DOM, sin red, sin Leaflet — solo matemática. Punto de encuentro para
// la geometría que antes estaba duplicada entre GeoJson.js (CatastroGIS) y
// motorFrente.js (MotorFrente): las dos usaban la misma proyección
// equirectangular (lng·R·cos(latRef), lat·R) con implementaciones propias.
// GeoJson.js y motorFrente.js siguen siendo la fuente de verdad de SU
// dominio (detección de parcela, clasificación de frente) y delegan acá
// solo la parte de matemática compartida.
//
// 🔴 `_extraerAnilloExterior`/proyección acá no reemplazan el motor
// Gauss-Krüger del backend (7_ModuloLimpieza.js) — ver CLAUDE.md, "NO
// TOCAR esa fórmula". Esto es la proyección simple que ya se usaba en el
// frontend para vista previa/sugerencia, solo centralizada.
// ==========================================

window.GeoMath = {
  puntoEnPoligono: function (punto, vertices) {
    const x = punto[0], y = punto[1];
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i][0], yi = vertices[i][1];
      const xj = vertices[j][0], yj = vertices[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  mercatorToLatLng: function (x, y) {
    const rMajor = 6378137;
    const lng = (x / rMajor) * (180 / Math.PI);
    const latRad = Math.atan(Math.exp(y / rMajor));
    const lat = (2 * latRad - Math.PI / 2) * (180 / Math.PI);
    return [lng, lat];
  },

  latLngToMercator: function (lat, lng) {
    const r = 6378137;
    const x = lng * Math.PI / 180 * r;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * r;
    return [x, y];
  },

  calcularBBoxMercator: function (geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const recorrer = (coords) => {
      if (typeof coords[0] === 'number') {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach(recorrer);
      }
    };
    recorrer(geometry.coordinates);

    return { minX, minY, maxX, maxY };
  },

  bboxIntersecta: function (a, b) {
    if (!a || !b) return false;
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
  },

  // Anillo exterior de un Polygon/MultiPolygon GeoJSON — mismo patrón que
  // usaban por separado GeoJson.js (obtenerDatosPorCoordenada) y
  // motorFrente.js (_extraerAnilloExterior).
  extraerAnilloExterior: function (geometry) {
    if (!geometry) return null;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates[0][0];
    if (geometry.type === 'Polygon') return geometry.coordinates[0];
    return null;
  },

  // Proyección equirectangular simple (lng/lat en grados -> metros),
  // centrada en latRefRadianes. NO es Gauss-Krüger (ver nota arriba) — solo
  // sirve para comparar distancias/ángulos/áreas a la escala de un lote.
  proyectarAMetros: function (lng, lat, latRefRadianes) {
    const R = 6378137;
    return {
      x: (lng * Math.PI / 180) * R * Math.cos(latRefRadianes),
      y: (lat * Math.PI / 180) * R
    };
  },

  // Área (m²) de un anillo [lng,lat] vía Shoelace, proyectando con
  // proyectarAMetros (latRef = latitud del primer punto del anillo).
  calcularAreaShoelace: function (anilloLngLat) {
    if (!anilloLngLat || anilloLngLat.length < 3) return null;

    const latRef = anilloLngLat[0][1] * Math.PI / 180;
    const puntos = anilloLngLat.map((par) => this.proyectarAMetros(par[0], par[1], latRef));

    let suma = 0;
    for (let i = 0; i < puntos.length; i++) {
      const actual = puntos[i];
      const siguiente = puntos[(i + 1) % puntos.length];
      suma += actual.x * siguiente.y - siguiente.x * actual.y;
    }
    return Math.round(Math.abs(suma) / 2);
  },

  distanciaPuntoASegmento: function (p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2;
    t = Math.max(0, Math.min(1, t));
    const proyX = a.x + t * dx, proyY = a.y + t * dy;
    return Math.hypot(p.x - proyX, p.y - proyY);
  },

  // Distancia mínima entre dos segmentos — aproximación por los 4 extremos
  // (suficiente acá: un lado de parcela y una calle no se cruzan en la
  // práctica, no hace falta el caso exacto de intersección).
  distanciaSegmentoASegmento: function (a1, b1, a2, b2) {
    return Math.min(
      this.distanciaPuntoASegmento(a1, a2, b2),
      this.distanciaPuntoASegmento(b1, a2, b2),
      this.distanciaPuntoASegmento(a2, a1, b1),
      this.distanciaPuntoASegmento(b2, a1, b1)
    );
  },

  // Ángulo entre dos segmentos, normalizado a 0-90° (0=paralelo,
  // 90=perpendicular — la dirección de una recta no importa, solo su
  // orientación).
  anguloEntreSegmentos: function (a1, b1, a2, b2) {
    const v1 = { x: b1.x - a1.x, y: b1.y - a1.y };
    const v2 = { x: b2.x - a2.x, y: b2.y - a2.y };
    const mag1 = Math.hypot(v1.x, v1.y), mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    let coseno = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
    coseno = Math.max(-1, Math.min(1, coseno));
    let angulo = Math.acos(coseno) * 180 / Math.PI; // 0-180
    if (angulo > 90) angulo = 180 - angulo;
    return angulo;
  }
};
