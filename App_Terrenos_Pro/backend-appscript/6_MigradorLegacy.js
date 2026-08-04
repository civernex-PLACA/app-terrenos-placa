// =================================================================
// MÓDULO 6: HERRAMIENTA DE MIGRACIÓN Y LIMPIEZA LEGACY
// =================================================================

/**
 * Función principal: ejecuta la migración completa de Drive y Sheets.
 * Puedes ejecutarla manualmente desde el editor de Apps Script o desde el menú.
 */
function ejecutarMigracionLegacyCompleta() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert(
    'Mantenimiento y Migración Legacy',
    'Esta herramienta renombrará las fotos viejas en Drive (agregando el "-") y consolidará todas las IDs de las Columnas H, I y J en la Columna G de la Hoja 2.\n\n¿Deseas continuar?',
    ui.ButtonSet.YES_NO
  );

  if (respuesta !== ui.Button.YES) {
    ui.alert("Proceso cancelado por el usuario.");
    return;
  }

  try {
    // 1. Migrar archivos físicos en Drive
    let fotosRenombradas = migrarNombresFotosDrive();
    
    // 2. Migrar celdas en la Hoja 2
    let filasMigradas = migrarEstructuraColumnasHoja2();

    // 3. Notificar cambios
    PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());
    
    ui.alert(
      '¡Migración Exitosa! 🎉',
      `Resultados:\n- Fotos renombradas en Drive: ${fotosRenombradas}\n- Filas consolidadas en Hoja 2: ${filasMigradas}`,
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert("Error durante la migración: " + e.message);
  }
}

// -----------------------------------------------------------------
// 1. RENOMBRAR ARCHIVOS EN DRIVE (Añadir "-" faltante)
// -----------------------------------------------------------------
function migrarNombresFotosDrive() {
  const carpeta = DriveApp.getFolderById(FOLDER_ID);
  const archivos = carpeta.getFiles();
  let contador = 0;

  // Regex para detectar nombres viejos tipo "POS119A.jpg" o "LOTE05B.png" (ID + Letra Mayúscula + Extensión)
  // Captura el ID en Grupo 1 y la Letra en Grupo 2
  const regexViejo = /^([A-Za-z0-9]+)([A-Z])\.(jpg|png|webp|jpeg|gif)$/i;

  while (archivos.hasNext()) {
    let archivo = archivos.next();
    let nombreActual = archivo.getName();
    let match = nombreActual.match(regexViejo);

    // Si coincide con el formato viejo sin guión
    if (match) {
      let idTerreno = match[1];
      let letra = match[2];
      let extension = match[3];

      let nuevoNombre = `${idTerreno}-${letra}.${extension}`;
      archivo.setName(nuevoNombre);
      contador++;
      Logger.log(`Renombrado: ${nombreActual} ➔ ${nuevoNombre}`);
    }
  }

  return contador;
}

// -----------------------------------------------------------------
// 2. CONSOLIDAR COLUMNAS G, H, I, J EN COLUMNA G (Hoja 2)
// -----------------------------------------------------------------
function migrarEstructuraColumnasHoja2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetCoords = ss.getSheetByName("Coordenadas IDGIS");
  if (!sheetCoords) throw new Error("No se encontró la hoja 'Coordenadas IDGIS'.");

  const ultimaFila = sheetCoords.getLastRow();
  if (ultimaFila < 2) return 0; // No hay datos que procesar

  // Leemos el rango de datos desde la Fila 2 hasta la última (Columnas A a J)
  const rango = sheetCoords.getRange(2, 1, ultimaFila - 1, 10);
  const datos = rango.getValues();
  let filasProcesadas = 0;

  for (let i = 0; i < datos.length; i++) {
    let filaActual = datos[i];
    let idTerreno = filaActual[0]; // Columna A
    if (!idTerreno) continue;

    // Extraer valores de las columnas G, H, I y J (índices 6, 7, 8 y 9)
    let idsEnFila = [];
    for (let col = 6; col <= 9; col++) {
      let val = filaActual[col] ? String(filaActual[col]).trim() : "";
      if (val !== "") {
        // Si por algún motivo ya había valores separados por comas en alguna celda, los dividimos
        let desglosados = val.split(',').map(id => id.trim()).filter(id => id !== "");
        idsEnFila = idsEnFila.concat(desglosados);
      }
    }

    // Si encontramos IDs en las columnas
    if (idsEnFila.length > 0) {
      let stringUnificado = idsExistentesUnicos(idsEnFila).join(',');
      let numFilaReal = i + 2; // +2 porque el array empezó en fila 2 (índice 0)

      // 1. Guardar la lista completa en la Columna G (Columna 7)
      sheetCoords.getRange(numFilaReal, 7).setValue(stringUnificado);

      // 2. Si había algo en las columnas H, I o J (8, 9, 10), las limpiamos
      if (filaActual[7] || filaActual[8] || filaActual[9]) {
        sheetCoords.getRange(numFilaReal, 8, 1, 3).clearContent();
        filasProcesadas++;
      }
    }
  }

  SpreadsheetApp.flush();
  return filasProcesadas;
}

// Función auxiliar para eliminar duplicados de un array si existieran
function idsExistentesUnicos(array) {
  return array.filter((item, pos) => array.indexOf(item) === pos);
}