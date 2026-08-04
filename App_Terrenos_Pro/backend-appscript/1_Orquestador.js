// =================================================================
// MÓDULO 1: ORQUESTADOR Y CONFIGURACIÓN
// =================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🗺️ Mapa Dinámico')
    .addItem('Abrir Mapa General', 'abrirVisor')
    .addItem('📸 Subir Fotos al Terreno', 'abrirSubirFotos')
    .addToUi();
}

function abrirVisor() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('Mapa de Terrenos')
      .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
}

function seleccionarFila(fila) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Relevamiento de Terrenos/Propietarios").getRange(fila, 1, 1, 29).activate();
}

// --- FUNCIONES PARA EL CELULAR (WEB APP) ---
function doGet() {
  return HtmlService.createTemplateFromFile('WebApp')
      .evaluate()
      .setTitle('App Terrenos Posadas')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =================================================================
// 🟢 FUNCIÓN PRINCIPAL PARA EL ACTIVADOR DEL RELOJ ⏰
// =================================================================

function alModificarPlanilla(e) {
  // 1. Marca de tiempo para la PWA
  PropertiesService.getDocumentProperties().setProperty('LAST_UPDATE', Date.now().toString());

  // 2. Procesar Catastro e IDGIS directamente desde el link de la celda
  if (e && e.range) {
    try {
      procesarCatastroDesdeLink(e);
    } catch(err) {
      Logger.log("Error en procesamiento de Catastro: " + err.message);
    }
  }
}

function getEstadoPlanilla() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Relevamiento de Terrenos/Propietarios");
    const row = sheet.getActiveCell().getRow();
    let selectedId = "";
    if (row >= 6) selectedId = String(sheet.getRange(row, 1).getValue());
    const lastUpdate = PropertiesService.getDocumentProperties().getProperty('LAST_UPDATE') || "0";
    return { id: selectedId, update: lastUpdate };
  } catch(e) { return null; }
}

function obtenerUbicaciones() {
  try {
    let marcadores = ModuloNucleo_obtenerMarcadores();
    const lastUpdate = PropertiesService.getDocumentProperties().getProperty('LAST_UPDATE') || "0";
    return { marcadores: marcadores, updateToken: lastUpdate };
  } catch (e) {
    throw new Error("Fallo en el Orquestador: " + e.message);
  }
}

function obtenerOpcionesDesplegables() {
  try {
    return ModuloNucleo_obtenerOpciones();
  } catch(e) {
    throw new Error("Error al cargar opciones: " + e.message);
  }
}

function orquestador_obtenerFotos(idTerreno) {
  try { return ModuloImagenes_obtenerFotos(idTerreno); } 
  catch (e) { return []; }
}

function comprobarCambios() {
  return PropertiesService.getDocumentProperties().getProperty('LAST_UPDATE') || "0";
}

// =================================================================
// 🚀 API REST PARA LA PWA DE NETLIFY
// =================================================================
function doPost(e) {
  try {
    let request = JSON.parse(e.postData.contents);
    let action = request.action;
    let data = request.data || {};
    let result = null;

    if (action === "obtenerUbicaciones") {
      result = obtenerUbicaciones();
    } else if (action === "obtenerOpcionesDesplegables") {
      result = obtenerOpcionesDesplegables();
    } else if (action === "orquestador_obtenerFotos") {
      result = orquestador_obtenerFotos(data.idTerreno);
    } else if (action === "agregarTerreno") {
      result = agregarTerreno(data);
    } else if (action === "actualizarTerreno") {
      result = actualizarTerreno(data.id, data);
    } else if (action === "subirImagenDrive") {
      result = subirImagenDrive(data.base64, data.idTerreno, data.mimeType);
    } else if (action === "eliminarFotoTerreno") {
      result = eliminarFotoTerreno(data.idTerreno, data.idFoto);
    } else if (action === "obtenerDireccionPorCoordenadas") {
      result = obtenerDireccionPorCoordenadas(data.lat, data.lng);
    } else if (action === "comprobarCambios") {
      result = comprobarCambios();
    } else {
      throw new Error("Acción de API no reconocida: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: result
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 🔓 LLAVERO DE AUTORIZACIÓN DE PERMISOS
// ==========================================
function SOLICITAR_PERMISOS_MANUALES() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const respuesta = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  Logger.log("✅ PERMISOS CONCEDIDOS CORRECTAMENTE. Código HTTP: " + respuesta.getResponseCode());
}