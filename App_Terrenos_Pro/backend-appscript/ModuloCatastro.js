// =================================================================
// MÓDULO CATASTRO: API VISOR WEB MISIONES (MAPA CATASTRO)
// =================================================================

/**
 * Escucha la modificación en la Columna G de Hoja 1, extrae las coordenadas 
 * y actualiza IDGIS en Hoja 1 (Col B) y GeoJSON en Hoja 2 (Col H).
 */
function procesarCatastroDesdeLink(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== "Relevamiento de Terrenos/Propietarios") return;

  const row = e.range.getRow();
  if (row < 6) return; // Omitir encabezados

  const celdaMaps = sheet.getRange(row, 7); // Columna G
  let urlMaps = String(celdaMaps.getValue() || "").trim();

  if (!urlMaps || !urlMaps.includes("?q=")) return;

  Logger.log(`🔎 Fila ${row}: Procesando enlace -> ${urlMaps}`);
  const coords = extraerCoordsOnTheFly(urlMaps);

  if (coords) {
    Logger.log(`🎯 Coordenadas: Lat=${coords.lat}, Lng=${coords.lng}`);
    try {
      consultarYGuardarCatastro(sheet, row, coords.lat, coords.lng);
    } catch (err) {
      Logger.log(`⚠️ Error en consulta de Catastro: ${err.message}`);
    }
  }
}

/**
 * Extrae latitud y longitud a partir de la URL formateada ?q=lat,lng
 */
function extraerCoordsOnTheFly(urlStr) {
  if (!urlStr) return null;
  const decoded = decodeURIComponent(String(urlStr));

  try {
    if (decoded.includes("?q=")) {
      const parteCoords = decoded.split("?q=")[1].split("&")[0];
      const partes = parteCoords.split(",");
      let lat = parseFloat(partes[0].trim());
      let lng = parseFloat(partes[1].trim());

      lat = -Math.abs(lat);
      lng = -Math.abs(lng);

      if (Math.abs(lat) >= 26 && Math.abs(lat) <= 29 && Math.abs(lng) >= 53 && Math.abs(lng) <= 57) {
        return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
      }
    }
  } catch(e) {}
  return null;
}

/**
 * 🌐 ORQUESTADOR DE ESCRITURA EN HOJAS
 */
function consultarYGuardarCatastro(hoja1, fila, lat, lng) {
  const resultadoCatastro = obtenerDatosCatastro(lat, lng);
  
  if (!resultadoCatastro) {
    Logger.log("❌ No se pudieron obtener datos del visor de Catastro.");
    return;
  }

  const { idGis, geoJson } = resultadoCatastro;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. ESCRIBIR EN HOJA 1: IDGIS en Columna B (Columna 2)
  if (idGis) {
    hoja1.getRange(fila, 2).setValue(idGis);
    Logger.log(`📝 Hoja 1 - Fila ${fila} - Columna B -> IDGIS: ${idGis}`);
  }

  // 2. ESCRIBIR EN HOJA 2: GeoJSON en Columna H (Columna 8)
  let hoja2 = ss.getSheetByName("PuntosGeograficos") || ss.getSheetByName("Coordenadas IDGIS"); 
  if (!hoja2) {
    const hojas = ss.getSheets();
    if (hojas.length >= 2) hoja2 = hojas[1]; // Fallback a la segunda hoja
  }

  if (hoja2 && geoJson) {
    hoja2.getRange(fila, 8).setValue(geoJson);
    Logger.log(`🗺️ Hoja 2 (${hoja2.getName()}) - Fila ${fila} - Columna H -> GeoJSON escrito.`);
  }

  SpreadsheetApp.flush();
}

/**
 * 🌐 MOTOR DE BÚSQUEDA: VISOR WEB MISIONES
 */
function obtenerDatosCatastro(lat, lng) {
  try {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    // Paso 1: Convertir Lat/Lng a Metros Mercator vía API (o matemáticas)
    const textoBusqueda = `${latNum}, ${lngNum}`;
    const urlFind = `https://www.mapa.catastro.misiones.gov.ar/mapaCatastro/findGeneric?text=${encodeURIComponent(textoBusqueda)}&epsg=EPSG:3857`;
    
    let xMercator = null, yMercator = null;

    try {
      const respFind = UrlFetchApp.fetch(urlFind, { muteHttpExceptions: true });
      if (respFind.getResponseCode() === 200) {
        const jsonFind = JSON.parse(respFind.getContentText());
        if (jsonFind.wkt) {
          const matchCoords = jsonFind.wkt.match(/POINT\(([-0-9\.]+)\s+([-0-9\.]+)\)/i);
          if (matchCoords) {
            xMercator = matchCoords[1];
            yMercator = matchCoords[2];
          }
        }
      }
    } catch(e) {}

    // Fallback matemático si falla la API de Mercator
    if (!xMercator || !yMercator) {
      const [xCalc, yCalc] = latLngToMercator(latNum, lngNum);
      xMercator = xCalc;
      yMercator = yCalc;
    }

    // Paso 2: Consultar información de parcela con coordenadas Mercator
    const urlInfo = `https://www.mapa.catastro.misiones.gov.ar/mapaCatastro/info?layersLocal=mapa:BaseCatastral_t&epsg=EPSG:3857&resolution=0&x=${xMercator}&y=${yMercator}`;
    
    const respInfo = UrlFetchApp.fetch(urlInfo, { muteHttpExceptions: true });
    if (respInfo.getResponseCode() !== 200) return null;

    const jsonArr = JSON.parse(respInfo.getContentText());
    let idGis = null, wktString = null;

    if (Array.isArray(jsonArr)) {
      const itemWkt = jsonArr.find(obj => obj.showFormat === "WKTCCA");
      if (itemWkt) {
        if (itemWkt.cca) idGis = String(itemWkt.cca).trim();
        if (itemWkt.wkt) wktString = itemWkt.wkt;
      }
    }

    return {
      idGis: idGis,
      geoJson: wktString ? convertirWktAGeoJSON(wktString) : null
    };

  } catch (err) {
    Logger.log(`❌ Error procesando coordenadas: ${err.message}`);
    return null;
  }
}

/**
 * 🧮 PARSER MATEMÁTICO: WKT (Mercator) ➔ GeoJSON (WGS84)
 */
function convertirWktAGeoJSON(wkt) {
  try {
    const match = wkt.match(/POLYGON\s*\(\((.*?)\)\)/i);
    if (!match || !match[1]) return null;

    const pares = match[1].split(',');
    const coordinates = [];

    pares.forEach(par => {
      const partes = par.trim().split(/\s+/);
      if (partes.length >= 2) {
        const x = parseFloat(partes[0]);
        const y = parseFloat(partes[1]);

        if (!isNaN(x) && !isNaN(y)) {
          if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
            coordinates.push([x, y]); // Ya están en grados
          } else {
            const [lat, lng] = mercatorToLatLng(x, y); // Convertir de Mercator a LatLng
            coordinates.push([lng, lat]); // Formato [Lng, Lat] para GeoJSON
          }
        }
      }
    });

    if (coordinates.length < 3) return null;

    return JSON.stringify({ type: "Polygon", coordinates: [coordinates] });
  } catch (e) {
    return null;
  }
}

function mercatorToLatLng(x, y) {
  const rMajor = 6378137;
  const lng = (x / rMajor) * (180 / Math.PI);
  const latRad = Math.atan(Math.exp(y / rMajor));
  const lat = (2 * latRad - Math.PI / 2) * (180 / Math.PI);
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))];
}

function latLngToMercator(lat, lng) {
  const rMajor = 6378137;
  const x = rMajor * (lng * Math.PI / 180);
  const scale = Math.sin(lat * Math.PI / 180);
  const y = 0.5 * rMajor * Math.log((1 + scale) / (1 - scale));
  return [x.toFixed(4), y.toFixed(4)];
}

// =================================================================
// 🧪 FUNCIÓN DE PRUEBA MANUAL
// =================================================================
function probarCatastroManualmente() {
  const filaPrueba = 6; 
  const urlTest = "https://www.google.com/maps?q=-27.399204,-55.948992"; 
  
  Logger.log("🚀 INICIANDO PRUEBA MANUAL...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja1 = ss.getSheetByName("Relevamiento de Terrenos/Propietarios") || ss.getSheets()[0];

  hoja1.getRange(filaPrueba, 7).setValue(urlTest);
  SpreadsheetApp.flush();
  
  const coords = extraerCoordsOnTheFly(urlTest);
  if (coords) {
    Logger.log(`🎯 Coordenadas listas. Lat=${coords.lat}, Lng=${coords.lng}`);
    consultarYGuardarCatastro(hoja1, filaPrueba, coords.lat, coords.lng);
    Logger.log("🎉 PRUEBA COMPLETADA CON ÉXITO.");
  }
}