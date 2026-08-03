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
  if (!silencioso && typeof mostrarToast === 'function') {
    mostrarToast("Sincronizando datos...");
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

    if (typeof markersGroup !== 'undefined' && markersGroup) markersGroup.clearLayers();

    // 1. Memorizar Coordenadas desde Hoja 2
    let diccionarioCoords = {};
    if (window.Poligonos) window.Poligonos.limpiarPermanentes(); // Limpiar vectores anteriores

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

    // 2. Dibujar Pines desde Hoja 1
    let casitasPintadas = 0;

    for (let i = 1; i < filasDatos.length; i++) {
      let fila = filasDatos[i];
      let idCrudo = fila[0]; // Columna A (ID Terreno)

      if (idCrudo) {
        let idLimpio = String(idCrudo).trim();

        if (diccionarioCoords[idLimpio]) {
          let latStr = String(diccionarioCoords[idLimpio].lat || "");
          let lngStr = String(diccionarioCoords[idLimpio].lng || "");

          if (latStr.includes("-") && lngStr.includes("-")) {
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
              fotosIds: diccionarioCoords[idLimpio].fotosIds
            };

            if (typeof dibujarPinEnMapa === 'function') {
              dibujarPinEnMapa(lat, lng, idLimpio, colorHex, direccion, ficha);
              casitasPintadas++;
              
              // 🟢 NUEVO: Dibujar el polígono permanente usando la Source of Truth
              if (window.Poligonos && diccionarioCoords[idLimpio].geoJsonStr) {
                window.Poligonos.dibujarPermanente(diccionarioCoords[idLimpio].geoJsonStr, colorHex);
              }
            }
          }
        }
      }
    }

    if (typeof ajustarVistaMapa === 'function') ajustarVistaMapa();

    if (!silencioso && typeof ocultarToast === 'function') {
      ocultarToast();
    }
    console.log(`✅ Pines actualizados con éxito: ${casitasPintadas}`);

  } catch (error) {
    console.error("Error API:", error);
    if (!silencioso) alert("Fallo al leer datos: " + error.message);
    if (typeof ocultarToast === 'function') ocultarToast();
  }
}

// ==========================================
// GUARDAR O EDITAR TERRENO EN GOOGLE SHEETS
// ==========================================

// 🟢 Arma el array de columnas B→AD a partir de los datos del formulario.
// Se usa tanto para editar (PUT a una fila puntual) como para dar de alta
// un terreno nuevo (append), así los dos caminos escriben exactamente lo mismo.
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
      if (typeof mostrarToast === 'function') mostrarToast("Renovando sesión de Google...");

      const nuevoToken = await window.renovarToken();
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

    // 🟢 CASO B: TERRENO NUEVO — usamos "append" en vez de calcular la fila
    // nosotros mismos. Google Sheets decide de forma ATÓMICA en qué fila
    // libre escribe en el momento exacto del guardado, del lado del
    // servidor. Así, si dos personas del equipo guardan un terreno nuevo
    // casi al mismo tiempo, Sheets les asigna filas distintas sin que
    // ninguna pise a la otra (que es justo lo que pasaba antes).
    const filaHoja1Nueva = [""].concat(construirFilaHoja1(datos, enlaceMapsActual)); // "" en A: la completa la fórmula de la planilla
    const rangoAppend = "'Relevamiento de Terrenos/Propietarios'!A6:AD";
    const urlAppend = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(rangoAppend)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const respAppend = await fetch(urlAppend, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [filaHoja1Nueva] })
    });

    const resultadoAppend = await respAppend.json();
    if (resultadoAppend.error) throw new Error(resultadoAppend.error.message);

    // Extraemos el número de fila real que Sheets asignó, desde la respuesta
    // (viene como algo tipo "'Hoja'!B57:AD57")
    const rangoAsignado = resultadoAppend.updates?.updatedRange || "";
    const matchFila = rangoAsignado.match(/![A-Z]+(\d+)/);
    const filaAsignada = matchFila ? parseInt(matchFila[1], 10) : null;

    if (!filaAsignada) {
      throw new Error("Sheets no devolvió la fila asignada tras guardar el terreno nuevo.");
    }

    const idAsignadoAlTerreno = `POS${String(filaAsignada - 5).padStart(3, '0')}`;

    if (window.datosGisTemporales) {
      window.guardarGisEnHoja2(idAsignadoAlTerreno, window.datosGisTemporales);
      window.datosGisTemporales = null;
    }

    return idAsignadoAlTerreno;

  } catch (error) {
    console.error("Error al guardar/actualizar en Sheets:", error);
    if (typeof removerPinFantasma === 'function') removerPinFantasma();
    alert("Error al guardar en base de datos: " + error.message);
    if (typeof ocultarToast === 'function') ocultarToast();
    return null;
  }
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