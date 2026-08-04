// =================================================================
// MÓDULO 4: CONVERSOR DE ENLACES CON DETECCIÓN MULTI-CAPA
// =================================================================

function convertirEnlaceAutomatico(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== "Relevamiento de Terrenos/Propietarios") return;
  
  const col = e.range.getColumn();
  const row = e.range.getRow();
  
  // Columna 7 (G) = Enlace Maps, a partir de la fila 6
  if (col === 7 && row >= 6) {
    const celda = e.range;
    
    // --- PASO A: EXTRAER LA URL REAL DE LA CELDA (MULTICAPA) ---
    let enlace = extraerUrlRealDeCelda(celda, e);

    Logger.log("🔎 Fila " + row + " - Contenido detectado: '" + enlace + "'");

    if (!enlace || enlace.startsWith("⏳") || enlace.includes("maps.google.com/maps?q=")) {
      Logger.log("⏭️ Se omite fila " + row + " (Celda vacía, en proceso o ya convertida).");
      return;
    }

    if (enlace.includes("http") || enlace.includes("maps") || enlace.includes("goo.gl")) {
      const enlaceOriginal = enlace;
      
      celda.setValue("⏳ Convirtiendo enlace...");
      SpreadsheetApp.flush();
      
      let coords = obtenerCoordenadasConMotorNativo(enlaceOriginal, celda);
      
      if (coords && coords.lat && coords.lng) {
        const urlLimpia = "https://maps.google.com/maps?q=" + coords.lat + "," + coords.lng;
        celda.setValue(urlLimpia);
        SpreadsheetApp.flush();
        Logger.log("✅ ÉXITO en fila " + row + ": " + urlLimpia);
      } else {
        // Restaurar enlace si falla
        celda.setValue(enlaceOriginal);
        SpreadsheetApp.flush();
        Logger.log("❌ NO SE EXTRAJERON COORDENADAS en fila " + row + " para: " + enlaceOriginal);
      }
    }
  }
}

/**
 * Extrae la URL oculta sin importar si viene como Smart Chip, Hyperlink o Texto
 */
function extraerUrlRealDeCelda(celda, e) {
  let url = "";

  // 1. Probar desde RichText (Captura Smart Chips y Links embebidos)
  try {
    const richText = celda.getRichTextValue();
    if (richText) {
      if (richText.getLinkUrl()) {
        url = richText.getLinkUrl();
      } else {
        // Buscar dentro de los fragmentos de texto (runs)
        const runs = richText.getRuns();
        for (let run of runs) {
          if (run.getLinkUrl()) {
            url = run.getLinkUrl();
            break;
          }
        }
      }
    }
  } catch(err) {}

  // 2. Si no hay RichText, probar fórmula =HYPERLINK()
  if (!url) {
    try {
      const formula = celda.getFormula();
      if (formula && formula.toUpperCase().includes("HYPERLINK")) {
        const match = formula.match(/"(https?:\/\/[^"]+)"/i);
        if (match) url = match[1];
      }
    } catch(err) {}
  }

  // 3. Probar evento e.value
  if (!url && e && e.value) {
    url = String(e.value);
  }

  // 4. Fallback a valores planos de la celda
  if (!url) {
    url = String(celda.getValue() || celda.getDisplayValue() || "");
  }

  // Limpiar espacios en blanco, saltos de línea y caracteres invisibles (\u00A0)
  return String(url).replace(/[\r\n\t\u00A0]/g, "").trim();
}

/**
 * Resuelve las coordenadas usando RegEx + Geocoder Nativo + Desempaquetado HTTP
 */
function obtenerCoordenadasConMotorNativo(textoOURl, celda) {
  if (!textoOURl) return null;
  let str = String(textoOURl).trim();
  
  // 1. Extraer directo por RegEx si la URL tiene los números visibles
  let directCoords = extraerCoordsPorRegex(str);
  if (directCoords) return directCoords;

  // 2. Usar el servicio integrado de Google Maps (Maps.newGeocoder)
  try {
    const geocoder = Maps.newGeocoder().setRegion('ar');
    let response = geocoder.geocode(str);
    
    if (response.status === 'OK' && response.results.length > 0) {
      const loc = response.results[0].geometry.location;
      return validarYFormatearCoords(loc.lat, loc.lng);
    }
  } catch(e) {
    Logger.log("Aviso Geocoder: " + e.message);
  }

  // 3. Fallback UrlFetchApp para URLs cortas de celular
  if (str.includes("http")) {
    try {
      let res = UrlFetchApp.fetch(str, { 
        followRedirects: true, 
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      let html = res.getContentText() || "";
      let tokenMatch = html.match(/!3d(-27\.\d+)!4d(-55\.\d+)/) || 
                       html.match(/center=(-27\.\d+)%2C(-55\.\d+)/) ||
                       html.match(/(-27\.\d{4,12})\s*,\s*(-55\.\d{4,12})/);
                       
      if (tokenMatch) {
        return validarYFormatearCoords(parseFloat(tokenMatch[1]), parseFloat(tokenMatch[2]));
      }
    } catch(err) {}
  }

  return null;
}

function extraerCoordsPorRegex(urlStr) {
  let decoded = decodeURIComponent(String(urlStr));
  const regexList = [ 
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, 
    /q=(-?\d+\.\d+),(-?\d+\.\d+)/, 
    /place\/[^\/]+\/(-?\d+\.\d+),(-?\d+\.\d+)/,
    /place\/(-?\d+\.\d+),(-?\d+\.\d+)/, 
    /search\/(-?\d+\.\d+),(-?\d+\.\d+)/, 
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, 
    /ll=(-?\d+\.\d+),(-?\d+\.\d+)/ 
  ];
  
  for (let r of regexList) {
    let match = decoded.match(r);
    if (match) {
      return validarYFormatearCoords(parseFloat(match[1]), parseFloat(match[2]));
    }
  }
  return null;
}

function validarYFormatearCoords(lat, lng) {
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    lat = -Math.abs(lat);
    lng = -Math.abs(lng);
    
    // Filtro amplio Misiones / Posadas
    if (Math.abs(lat) >= 26 && Math.abs(lat) <= 29 && Math.abs(lng) >= 53 && Math.abs(lng) <= 57) {
      return { 
        lat: parseFloat(lat.toFixed(6)), 
        lng: parseFloat(lng.toFixed(6)) 
      };
    }
  }
  return null;
}
