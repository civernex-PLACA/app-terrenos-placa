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
    for (let i = 1; i < filasCoords.length; i++) {
      let filaC = filasCoords[i];
      let idCrudo = filaC[0]; 
      if (idCrudo) {
        let idLimpio = String(idCrudo).trim();
        diccionarioCoords[idLimpio] = {
          lat: filaC[1], 
          lng: filaC[2], 
          fotosIds: filaC[6] || "" 
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
async function guardarTerrenoEnSheets(datos) {
  const token = obtenerToken();
  
  try {
    const latFix = Number(datos.lat).toFixed(6);
    const lngFix = Number(datos.lng).toFixed(6);
    const enlaceMapsActual = `https://www.google.com/maps?q=${latFix},${lngFix}`;

    const rangoCheck = "'Relevamiento de Terrenos/Propietarios'!A6:AD1000";
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

    // 2. Si no se encontró (Modo Agregar Terreno Nuevo), buscar la primera fila libre
    if (!filaDestino) {
      filaDestino = 6;
      for (let i = 0; i < filasExistentes.length; i++) {
        let idEnFila = filasExistentes[i][0];       // Columna A (ID)
        let visitadoEnFila = filasExistentes[i][2]; // Columna C (Visitado)
        
        // Si no tiene ID y tampoco está marcado como visitado, está libre
        if (!idEnFila && !visitadoEnFila) {
          filaDestino = 6 + i;
          console.log(`➕ [Búsqueda] Fila libre encontrada en fila ${filaDestino} para terreno nuevo.`);
          break;
        }
        filaDestino = 6 + i + 1; // Si está ocupada, empujamos a la siguiente
      }
    }

    // 3. Obtener o Generar el ID para las fotos (Formato POS001)
    let idAsignadoAlTerreno = null;
    const indiceFilaArray = filaDestino - 6;
    
    if (filasExistentes[indiceFilaArray] && filasExistentes[indiceFilaArray][0]) {
      idAsignadoAlTerreno = String(filasExistentes[indiceFilaArray][0]).trim();
    } else {
      idAsignadoAlTerreno = `POS${String(filaDestino - 5).padStart(3, '0')}`;
    }

    // ARMAR VALORES Y ENVIAR A SHEETS (COLUMNAS C a AD)
    const filaHoja1 = [
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

    const rangoFila = `'Relevamiento de Terrenos/Propietarios'!C${filaDestino}:AD${filaDestino}`;
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

    // RETORNAR SIEMPRE EL ID VÁLIDO PARA QUE FOTOS.JS PUEDA NMBRAR LAS FOTOS EN DRIVE
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
window.guardarIdsFotosEnHoja2 = async function(idTerreno, nuevosIdsFotos) {
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