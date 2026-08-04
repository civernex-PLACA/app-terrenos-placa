// =================================================================
// MÓDULO 5: MANEJO DE IMÁGENES Y GOOGLE DRIVE (Sincronizado con PWA)
// =================================================================

const FOLDER_ID = "1aHzoGtmkosQfPsqje_R6MjlWGBxQFyvr"; // Tu carpeta de fotos

// --- OBTENER FOTOS (LAZY LOADING) ---
function ModuloImagenes_obtenerFotos(idTerreno) {
  const sheetCoords = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coordenadas IDGIS");
  if (!sheetCoords) return [];
  
  const data = sheetCoords.getDataRange().getValues(); 
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(idTerreno).trim()) {
      let celdaFotos = data[i][6] ? String(data[i][6]).trim() : ""; // Columna G (Índice 6)
      if (!celdaFotos) return [];
      
      // Separamos los IDs guardados por coma y filtramos vacíos
      return celdaFotos.split(',').map(id => id.trim()).filter(id => id !== "");
    }
  }
  return [];
}

// --- ABRIR VENTANA PARA SUBIR FOTOS DESDE LA PC ---
function abrirSubirFotos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== "Relevamiento de Terrenos/Propietarios") {
    return SpreadsheetApp.getUi().alert("Sitúate en la hoja 'Relevamiento de Terrenos/Propietarios'.");
  }
  const row = sheet.getActiveCell().getRow();
  if (row < 6) return SpreadsheetApp.getUi().alert("Selecciona la fila de un terreno válido.");
  
  const idTerreno = sheet.getRange(row, 1).getValue();
  if (!idTerreno) return SpreadsheetApp.getUi().alert("La fila seleccionada no tiene un ID de Terreno.");
  
  const html = HtmlService.createTemplateFromFile('SubirFotos');
  html.idTerreno = idTerreno;
  SpreadsheetApp.getUi().showModalDialog(html.evaluate().setWidth(400).setHeight(320), 'Subir Fotos: ' + idTerreno);
}

// --- PROCESAR Y SUBIR IMAGEN A DRIVE ---
function subirImagenDrive(base64Data, idTerreno, mimeType) {
  try {
    const carpeta = DriveApp.getFolderById(FOLDER_ID);
    const splitBase = base64Data.split(',');
    const tipo = splitBase[0].split(';')[0].replace('data:', '') || mimeType;
    const byteCharacters = Utilities.base64Decode(splitBase[1]);
    const blob = Utilities.newBlob(byteCharacters, tipo, "temp_image");
    
    let extension = ".jpg"; 
    if (tipo.includes("png")) extension = ".png";
    else if (tipo.includes("webp")) extension = ".webp";
    else if (tipo.includes("gif")) extension = ".gif";
    
    const sheetCoords = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coordenadas IDGIS");
    
    let fila = -1;
    let idsExistentes = [];
    let intentos = 0;
    
    // BUCLE DE ESPERA: Le damos tiempo a la ARRAYFORMULA de la Hoja 2 para que copie el ID
    while (fila === -1 && intentos < 5) {
      SpreadsheetApp.flush(); // Obliga a Google Sheets a recalcular
      let dataCoords = sheetCoords.getDataRange().getValues();
      
      for (let i = 0; i < dataCoords.length; i++) {
        if (String(dataCoords[i][0]).trim() === String(idTerreno).trim()) {
          fila = i + 1;
          let celdaG = dataCoords[i][6] ? String(dataCoords[i][6]).trim() : "";
          if (celdaG) {
            idsExistentes = celdaG.split(',').map(id => id.trim()).filter(id => id !== "");
          }
          break;
        }
      }
      
      if (fila === -1) {
        Utilities.sleep(1000); // Pausa de 1 segundo
        intentos++;
      }
    }
    
    if (fila === -1) throw new Error("La Hoja 2 no se sincronizó a tiempo. Vuelve a intentarlo.");
    
    // Asignar letra correspondiente para la nomenclatura: POS119-A, POS119-B, etc.
    let indiceLetra = idsExistentes.length;
    let letra = String.fromCharCode(65 + indiceLetra); // 65 es 'A'
    
    // Nombrar y guardar en Drive
    blob.setName(idTerreno + "-" + letra + extension);
    const archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Concatenar el nuevo ID al string y guardarlo en la Columna G (Columna 7)
    idsExistentes.push(archivo.getId());
    let stringFinal = idsExistentes.join(',');
    
    sheetCoords.getRange(fila, 7).setValue(stringFinal);
    PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());
    
    return true;
  } catch (e) { throw new Error(e.message); }
}

// --- ELIMINAR FOTO EXISTENTE ---
function eliminarFotoTerreno(idTerreno, idFoto) {
  try {
    const sheetCoords = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Coordenadas IDGIS");
    const dataCoords = sheetCoords.getDataRange().getValues();
    
    for (let i = 0; i < dataCoords.length; i++) {
      if (String(dataCoords[i][0]).trim() === String(idTerreno).trim()) {
        let fila = i + 1;
        let celdaG = dataCoords[i][6] ? String(dataCoords[i][6]).trim() : "";
        if (!celdaG) return true;

        let idsExistentes = celdaG.split(',').map(id => id.trim()).filter(id => id !== "");
        let nuevosIds = idsExistentes.filter(id => id !== String(idFoto).trim());

        // Si cambió la cantidad de IDs, significa que encontramos la foto a borrar
        if (nuevosIds.length !== idsExistentes.length) {
          sheetCoords.getRange(fila, 7).setValue(nuevosIds.join(','));
          
          // Intentar enviar el archivo a la papelera en Drive
          try { DriveApp.getFileById(idFoto).setTrashed(true); } catch(e) {}
          
          PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());
          return true;
        }
      }
    }
    return true; 
  } catch(e) { throw new Error(e.message); }
}