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
// 🔴 SIN VALIDAR FORMALMENTE TODAVÍA (ver CLAUDE.md, "Frente de lote"):
// el criterio ángulo+distancia está validado con 4 lotes reales del
// lado del backend, pero no se corrió `MotorFrente_probarConTerrenoReal`
// contra el resto de los casos de HALLAZGOS_mapa_calles.md. Ya NO está
// gateada por `devFlags.frenteSugerido` (ese flag quedó sin uso, ver
// mapa.js) — corre siempre para terrenos nuevos, pero el resultado se
// muestra como placeholder gris en los campos Frente/Contrafrente
// (nunca se escribe en .value desde acá) y solo se usa de verdad si el
// relevador guarda sin completar el campo a mano (fallback en
// obtenerDatosFormulario, formulario.js).
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

    // Proyección plana (equirectangular, GeoMath.proyectarAMetros) — mismo
    // criterio que el backend, no hace falta la precisión de Gauss-Krüger
    // acá (solo se comparan ángulos/distancias relativos a la escala de un
    // lote, no se guarda el número) — más simple y portable al navegador.
    const latRef = anilloParcela[0][1] * Math.PI / 180;
    const aMetros = function (lng, lat) {
      return window.GeoMath.proyectarAMetros(lng, lat, latRef);
    };

    const puntosParcela = anilloParcela.map(function (p) { return aMetros(p[0], p[1]); });

    // 🟢 NUEVO: Extraemos los segmentos válidos y calculamos su ángulo absoluto
    const segmentosIniciales = [];
    for (let i = 0; i < puntosParcela.length; i++) {
      const a = puntosParcela[i];
      const b = puntosParcela[(i + 1) % puntosParcela.length];
      const largo = Math.hypot(b.x - a.x, b.y - a.y);
      if (largo < ladoMinimo) continue;
      
      // Ángulo en grados del segmento (0 a 360)
      let anguloAbsoluto = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (anguloAbsoluto < 0) anguloAbsoluto += 360;
      
      segmentosIniciales.push({ indice: i, a: a, b: b, largo: largo, anguloAbs: anguloAbsoluto });
    }

    // 🟢 NUEVO: Fusionamos los segmentos que son colineales para armar los lados reales
    const lados = [];
    if (segmentosIniciales.length > 0) {
      lados.push(segmentosIniciales[0]);

      for (let i = 1; i < segmentosIniciales.length; i++) {
        const segActual = segmentosIniciales[i];
        const ladoPrevio = lados[lados.length - 1];

        // Calculamos la diferencia angular
        let diff = Math.abs(segActual.anguloAbs - ladoPrevio.anguloAbs);
        if (diff > 180) diff = 360 - diff; // Normalizamos para que no supere 180

        // Si la diferencia es menor o igual a 5 grados, son la misma línea recta
        if (diff <= 5) {
          // Fusionamos: el punto final 'b' del lado previo pasa a ser el de este segmento
          ladoPrevio.b = segActual.b;
          // Recalculamos la longitud real desde el inicio 'a' hasta el nuevo fin 'b'
          ladoPrevio.largo = Math.hypot(ladoPrevio.b.x - ladoPrevio.a.x, ladoPrevio.b.y - ladoPrevio.a.y);
          
          // Actualizamos el ángulo del vector largo fusionado
          let nuevoAngulo = Math.atan2(ladoPrevio.b.y - ladoPrevio.a.y, ladoPrevio.b.x - ladoPrevio.a.x) * 180 / Math.PI;
          if (nuevoAngulo < 0) nuevoAngulo += 360;
          ladoPrevio.anguloAbs = nuevoAngulo;
        } else {
          // Si hay un quiebre mayor a 5 grados, se consolida como un nuevo lado
          lados.push(segActual);
        }
      }

      // Cerrar el ciclo: verificamos si el último lado se fusiona con el primero
      if (lados.length > 1) {
        const primerLado = lados[0];
        const ultimoLado = lados[lados.length - 1];
        
        let diff = Math.abs(ultimoLado.anguloAbs - primerLado.anguloAbs);
        if (diff > 180) diff = 360 - diff;

        if (diff <= 5) {
          // Extendemos el inicio del primer lado hacia donde empezó el último
          primerLado.a = ultimoLado.a; 
          primerLado.largo = Math.hypot(primerLado.b.x - primerLado.a.x, primerLado.b.y - primerLado.a.y);
          // Borramos el último lado del array porque ya se incorporó al primero
          lados.pop(); 
        }
      }
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

    const resultados = lados.map(function (lado) {
      let mejor = null;
      segmentosCalles.forEach(function (seg) {
        const distancia = window.GeoMath.distanciaSegmentoASegmento(lado.a, lado.b, seg.p1, seg.p2);
        if (!mejor || distancia < mejor.distancia) {
          mejor = { distancia: distancia, angulo: window.GeoMath.anguloEntreSegmentos(lado.a, lado.b, seg.p1, seg.p2), info: seg.info };
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

  // 🟢 Wrapper sobre GeoMath.extraerAnilloExterior (mismo patrón que
  // necesitaba CatastroGIS.obtenerDatosPorCoordenada, ahora centralizado
  // en geoMath.js) — se mantiene el nombre acá para no tocar mapa.js.
  _extraerAnilloExterior: function (geometry) {
    return window.GeoMath.extraerAnilloExterior(geometry);
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
