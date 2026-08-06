// ==========================================
// MÓDULO 2: CONEXIÓN A GOOGLE SHEETS
// ==========================================
const SHEET_ID = "1gQTOwTrpCsltYv-VSZAApo9c_sF99fz8aY_j1qc4Pc0";
const DRIVE_FOLDER_ID = "1aHzoGtmkosQfPsqje_R6MjlWGBxQFyvr";

// ==========================================
// 🟢 BACKEND ATÓMICO (Apps Script) — EN PRODUCCIÓN (2026-08-06), es lo
// que llama formulario.js#procesarFormulario para guardar/editar
// terrenos (ver CLAUDE.md, "Backend atómico — guardado de terrenos
// migrado a Apps Script")
// ==========================================
// Reemplaza el patrón viejo de guardarTerrenoEnSheets (PUT directo +
// verificación/reintento, más una escritura aparte sin lock a Hoja 2)
// por una sola llamada a Backend_guardarTerreno
// (backend-appscript/8_BackendAtomico.js): ahí el ID se asigna y la fila
// se escribe (Hoja 1 + Hoja 2) bajo un único LockService, sin condición
// de carrera posible.
//
// 🔴 Intento anterior (deployment "Ejecutar como: el usuario que accede" +
// llamar con fetchConAuth, que agrega cabecera Authorization) confirmado
// roto en el navegador real (2026-08-06): esa cabecera dispara un
// preflight CORS (OPTIONS) que Apps Script responde con 405 sin
// cabeceras CORS, sin forma de arreglarlo desde el código del script.
//
// Solución: el deployment corre "Ejecutar como: yo" + acceso "Anyone"
// (sin cabeceras custom → sin preflight, igual que el webapp legacy), y
// el token de Google se manda DENTRO del cuerpo JSON (no como cabecera)
// — Backend_validarTokenYDominio (8_BackendAtomico.js) lo valida del
// lado del servidor contra Google y confirma que la cuenta es del
// dominio permitido antes de tocar la planilla. Por eso esta función usa
// fetch() directo, NO fetchConAuth (que agregaría la cabecera que
// justamente rompe todo esto).
const BACKEND_ATOMICO_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbw58WUjVdy4hQTDmGPSDTbu7b8OU0Sp2JI2cG94ZN7Y-jN1mIsBN8pnj3t0kATpi4vSzA/exec";

window.guardarTerrenoViaBackendAtomico = async function (datos, _esReintento = false) {
  const token = (typeof obtenerToken === 'function' ? obtenerToken() : null) || window.gapiToken;

  const respuesta = await fetch(BACKEND_ATOMICO_WEBAPP_URL, {
    method: 'POST',
    // 🟢 text/plain a propósito (no application/json): mantiene el POST
    // como solicitud "simple" (sin preflight) — doPost igual lo parsea
    // con JSON.parse(e.postData.contents) sin importar qué Content-Type
    // declaremos. Sin cabecera Authorization: el token va en el cuerpo.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'backendGuardarTerreno',
      data: Object.assign({}, datos, { accessToken: token })
    })
  });

  const resultado = await respuesta.json();

  if (resultado.status !== 'success') {
    const mensaje = resultado.message || '';
    // 🟢 El backend antepone "TOKEN_..." al mensaje cuando el rechazo es
    // por token faltante/vencido (no por dominio, ese no se arregla
    // renovando) — mismo espíritu que el reintento-tras-401 de
    // fetchConAuth, adaptado a que acá el error viene en el cuerpo, no
    // en el status HTTP.
    if (!_esReintento && mensaje.startsWith('TOKEN_') && typeof window.renovarToken === 'function') {
      console.warn('⚠️ [Backend Atómico] Token rechazado, renovando y reintentando...');
      const nuevoToken = await window.renovarToken();
      if (nuevoToken) return window.guardarTerrenoViaBackendAtomico(datos, true);
    }
    throw new Error(mensaje || 'El backend atómico devolvió un error sin detalle.');
  }

  return resultado.data; // ID asignado
};

// ==========================================
// CONSULTAR OPCIONES Y REGLAS DE LA PLANILLA
// ==========================================
async function obtenerEsquemaFormularioSheets() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?includeGridData=true&ranges=${encodeURIComponent("'Relevamiento de Terrenos/Propietarios'!A5:AD6")}`;

    const resp = await window.fetchConAuth(url);

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

// 🟢 Extrae lat/lng del Enlace de Maps (columna G de Hoja 1) en vez de
// leerlas de Hoja 2 (ver CLAUDE.md, "Migración de Hoja 2 al archivo de
// backup" → Lat/Lng). Mismo formato que ya deja 4_ConversorLinks.js al
// normalizar cualquier link pegado (maps.google.com/maps?q=<lat>,<lng>)
// y mismo regex que ya usa el backend para leerlo de vuelta
// (extraerCoordsPorRegex en 9_IdRobusto.js) — no es una variante nueva.
function extraerLatLngDeEnlace(enlace) {
  if (!enlace) return null;
  const match = String(enlace).match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
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

  try {
    const RANGO_DATOS = "'Relevamiento de Terrenos/Propietarios'!A5:AD";
    const RANGO_COORDENADAS = "'Coordenadas IDGIS'!A1:J";

    const [respuestaDatos, respuestaCoords] = await Promise.all([
      window.fetchConAuth(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGO_DATOS)}`),
      window.fetchConAuth(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGO_COORDENADAS)}`)
    ]);

    if (!respuestaDatos.ok || !respuestaCoords.ok) {
      // 🟢 Si es 401, fetchConAuth (auth.js) ya intentó renovar el token
      // solo y, si eso falló, ya volvió a la pantalla de login con su
      // propio aviso (_volverAPantallaLogin) — no duplicamos alert/logout
      // acá.
      throw new Error("No se pudieron descargar los datos de la planilla.");
    }


    const jsonDatos = await respuestaDatos.json();
    const jsonCoords = await respuestaCoords.json();

    const filasDatos = jsonDatos.values || [];
    const filasCoords = jsonCoords.values || [];

    // 1. Memorizar fotos/GeoJSON desde Hoja 2 — lat/lng YA NO sale de acá
    // (ver extraerLatLngDeEnlace arriba), pero fotosIds/geoJsonStr todavía
    // no se migraron al lado de lectura del frontend, así que la
    // consulta a Hoja 2 se mantiene por ahora.
    let diccionarioCoords = {};

    for (let i = 1; i < filasCoords.length; i++) {
      let filaC = filasCoords[i];
      let idCrudo = filaC[0];
      if (idCrudo) {
        let idLimpio = String(idCrudo).trim();
        diccionarioCoords[idLimpio] = {
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
      // fotosIds/geoJsonStr siguen viniendo de Hoja 2 — si un terreno no
      // tiene fila ahí todavía (recién creado, sincronización en curso),
      // igual se puede dibujar el pin con las coordenadas del Enlace,
      // solo que sin polígono/fotos hasta que aparezca.
      const coordsTerreno = diccionarioCoords[idLimpio] || { fotosIds: "", geoJsonStr: "" };

      const enlaceEnFila = fila[6]; // Columna G (Enlace)
      const coords = extraerLatLngDeEnlace(enlaceEnFila);
      if (!coords) continue; // sin coordenadas válidas en el Enlace (ej. caso legacy DMS de POS001)

      idsVistosAhora.add(idLimpio);

      let lat = coords.lat;
      let lng = coords.lng;

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
// GUARDAR IDs DE FOTOS (backend atómico — Backend_agregarFotos)
// ==========================================
// 🟢 Reemplaza el guardarIdsFotosEnHoja2 viejo (2026-08-06): ese hacía
// el ciclo leer→modificar→escribir directo desde el navegador contra
// Sheets, sin ningún lock — si dos relevadores subían fotos al mismo
// terreno casi al mismo tiempo, el segundo PUT pisaba al primero y se
// perdían fotos en silencio (ver CLAUDE.md, "Concurrencia al subir
// fotos"). Ahora el navegador solo manda "estas son las fotos nuevas"
// y el backend (Backend_agregarFotos, 8_BackendAtomico.js) hace el
// merge bajo un LockService — mismo patrón/mismo motivo que
// guardarTerrenoViaBackendAtomico un poco más arriba en este archivo
// (texto plano sin cabecera Authorization, token en el cuerpo).
window.guardarIdsFotosViaBackendAtomico = async function (idTerreno, nuevosIdsFotos, _esReintento = false) {
  if (!nuevosIdsFotos || nuevosIdsFotos.length === 0) return;

  const token = (typeof obtenerToken === 'function' ? obtenerToken() : null) || window.gapiToken;

  try {
    const respuesta = await fetch(BACKEND_ATOMICO_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'backendAgregarFotos',
        data: { idTerreno, idsFotos: nuevosIdsFotos, accessToken: token }
      })
    });

    const resultado = await respuesta.json();

    if (resultado.status !== 'success') {
      const mensaje = resultado.message || '';
      if (!_esReintento && mensaje.startsWith('TOKEN_') && typeof window.renovarToken === 'function') {
        console.warn('⚠️ [Backend Atómico] Token rechazado guardando fotos, renovando y reintentando...');
        const nuevoToken = await window.renovarToken();
        if (nuevoToken) return window.guardarIdsFotosViaBackendAtomico(idTerreno, nuevosIdsFotos, true);
      }
      throw new Error(mensaje || 'El backend atómico devolvió un error sin detalle.');
    }

    console.log("✅ IDs de fotos guardados vía backend atómico:", resultado.data);
  } catch (e) {
    console.error("Error al guardar IDs de fotos vía backend atómico:", e);
  }
};

