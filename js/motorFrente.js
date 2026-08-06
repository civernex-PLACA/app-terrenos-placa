// ==========================================
// MÓDULO: MOTOR DE FRENTE (frontend)
// Port directo de MotorFrente_clasificarLados (backend-appscript/
// 12_MotorFrente.js) — esa función es PURA (sin SpreadsheetApp/DriveApp)
// a propósito, pensada para correr tanto en el backend (backfill masivo)
// como acá en el navegador (vista previa al cargar un terreno nuevo en
// el campo). El backend es la fuente canónica — si se toca el
// algoritmo, mantener las dos copias en sync a mano, no hay build
// system en este proyecto que comparta código entre ambos lados.
//
// 🔴 SIN VALIDAR TODAVÍA (ver CLAUDE.md, "Frente de lote"): el criterio
// ángulo+distancia está validado con 4 lotes reales del lado del
// backend, pero no se corrió `MotorFrente_probarConTerrenoReal` contra
// el resto de los casos de HALLAZGOS_mapa_calles.md. Por eso esta
// sugerencia queda gateada detrás de `devFlags.frenteSugerido` (default
// false, ver dev.js) — invisible para los relevadores hasta que se
// valide y se decida activarla a propósito. Mientras tanto, sirve para
// validar visualmente contra casos reales directo en el mapa, en vez de
// solo con las funciones de prueba del backend.
// ==========================================

window.MotorFrente = {
  /**
   * Clasifica cada lado del polígono de una parcela como frente,
   * medianera u ochava, comparándolo contra las calles (mapa:calles)
   * cercanas.
   *
   * Algoritmo (ver HALLAZGOS_mapa_calles.md, punto 4): para cada lado se
   * busca el segmento de calle más cercano y se mide el ángulo entre
   * ambos. El ÁNGULO clasifica (paralelo → candidato a frente,
   * perpendicular → medianera, ninguno de los dos → ochava); la
   * DISTANCIA solo desempata/da confianza entre candidatos ya filtrados
   * por ángulo — no hay un umbral de distancia único que sirva entre
   * calles distintas (validado con casos reales de 0.6m a 11.4m, todos
   * frentes legítimos).
   *
   * @param {Array} anilloParcela - anillo exterior del polígono de la
   *   parcela, array de [lng, lat].
   * @param {Array} callesFeatures - features GeoJSON de mapa:calles
   *   (LineString/MultiLineString, con properties.toponimia/tipo) ya
   *   descargadas/cacheadas cerca de la parcela.
   * @param {Object} [opciones]
   * @param {number} [opciones.toleranciaAnguloGrados=15]
   * @param {number} [opciones.ladoMinimoMetros=0.5]
   * @returns {Array<Object>} un objeto por lado válido del polígono:
   *   { indice, largoMetros, clasificacion: 'frente'|'medianera'|'ochava'|'sin_calle',
   *     calle: {toponimia, tipo}|null, distanciaMetros, anguloGrados,
   *     confianza: 'alta'|'media'|'baja'|null }
   */
  clasificarLados: function (anilloParcela, callesFeatures, opciones) {
    opciones = opciones || {};
    const toleranciaAngulo = opciones.toleranciaAnguloGrados || 15;
    const ladoMinimo = opciones.ladoMinimoMetros || 0.5;

    if (!anilloParcela || anilloParcela.length < 3) return [];

    // Proyección plana local (equirectangular) — mismo criterio que el
    // backend, no hace falta la precisión de Gauss-Krüger acá (solo se
    // comparan ángulos/distancias relativos a la escala de un lote, no
    // se guarda el número) — más simple y portable al navegador.
    const R = 6378137;
    const latRef = anilloParcela[0][1] * Math.PI / 180;
    const aMetros = function (lng, lat) {
      return {
        x: (lng * Math.PI / 180) * R * Math.cos(latRef),
        y: (lat * Math.PI / 180) * R
      };
    };

    const puntosParcela = anilloParcela.map(function (p) { return aMetros(p[0], p[1]); });

    const lados = [];
    for (let i = 0; i < puntosParcela.length; i++) {
      const a = puntosParcela[i];
      const b = puntosParcela[(i + 1) % puntosParcela.length];
      const largo = Math.hypot(b.x - a.x, b.y - a.y);
      if (largo < ladoMinimo) continue;
      lados.push({ indice: i, a: a, b: b, largo: largo });
    }

    const segmentosCalles = [];
    (callesFeatures || []).forEach(function (feature) {
      const props = feature.properties || {};
      const info = { toponimia: props.toponimia || null, tipo: props.tipo || null };
      const geom = feature.geometry;
      if (!geom) return;
      const lineas = geom.type === 'LineString' ? [geom.coordinates]
        : geom.type === 'MultiLineString' ? geom.coordinates
        : [];
      lineas.forEach(function (linea) {
        for (let i = 0; i < linea.length - 1; i++) {
          const p1 = aMetros(linea[i][0], linea[i][1]);
          const p2 = aMetros(linea[i + 1][0], linea[i + 1][1]);
          segmentosCalles.push({ p1: p1, p2: p2, info: info });
        }
      });
    });

    function distanciaPuntoASegmento(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const largo2 = dx * dx + dy * dy;
      if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2;
      t = Math.max(0, Math.min(1, t));
      const proyX = a.x + t * dx, proyY = a.y + t * dy;
      return Math.hypot(p.x - proyX, p.y - proyY);
    }

    // Distancia mínima entre dos segmentos — aproximación por los 4
    // extremos (suficiente acá: un lado de parcela y una calle no se
    // cruzan en la práctica, no hace falta el caso exacto de intersección).
    function distanciaSegmentoASegmento(a1, b1, a2, b2) {
      return Math.min(
        distanciaPuntoASegmento(a1, a2, b2),
        distanciaPuntoASegmento(b1, a2, b2),
        distanciaPuntoASegmento(a2, a1, b1),
        distanciaPuntoASegmento(b2, a1, b1)
      );
    }

    // Ángulo entre dos segmentos, normalizado a 0-90° (0=paralelo,
    // 90=perpendicular — la dirección de una recta no importa, solo su
    // orientación).
    function anguloEntre(a1, b1, a2, b2) {
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

    const resultados = lados.map(function (lado) {
      let mejor = null;
      segmentosCalles.forEach(function (seg) {
        const distancia = distanciaSegmentoASegmento(lado.a, lado.b, seg.p1, seg.p2);
        if (!mejor || distancia < mejor.distancia) {
          mejor = { distancia: distancia, angulo: anguloEntre(lado.a, lado.b, seg.p1, seg.p2), info: seg.info };
        }
      });

      if (!mejor) {
        return {
          indice: lado.indice, largoMetros: Math.round(lado.largo * 100) / 100,
          clasificacion: 'sin_calle', calle: null, distanciaMetros: null,
          anguloGrados: null, confianza: null
        };
      }

      const clasificacion = mejor.angulo <= toleranciaAngulo ? 'frente'
        : mejor.angulo >= (90 - toleranciaAngulo) ? 'medianera'
        : 'ochava';

      return {
        indice: lado.indice,
        largoMetros: Math.round(lado.largo * 100) / 100,
        clasificacion: clasificacion,
        calle: mejor.info,
        distanciaMetros: Math.round(mejor.distancia * 100) / 100,
        anguloGrados: Math.round(mejor.angulo * 10) / 10,
        confianza: null // se completa abajo, solo para los candidatos a frente
      };
    });

    // Confianza: entre los lados clasificados como frente, comparar su
    // distancia contra la del mejor candidato del mismo lote (no hay un
    // umbral de distancia universal entre calles distintas, pero la
    // distancia RELATIVA dentro del mismo lote sí es una señal
    // razonable de ambigüedad).
    const candidatosFrente = resultados.filter(function (r) { return r.clasificacion === 'frente'; });
    if (candidatosFrente.length > 0) {
      const mejorDistancia = Math.min.apply(null, candidatosFrente.map(function (c) { return c.distanciaMetros; }));
      candidatosFrente.forEach(function (c) {
        const ratio = mejorDistancia > 0 ? c.distanciaMetros / mejorDistancia : 1;
        c.confianza = ratio <= 1.5 ? 'alta' : ratio <= 3 ? 'media' : 'baja';
      });
    }

    return resultados;
  },

  // 🟢 Mismo patrón de extracción de anillo exterior que
  // CatastroGIS.obtenerDatosPorCoordenada (GeoJson.js) — factorizado
  // acá porque motorFrente.js es la única parte del frontend que lo
  // necesita fuera de ese archivo.
  _extraerAnilloExterior: function (geometry) {
    if (!geometry) return null;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates[0][0];
    if (geometry.type === 'Polygon') return geometry.coordinates[0];
    return null;
  },

  // 🟢 Arma el texto de la sugerencia para mostrar en el formulario —
  // separado del cálculo puro de arriba para que la lógica de
  // presentación no se mezcle con el algoritmo (que tiene que quedar
  // idéntico al del backend para mantenerse en sync).
  formatearSugerencia: function (resultadoClasificacion) {
    const candidatos = (resultadoClasificacion || []).filter(function (r) { return r.clasificacion === 'frente'; });
    if (candidatos.length === 0) {
      return 'Sin sugerencia (ningún lado quedó paralelo a una calle cercana).';
    }
    return candidatos.map(function (c) {
      const calle = c.calle && c.calle.toponimia ? c.calle.toponimia : '(calle sin nombre)';
      return `Lado ${c.indice}: ${c.largoMetros}m — ${calle} (confianza ${c.confianza}, ${c.distanciaMetros}m, ${c.anguloGrados}°)`;
    }).join(' · ');
  }
};
