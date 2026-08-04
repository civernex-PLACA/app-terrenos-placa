// ==========================================
// DESCARGADOR AUTOMÁTICO Y TOLERANTE A FORMATOS DE SECCIÓN
// ==========================================

// 🟢 Asegúrate de poner el ID correcto de tu carpeta de Drive
const ID_CARPETA_DESTINO = "142eqY-bl0fHyJcSSHL43BjrIetB4IwAi";

function descargarTodasLasSeccionesAMiDrive() {
  const carpeta = DriveApp.getFolderById(ID_CARPETA_DESTINO);
  
  Logger.log("🚀 Iniciando escaneo y descarga de capas municipales...");

  // Probaremos secciones de la 1 a la 35
  for (let i = 1; i <= 35; i++) {
    const numPadded = i.toString().padStart(3, '0'); // ej: "002"
    const numTwoDigits = i.toString().padStart(2, '0'); // ej: "02"
    const numSimple = i.toString(); // ej: "2"

    // Posibles variantes de nombre en el servidor municipal
    const variantesNombre = [
      `seccion${numTwoDigits}.geojson`,  // seccion02.geojson (El más común)
      `seccion${numSimple}.geojson`,     // seccion2.geojson
      `seccion${numPadded}.geojson`      // seccion002.geojson
    ];

    let descargadoExitosamente = false;

    for (const nombreArchivo of variantesNombre) {
      if (descargadoExitosamente) break;

      const urlMunicipal = `https://ordenamiento.posadas.gov.ar/mapamuni/${nombreArchivo}`;

      try {
        const respuesta = UrlFetchApp.fetch(urlMunicipal, { muteHttpExceptions: true });

        if (respuesta.getResponseCode() === 200) {
          const contenidoTexto = respuesta.getContentText();

          if (contenidoTexto.includes("FeatureCollection")) {
            // Eliminar versión antigua si ya existe en Drive
            const archivosExistentes = carpeta.getFilesByName(nombreArchivo);
            while (archivosExistentes.hasNext()) {
              archivosExistentes.next().setTrashed(true);
            }

            // Guardar en Drive
            carpeta.createFile(nombreArchivo, contenidoTexto, MimeType.PLAIN_TEXT);
            Logger.log(`✅ [EXITO] Guardado: ${nombreArchivo}`);
            descargadoExitosamente = true;
          }
        }
      } catch (e) {
        // Continuar probando con la siguiente variante si falla
      }
    }

    if (!descargadoExitosamente) {
      Logger.log(`ℹ️ La sección ${i} no existe o no tiene mapa en el servidor.`);
    }
  }

  Logger.log("🎉 ¡Proceso finalizado! Revisa tu carpeta de Google Drive.");
}