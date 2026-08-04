// =================================================================
// MÓDULO 3: ESCRITURA DE DATOS (Añadir y Editar)
// =================================================================

function agregarTerreno(datos) {
  try {
    const sheetMain = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Relevamiento de Terrenos/Propietarios");
    let filaVacia = 6;
    const ultimaFila = sheetMain.getLastRow();
    
    if (ultimaFila >= 6) {
      const valores = sheetMain.getRange(6, 2, Math.max(6, ultimaFila) - 5, 5).getValues();
      for (let i = 0; i < valores.length; i++) {
        if (valores[i][0] !== "" || valores[i][3] !== "" || valores[i][4] !== "") filaVacia++;
        else break;
      }
    }
    
    const latRedondeada = parseFloat(datos.lat).toFixed(6);
    const lngRedondeada = parseFloat(datos.lng).toFixed(6);
    
    sheetMain.getRange(filaVacia, 3).setValue(datos.visitado);         // Columna C
    sheetMain.getRange(filaVacia, 4).setValue(datos.distrito);         // Columna D
    sheetMain.getRange(filaVacia, 5).setValue(datos.barrio);           // Columna E
    sheetMain.getRange(filaVacia, 6).setValue(datos.direccion);        // Columna F
    const enlaceMaps = "https://maps.google.com/maps?q=" + latRedondeada + "," + lngRedondeada;
    sheetMain.getRange(filaVacia, 7).setValue(enlaceMaps);             // Columna G
    sheetMain.getRange(filaVacia, 8).setValue(datos.tipoLote);         // Columna H
    sheetMain.getRange(filaVacia, 9).setValue(datos.estadoActual);     // Columna I
    sheetMain.getRange(filaVacia, 10).setValue(datos.frente);          // Columna J
    sheetMain.getRange(filaVacia, 11).setValue(datos.fondo);           // Columna K
    sheetMain.getRange(filaVacia, 15).setValue(datos.relevo);          // Columna O (¡Listo!)
    sheetMain.getRange(filaVacia, 23).setValue(datos.propietario);     // Columna W
    sheetMain.getRange(filaVacia, 24).setValue(datos.contacto);        // Columna X
    sheetMain.getRange(filaVacia, 26).setValue(datos.vendedor);        // Columna Z
    sheetMain.getRange(filaVacia, 30).setValue(datos.notas);           // Columna AD
    
    PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());
    SpreadsheetApp.flush();
    
    let idGenerado = "", intentos = 0;
    while (idGenerado === "" && intentos < 5) {
      Utilities.sleep(1000);
      idGenerado = sheetMain.getRange(filaVacia, 1).getValue();
      intentos++;
    }
    return idGenerado || ("Fila " + filaVacia);
  } catch(e) { throw new Error("Error al guardar: " + e.message); }
}

function actualizarTerreno(id, datos) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Relevamiento de Terrenos/Propietarios");
    const ids = sheet.getRange(6, 1, Math.max(6, sheet.getLastRow()) - 5, 1).getValues();
    let fila = -1;
    for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(id)) { fila = i + 6; break; } }
    
    if (fila !== -1) {
      sheet.getRange(fila, 3).setValue(datos.visitado);      // Columna C
      sheet.getRange(fila, 4).setValue(datos.distrito);      // Columna D
      sheet.getRange(fila, 5).setValue(datos.barrio);        // Columna E
      sheet.getRange(fila, 6).setValue(datos.direccion);     // Columna F
      sheet.getRange(fila, 8).setValue(datos.tipoLote);      // Columna H
      sheet.getRange(fila, 9).setValue(datos.estadoActual);  // Columna I
      sheet.getRange(fila, 10).setValue(datos.frente);       // Columna J
      sheet.getRange(fila, 11).setValue(datos.fondo);        // Columna K
      sheet.getRange(fila, 15).setValue(datos.relevo);       // Columna O (¡Listo!)
      sheet.getRange(fila, 23).setValue(datos.propietario);  // Columna W
      sheet.getRange(fila, 24).setValue(datos.contacto);     // Columna X
      sheet.getRange(fila, 26).setValue(datos.vendedor);     // Columna Z
      sheet.getRange(fila, 30).setValue(datos.notas);        // Columna AD
      PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());
      return true;
    }
    throw new Error("No se encontró el terreno.");
  } catch(e) { throw new Error("Error al actualizar: " + e.message); }
}

// --- GEOCODIFICACIÓN INVERSA (Búsqueda de Calles Mejorada) ---
function obtenerDireccionPorCoordenadas(lat, lng) {
  try {
    const response = Maps.newGeocoder().reverseGeocode(lat, lng);
    if (response.status === 'OK' && response.results.length > 0) {
      let direccionCompleta = response.results[0].formatted_address;
      let calleYAltura = direccionCompleta.split(',')[0]; 
      if (!calleYAltura.includes("+")) {
        return calleYAltura;
      }
    }
  } catch(e) { }
  return ""; 
}