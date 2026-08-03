// ==========================================
// MÓDULO: DESCARGA Y CACHEO DE CAPAS DESDE DRIVE
// ==========================================

window.CAPAS_DRIVE_FOLDER_ID = "142eqY-bl0fHyJcSSHL43BjrIetB4IwA";

window.CapasDrive = {
  capasCargadas: {}, // Memoria RAM: { 'seccion01': { ... }, 'seccion26': { ... } }

  // 1. Descarga masiva al iniciar sesión
  sincronizarCapas: async function() {
    const token = window.gapiToken || localStorage.getItem('google_access_token');
    if (!token) {
      console.warn("⚠️ [CapasDrive] Sin token de Google para descargar capas.");
      return;
    }

    console.log("📡 [CapasDrive] Sincronizando capas desde Google Drive...");

    try {
      const query = `'${window.CAPAS_DRIVE_FOLDER_ID}' in parents and trashed = false and name contains '.geojson'`;
      const urlList = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

      const resList = await fetch(urlList, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!resList.ok) throw new Error(`HTTP Error ${resList.status}`);

      const dataList = await resList.json();
      const archivos = dataList.files || [];

      console.log(`📦 [CapasDrive] Se encontraron ${archivos.length} archivos en Drive.`);

      for (const archivo of archivos) {
        await this.descargarEInyectarGeoJSON(archivo.id, archivo.name, token);
      }

      console.log("✅ [CapasDrive] Capas en RAM listas:", Object.keys(this.capasCargadas));

    } catch (error) {
      console.error("❌ [CapasDrive] Error sincronizando capas de Drive:", error);
    }
  },

  // 2. Inyección directa en RAM
  descargarEInyectarGeoJSON: async function(fileId, fileName, token) {
    const urlMedia = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    try {
      const res = await fetch(urlMedia, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return;

      const geoJsonData = await res.json();
      
      // Clave exacta eliminando ".geojson" (ej: "seccion01.geojson" -> "seccion01")
      const nombreClave = fileName.replace('.geojson', '').toLowerCase().trim();

      this.capasCargadas[nombreClave] = geoJsonData;
      console.log(`⚡ [CapasDrive] Cargada en RAM: '${nombreClave}' (${geoJsonData.features?.length || 0} parcelas)`);

    } catch (e) {
      console.error(`❌ [CapasDrive] Error cargando ${fileName}:`, e);
    }
  }
};