// =================================================================
// MÓDULO 2: NÚCLEO (Solo lectura de datos básicos)
// =================================================================

function ModuloNucleo_obtenerMarcadores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMain = ss.getSheetByName("Relevamiento de Terrenos/Propietarios");
  const sheetCoords = ss.getSheetByName("Coordenadas IDGIS");

  if (!sheetMain) throw new Error("No se encontró la hoja principal.");

  let mapaCoordenadas = {};
  try {
    if (sheetCoords) {
      const dataCoords = sheetCoords.getRange(2, 1, Math.max(1, sheetCoords.getLastRow()), 3).getValues();
      for (let i = 0; i < dataCoords.length; i++) {
        if (dataCoords[i][0]) {
          mapaCoordenadas[String(dataCoords[i][0])] = { lat: dataCoords[i][1], lng: dataCoords[i][2] };
        }
      }
    }
  } catch(e) {}

  const dataMain = sheetMain.getRange(6, 1, Math.max(6, sheetMain.getLastRow()) - 5, 30).getValues();
  let marcadores = [];

  const getVal = (row, index) => row.length > index ? String(row[index] || "") : "";

  for (let i = 0; i < dataMain.length; i++) {
    const idTerreno = getVal(dataMain[i], 0);
    if (!idTerreno) continue;

    const visitado = getVal(dataMain[i], 2);      
    const distrito = getVal(dataMain[i], 3);
    const barrio = getVal(dataMain[i], 4);  
    const direccion = getVal(dataMain[i], 5);
    const enlaceMaps = getVal(dataMain[i], 6); 
    const tipoLote = getVal(dataMain[i], 7);
    const estado = getVal(dataMain[i], 8);  
    const supTotal = getVal(dataMain[i], 11);
    const relevo = getVal(dataMain[i], 14);
    const calificacion = getVal(dataMain[i], 20); 
    const propietario = getVal(dataMain[i], 22);  
    const contacto = getVal(dataMain[i], 23);     
    const estadoNeg = getVal(dataMain[i], 24);    
    const vendedor = getVal(dataMain[i], 25);     
    const notas = getVal(dataMain[i], 29);        
    const poligono = dataMain[i].length > 29 ? dataMain[i][29] : null;             
    
    let isVisitado = (visitado.trim().toLowerCase() === "sí" || visitado.trim().toLowerCase() === "si");
    let isDesfavorable = (calificacion.trim().toUpperCase() === "DESFAVORABLE");
    let isDescartado = (estadoNeg.trim().toLowerCase() === "descartado");

    let colorPin = "#9aa0a6";
    let isTachado = false;

    if (isDescartado) {
      colorPin = "#ea4335";
      isTachado = true;
    } else {
      if (isVisitado) {
        colorPin = isDesfavorable ? "#ea4335" : "#34a853"; 
      } else {
        colorPin = isDesfavorable ? "#ea4335" : "#9aa0a6"; 
      }
    }

    let lat = null, lng = null;
    if (mapaCoordenadas[idTerreno] && mapaCoordenadas[idTerreno].lat) {
      lat = mapaCoordenadas[idTerreno].lat; lng = mapaCoordenadas[idTerreno].lng;
    } else if (enlaceMaps && enlaceMaps.includes("?q=")) {
      let match = enlaceMaps.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (match) { lat = parseFloat(match[1]); lng = parseFloat(match[2]); }
    }

    if (lat !== null && lng !== null && lat !== "" && lng !== "") {
      marcadores.push({
        id: idTerreno,
        lat: lat,
        lng: lng,
        visitado: visitado,
        distrito: distrito,
        barrio: barrio,
        direccion: direccion,
        tipoLote: tipoLote,
        estado: estado,
        supTotal: supTotal,
        relevo: relevo, 
        propietario: propietario,
        contacto: contacto,
        vendedor: vendedor,
        notas: notas,
        poligono: poligono,
        color: colorPin,
        tachado: isTachado
      });
    }
  }
  return marcadores;
}

function ModuloNucleo_obtenerOpciones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetIU = ss.getSheetByName("Indicadores Urbanos");
  let distritos = [];
  if (sheetIU) distritos = [...new Set(sheetIU.getRange("B2:B" + Math.max(2, sheetIU.getLastRow())).getValues().flat().filter(v => v !== ""))].sort();
  
  const sheetMain = ss.getSheetByName("Relevamiento de Terrenos/Propietarios");
  let vendedores = [];
  if (sheetMain) vendedores = [...new Set(sheetMain.getRange("Z6:Z" + Math.max(6, sheetMain.getLastRow())).getValues().flat().filter(v => v !== ""))].sort();
  
  return { distritos: distritos, vendedores: vendedores };
}