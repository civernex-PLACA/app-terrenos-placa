// ==========================================
// MÓDULO 2: CONEXIÓN A GOOGLE SHEETS
// ==========================================
const SHEET_ID = "1gQTOwTrpCsltYv-VSZAApo9c_sF99fz8aY_j1qc4Pc0";
const DRIVE_FOLDER_ID = "1aHzoGtmkosQfPsqje_R6MjlWGBxQFyvr";

// ==========================================
// CONSULTAR OPCIONES Y REGLAS DE LA PLANILLA
// ==========================================
async function obtenerEsquemaFormularioSheets() {
  const token = obtenerToken();
  if (!token) return null;

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?includeGridData=true&ranges=${encodeURIComponent("'Relevamiento de Terrenos/Propietarios'!A5:AD6")}`;

    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const rowData = data.sheets[0]?.data[0]?.rowData;

    if (!rowData || rowData.length < 2) return null;

    const celdas = rowData[1].values || [];

    return {
      visitado: extraerOpcionesValidacion(celdas[2]),   // Col C
      distrito: extraerOpcionesValidacion(celdas[3]),   // Col D
      barrio: extraerOpcionesValidacion(celdas[4]),     // Col E
      direccion: extraerOpcionesValidacion(celdas[5]),  // Col F
      tipolote: extraerOpcionesValidacion(celdas[7]),   // Col H
      estado: extraerOpcionesValidacion(celdas[8]),     // Col I
      agua: extraerOpcionesValidacion(celdas[12]),      // Col M
      cloaca: extraerOpcionesValidacion(celdas[13]),    // Col N
      relevo: extraerOpcionesValidacion(celdas[14])     // Col O
    };
  } catch (error) {
    console.warn("No se pudo leer el esquema dinámico de validación. Se usarán valores locales.", error);
    return null;
  }
}

function extraerOpcionesValidacion(celda) {
  if (!celda || !celda.dataValidation) return null;
  const regla = celda.dataValidation;
  if (regla.condition && regla.condition.type === 'ONE_OF_LIST') {
    return regla.condition.values ? regla.condition.values.map(v => v.userEnteredValue) : null;
  }
  return null;
}

// ==========================================
// DESCARGAR Y DIBUJAR PINES EN EL MAPA
// ==========================================
async function descargarYCruzarDatos(silencioso = false) {
  // 🟢 Solo muestra el Toast si la llamada NO es silenciosa
  let idToastSync = null;
  if (!silencioso && typeof mostrarToast === 'function') {
    idToastSync = mostrarToast("Sincronizando datos...");
  }

  const token = obtenerToken();
  if (!token) return;

  try {
    const RANGO_DATOS = "'Relevamiento de Terrenos/Propietarios'!A5:AD";
    const RANGO_COORDENADAS = "'Coordenadas IDGIS'!A1:J";

    const [respuestaDatos, respuestaCoords] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGO_DATOS)}`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGO_COORDENADAS)}`, { headers: { 'Authorization': `Bearer ${token}` } })
    ]);

    // 🟢 INTERCEPTOR 401 AL DESCARGAR
    if (respuestaDatos.status === 401 || respuestaCoords.status === 401) {
      console.warn("⚠️ [API] Token expirado al sincronizar. Pausando y renovando...");
      // 🟢 Cerramos el toast de este intento antes de reintentar: el
      // reintento va a abrir el suyo propio (si corresponde), y si no
      // lo cerráramos acá quedaría una tarjeta "Sincronizando datos..."
      // pegada en la pila para siempre.
      if (typeof ocultarToast === 'function') ocultarToast(idToastSync);
      const nuevoToken = await window.renovarToken();
      if (nuevoToken) {
        return descargarYCruzarDatos(silencioso); // Reintento silencioso
      } else {
        alert("Sesión expirada. Por favor vuelve a iniciar sesión.");
        if (typeof cerrarSesion === 'function') cerrarSesion();
        return;
      }
    }

    const jsonDatos = await respuestaDatos.json();
    const jsonCoords = await respuestaCoords.json();

    const filasDatos = jsonDatos.values || [];
    const filasCoords = jsonCoords.values || [];

    // 1. Memorizar Coordenadas desde Hoja 2
    let diccionarioCoords = {};

    for (let i = 1; i < filasCoords.length; i++) {
      let filaC = filasCoords[i];
      let idCrudo = filaC[0];
      if (idCrudo) {
        let idLimpio = String(idCrudo).trim();
        diccionarioCoords[idLimpio] = {
          lat: filaC[1],
          lng: filaC[2],
          fotosIds: filaC[6] || "",
          geoJsonStr: filaC[7] || "" // 🟢 NUEVO: Columna H
        };
      }
    }

    // ==========================================================
    // 🟢 2. SINCRONIZADO INCREMENTAL: solo se toca el pin/polígono
    // de un terreno si sus datos realmente cambiaron desde la última
    // vez (antes se borraba y redibujaba TODO el mapa cada 30s, lo
    // que causaba parpadeo y cerraba popups abiertos).
    //
    // La comparación no usa solo el ID de terreno como clave: en esta
    // planilla el ID lo genera una fórmula automática basada en el
    // número de fila, así que si se borra un terreno y otro nuevo cae
    // en la misma fila, "hereda" el mismo ID con datos distintos. Por
    // eso la "huella" de cada terreno incluye TODOS los datos que
    // afectan su dibujo (coordenadas, dirección, notas, calificación,
    // polígono, etc.) — si algo de eso cambió, se detecta igual aunque
    // el ID se haya reciclado.
    // ==========================================================
    window.terrenosFingerprint = window.terrenosFingerprint || {};
    const idsVistosAhora = new Set();
    let casitasActualizadas = 0;

    for (let i = 1; i < filasDatos.length; i++) {
      let fila = filasDatos[i];
      let idCrudo = fila[0]; // Columna A (ID Terreno)
      if (!idCrudo) continue;

      let idLimpio = String(idCrudo).trim();
      const coordsTerreno = diccionarioCoords[idLimpio];
      if (!coordsTerreno) continue;

      let latStr = String(coordsTerreno.lat || "");
      let lngStr = String(coordsTerreno.lng || "");
      if (!latStr.includes("-") || !lngStr.includes("-")) continue;

      idsVistosAhora.add(idLimpio);

      let lat = parseFloat(latStr.replace(',', '.'));
      let lng = parseFloat(lngStr.replace(',', '.'));

      let colorLeido = (fila[20]) ? String(fila[20]).trim().toUpperCase() : "";

      let colorHex = "#9aa0a6";
      if (colorLeido.includes("FAVORABLE") && !colorLeido.includes("DES")) {
        colorHex = "#34a853";
      } else if (colorLeido.includes("DESFAVORABLE")) {
        colorHex = "#ea4335";
      }

      let direccion = (fila[5]) ? fila[5] : "Sin dirección"; // Columna F

      const ficha = {
        colB: fila[1] || "",             // Col B
        visitado: fila[2] || "No",       // Col C
        distrito: fila[3] || "",         // Col D
        barrio: fila[4] || "",           // Col E
        direccion: fila[5] || "",        // Col F
        tipolote: fila[7] || "",         // Col H
        estado: fila[8] || "",           // Col I
        frente: fila[9] || "",           // Col J
        fondo: fila[10] || "",           // Col K
        sup: fila[11] || "",             // Col L
        agua: fila[12] || "",            // Col M
        cloaca: fila[13] || "",          // Col N
        relevo: fila[14] || "",          // Col O
        calificacion: fila[20] || "",    // Col U
        propietario: fila[22] || "",     // Col W
        contacto: fila[23] || "",        // Col X
        vendedor: fila[25] || "",        // Col Z
        notas: fila[29] || "",           // Col AD
        fotosIds: coordsTerreno.fotosIds
      };

      const huella = JSON.stringify([lat, lng, colorHex, direccion, ficha, coordsTerreno.geoJsonStr]);

      if (window.terrenosFingerprint[idLimpio] === huella) {
        continue; // Nada cambió para este terreno puntual: no se toca el mapa.
      }

      // Terreno nuevo o modificado: sacamos su pin/polígono viejo (si había)
      // y dibujamos el actualizado.
      if (typeof window.eliminarPinDelMapa === 'function') window.eliminarPinDelMapa(idLimpio);
      if (window.Poligonos) window.Poligonos.eliminarPermanente(idLimpio);

      if (typeof dibujarPinEnMapa === 'function') {
        dibujarPinEnMapa(lat, lng, idLimpio, colorHex, direccion, ficha);
        casitasActualizadas++;

        if (window.Poligonos && coordsTerreno.geoJsonStr) {
          window.Poligonos.dibujarPermanente(coordsTerreno.geoJsonStr, { color: colorHex }, idLimpio);
        }
      }

      window.terrenosFingerprint[idLimpio] = huella;
    }

    // 🟢 3. Sacar del mapa los terrenos que ya no aparecen en la planilla
    // (se borró la fila entera desde la última sincronización).
    for (const idViejo in window.terrenosFingerprint) {
      if (!idsVistosAhora.has(idViejo)) {
        if (typeof window.eliminarPinDelMapa === 'function') window.eliminarPinDelMapa(idViejo);
        if (window.Poligonos) window.Poligonos.eliminarPermanente(idViejo);
        delete window.terrenosFingerprint[idViejo];
      }
    }

    if (typeof ajustarVistaMapa === 'function') ajustarVistaMapa();

    if (!silencioso && typeof ocultarToast === 'function') {
      ocultarToast(idToastSync);
    }
    console.log(`✅ Sincronizado. Terrenos actualizados en este ciclo: ${casitasActualizadas} / Total en mapa: ${idsVistosAhora.size}`);

  } catch (error) {
    console.error("Error API:", error);
    if (!silencioso) alert("Fallo al leer datos: " + error.message);
    if (typeof ocultarToast === 'function') ocultarToast(idToastSync);
  }
}

// ==========================================
// GUARDAR O EDITAR TERRENO EN GOOGLE SHEETS
// ==========================================

// 🟢 Arma el array de columnas B→AD a partir de los datos del formulario.
// Se usa tanto para editar (PUT a una fila puntual) como para dar de alta
// un terreno nuevo, así los dos caminos escriben exactamente lo mismo.
function construirFilaHoja1(datos, enlaceMapsActual) {
  return [
    datos.colB || datos.columnaB || "", // B
    datos.visitado,     // C
    datos.distrito,     // D
    datos.barrio,       // E
    datos.direccion,    // F
    enlaceMapsActual,   // G
    datos.tipolote,     // H
    datos.estado,       // I
    datos.frente,       // J
    datos.fondo,        // K
    "",                 // L (Superficie autocalculada)
    datos.agua,         // M
    datos.cloaca,       // N
    datos.relevo,       // O
    "", "", "", "", "", // P, Q, R, S, T
    "",                 // U (Calificación autocalculada)
    "",                 // V
    datos.propietario,  // W
    datos.contacto,     // X
    "",                 // Y
    datos.vendedor,     // Z
    "", "", "",         // AA, AB, AC
    datos.notas         // AD
  ];
}

async function guardarTerrenoEnSheets(datos) {
  const token = obtenerToken();

  try {
    const latFix = Number(datos.lat).toFixed(6);
    const lngFix = Number(datos.lng).toFixed(6);
    const enlaceMapsActual = `https://www.google.com/maps?q=${latFix},${lngFix}`;

    // 🟢 Sin límite fijo de filas (antes cortaba en 1000; ahora Sheets
    // devuelve solo las filas que realmente tienen datos)
    const rangoCheck = "'Relevamiento de Terrenos/Propietarios'!A6:AD";
    const urlCheck = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rangoCheck)}`;

    const respCheck = await fetch(urlCheck, { headers: { 'Authorization': `Bearer ${token}` } });

    // 🟢 INTERCEPTOR 401 AL GUARDAR
    if (respCheck.status === 401) {
      console.warn("⚠️ [API] Token expirado al intentar guardar. Pausando y renovando...");
      const idToastRenovar = typeof mostrarToast === 'function' ? mostrarToast("Renovando sesión de Google...") : null;

      const nuevoToken = await window.renovarToken();
      if (typeof ocultarToast === 'function') ocultarToast(idToastRenovar);

      if (nuevoToken) {
        console.log("✅ [API] Token renovado con éxito. Reintentando guardado...");
        return guardarTerrenoEnSheets(datos);
      } else {
        alert("La sesión expiró y no pudo renovarse automáticamente. Por favor, vuelve a iniciar sesión (Tus datos podrían perderse).");
        if (typeof cerrarSesion === 'function') cerrarSesion();
        return null;
      }
    }

    const jsonCheck = await respCheck.json();
    const filasExistentes = jsonCheck.values || [];

    // =========================================================
    // 🟢 SISTEMA UNIFICADO DE BÚSQUEDA POR COORDENADAS
    // =========================================================
    let filaDestino = null;

    // 1. Buscar coincidencia exacta de coordenadas en la Columna G (Modo Edición / Anti-duplicados)
    for (let i = 0; i < filasExistentes.length; i++) {
      let enlaceEnFila = filasExistentes[i][6]; // Columna G
      if (enlaceEnFila) {
        const match = String(enlaceEnFila).match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (match) {
          const latFila = Number(match[1]).toFixed(6);
          const lngFila = Number(match[2]).toFixed(6);

          if (latFila === latFix && lngFila === lngFix) {
            filaDestino = 6 + i;
            console.log(`📍 [Búsqueda] Terreno encontrado en fila ${filaDestino} por coordenadas exactas.`);
            break;
          }
        }
      }
    }

    // 🟢 CASO A: EDITAR UN TERRENO EXISTENTE (fila encontrada por coordenadas)
    // Esto sigue siendo un PUT directo a una fila específica y conocida:
    // no hay condición de carrera real acá porque dos ediciones al mismo
    // terreno son un caso raro y, aun así, apuntan a la MISMA fila (no se
    // pisan filas de terrenos distintos).
    if (filaDestino) {
      let idAsignadoAlTerreno = null;
      const indiceFilaArray = filaDestino - 6;

      if (filasExistentes[indiceFilaArray] && filasExistentes[indiceFilaArray][0]) {
        idAsignadoAlTerreno = String(filasExistentes[indiceFilaArray][0]).trim();
      } else {
        idAsignadoAlTerreno = `POS${String(filaDestino - 5).padStart(3, '0')}`;
      }

      const filaHoja1 = construirFilaHoja1(datos, enlaceMapsActual);
      const rangoFila = `'Relevamiento de Terrenos/Propietarios'!B${filaDestino}:AD${filaDestino}`;
      const urlPut = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rangoFila)}?valueInputOption=USER_ENTERED`;

      const respuesta = await fetch(urlPut, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [filaHoja1] })
      });

      const resultado = await respuesta.json();
      if (resultado.error) throw new Error(resultado.error.message);

      if (window.datosGisTemporales) {
        window.guardarGisEnHoja2(idAsignadoAlTerreno, window.datosGisTemporales);
        window.datosGisTemporales = null;
      }

      return idAsignadoAlTerreno;
    }

    // 🟢 CASO B: TERRENO NUEVO
    // Volvemos a un PUT explícito a 'B{fila}:AD{fila}' (respeta las columnas
    // al pie de la letra — a diferencia de "append", que en esta planilla
    // desalineaba los datos porque tiene columnas vacías/autocalculadas
    // intercaladas y confunde la detección automática de "tabla").
    //
    // Para no perder la protección contra la condición de carrera,
    // verificamos después de escribir: releemos la fila y confirmamos
    // que el contenido es el nuestro. Si otro usuario escribió ahí casi
    // al mismo tiempo y nos pisó, lo detectamos y reintentamos con la
    // siguiente fila libre (hasta 3 veces).
    return await guardarTerrenoNuevoConReintento(datos, enlaceMapsActual, token, filasExistentes, 0);

  } catch (error) {
    console.error("Error al guardar/actualizar en Sheets:", error);
    if (typeof removerPinFantasma === 'function') removerPinFantasma();
    alert("Error al guardar en base de datos: " + error.message);
    if (typeof ocultarToast === 'function') ocultarToast();
    return null;
  }
}

// ==========================================
// ALTA DE TERRENO NUEVO CON VERIFICACIÓN + REINTENTO
// (evita pisadas de datos entre usuarios guardando a la vez)
// ==========================================
async function guardarTerrenoNuevoConReintento(datos, enlaceMapsActual, token, filasExistentesIniciales, intento) {
  const MAX_INTENTOS = 3;

  // 1. Releer el estado actual de la planilla (excepto en el primer intento,
  //    donde reutilizamos lo que ya se leyó para no gastar una llamada extra)
  let filasExistentes = filasExistentesIniciales;
  if (intento > 0) {
    const rangoCheck = "'Relevamiento de Terrenos/Propietarios'!A6:AD";
    const urlCheck = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rangoCheck)}`;
    const respCheck = await fetch(urlCheck, { headers: { 'Authorization': `Bearer ${token}` } });
    const jsonCheck = await respCheck.json();
    filasExistentes = jsonCheck.values || [];

    // Pequeña espera aleatoria para que dos clientes en colisión no
    // vuelvan a chocar exactamente en el mismo instante otra vez
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
  }

  // 2. Calcular la primera fila libre (misma lógica que la app original)
  let filaDestino = 6;
  for (let i = 0; i < filasExistentes.length; i++) {
    let idEnFila = filasExistentes[i][0];       // Columna A (ID)
    let visitadoEnFila = filasExistentes[i][2]; // Columna C (Visitado)

    if (!idEnFila && !visitadoEnFila) {
      filaDestino = 6 + i;
      break;
    }
    filaDestino = 6 + i + 1;
  }

  const idAsignadoAlTerreno = `POS${String(filaDestino - 5).padStart(3, '0')}`;

  // 3. Escribir en esa fila con PUT explícito (columnas exactas B:AD)
  const filaHoja1 = construirFilaHoja1(datos, enlaceMapsActual);
  const rangoFila = `'Relevamiento de Terrenos/Propietarios'!B${filaDestino}:AD${filaDestino}`;
  const urlPut = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rangoFila)}?valueInputOption=USER_ENTERED`;

  await fetch(urlPut, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [filaHoja1] })
  });

  // 4. VERIFICACIÓN: releer esa misma fila y confirmar que el enlace de
  // mapas (columna G, que incluye lat/lng exactas) es el nuestro. Si no
  // coincide, alguien más escribió ahí primero -> colisión detectada.
  const urlVerificar = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'Relevamiento de Terrenos/Propietarios'!G${filaDestino}`)}`;
  const respVerificar = await fetch(urlVerificar, { headers: { 'Authorization': `Bearer ${token}` } });
  const jsonVerificar = await respVerificar.json();
  const enlaceGuardado = jsonVerificar.values?.[0]?.[0] || "";

  if (enlaceGuardado !== enlaceMapsActual) {
    console.warn(`⚠️ [API] Colisión detectada en fila ${filaDestino} (intento ${intento + 1}/${MAX_INTENTOS}). Reintentando...`);

    if (intento + 1 >= MAX_INTENTOS) {
      throw new Error("No se pudo guardar: varias personas guardaron terrenos al mismo tiempo. Probá guardar de nuevo.");
    }
    return await guardarTerrenoNuevoConReintento(datos, enlaceMapsActual, token, filasExistentes, intento + 1);
  }

  console.log(`✅ [API] Terreno nuevo guardado sin colisiones en fila ${filaDestino}.`);

  if (window.datosGisTemporales) {
    window.guardarGisEnHoja2(idAsignadoAlTerreno, window.datosGisTemporales);
    window.datosGisTemporales = null;
  }

  return idAsignadoAlTerreno;
}

// ==========================================
// GUARDAR FOTOS EN HOJA 2 (Coordenadas IDGIS)
// ==========================================
window.guardarIdsFotosEnHoja2 = async function (idTerreno, nuevosIdsFotos) {
  if (!nuevosIdsFotos || nuevosIdsFotos.length === 0) return;

  const token = obtenerToken() || window.gapiToken;
  const sheetName = "Coordenadas IDGIS";
  const urlGet = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!A:G`;

  let filaEncontrada = -1;
  let intentos = 0;
  let idsActualesColG = "";

  console.log(`Buscando ID ${idTerreno} en Hoja 2 para insertar fotos...`);

  while (filaEncontrada === -1 && intentos < 5) {
    try {
      const res = await fetch(urlGet, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      if (data.values) {
        for (let i = 0; i < data.values.length; i++) {
          if (String(data.values[i][0]).trim() === String(idTerreno).trim()) {
            filaEncontrada = i + 1;
            idsActualesColG = data.values[i][6] || "";
            break;
          }
        }
      }
    } catch (e) {
      console.warn("Error al leer Hoja 2:", e);
    }

    if (filaEncontrada === -1) {
      console.log("Hoja 2 aún no tiene el ID, reintentando en 1s...");
      await new Promise(r => setTimeout(r, 1000));
      intentos++;
    }
  }

  if (filaEncontrada === -1) {
    console.error("No se encontró el ID en la Hoja 2. Las fotos están en Drive pero no se enlazaron.");
    return;
  }

  let arrayIds = idsActualesColG ? idsActualesColG.split(',').map(id => id.trim()).filter(id => id !== "") : [];
  arrayIds = arrayIds.concat(nuevosIdsFotos);
  let stringFinal = arrayIds.join(',');

  const urlUpdate = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheetName}!G${filaEncontrada}?valueInputOption=USER_ENTERED`;

  try {
    await fetch(urlUpdate, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [[stringFinal]] })
    });
    console.log("✅ IDs de fotos guardados en Hoja 2 exitosamente.");
  } catch (e) {
    console.error("Error al escribir los IDs en Hoja 2:", e);
  }
};

// ==========================================
// NUEVO: GUARDAR METADATOS GIS EN HOJA 2
// ==========================================
window.guardarGisEnHoja2 = async function (idTerreno, datosGis) {
  if (!datosGis || !datosGis.idGis || !datosGis.geoJson) return;

  const token = obtenerToken() || window.gapiToken;
  const sheetName = "Coordenadas IDGIS";
  // Buscamos en la Columna A para encontrar la fila del terreno
  const urlGet = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}!A:A`;

  let filaEncontrada = -1;
  let intentos = 0;

  console.log(`Buscando ID ${idTerreno} en Hoja 2 para insertar polígono GIS...`);

  // Se aplican reintentos en caso de que la fórmula de Google Sheets tarde en crear la fila
  while (filaEncontrada === -1 && intentos < 5) {
    try {
      const res = await fetch(urlGet, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();

      if (data.values) {
        for (let i = 0; i < data.values.length; i++) {
          if (String(data.values[i][0]).trim() === String(idTerreno).trim()) {
            filaEncontrada = i + 1;
            break;
          }
        }
      }
    } catch (e) {
      console.warn("Error al leer Hoja 2 para GIS:", e);
    }

    if (filaEncontrada === -1) {
      await new Promise(r => setTimeout(r, 1000));
      intentos++;
    }
  }

  if (filaEncontrada === -1) {
    console.error("No se encontró el ID en la Hoja 2 para guardar el polígono.");
    return;
  }

  const idGisStr = String(datosGis.idGis);
  const geoJsonStr = JSON.stringify(datosGis.geoJson);

  // Escribir múltiples rangos simultáneamente sin afectar la columna G (fotos)
  const urlBatch = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
  const body = {
    valueInputOption: "USER_ENTERED",
    data: [
      { range: `'Coordenadas IDGIS'!F${filaEncontrada}`, values: [[idGisStr]] },  // Columna 6
      { range: `'Coordenadas IDGIS'!H${filaEncontrada}`, values: [[geoJsonStr]] } // Columna 8
    ]
  };

  try {
    await fetch(urlBatch, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    console.log("✅ Polígono GIS guardado en Hoja 2 exitosamente.");
  } catch (e) {
    console.error("Error al escribir el polígono en Hoja 2:", e);
  }
};