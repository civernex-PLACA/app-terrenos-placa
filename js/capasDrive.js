// ==========================================
// MÓDULO: DESCARGA Y CACHEO DE CAPAS DESDE DRIVE
// ==========================================

window.CAPAS_DRIVE_FOLDER_ID = "142eqY-bl0fHyJcSSHL43BjrIetB4IwAi";

window.CapasDrive = {
  capasCargadas: {}, // Memoria RAM: { 'seccion01': { ... }, 'seccion26': { ... } }

  // 🟢 Secciones que se descargan primero y en simultáneo, porque son las
  // que más se usan al arrancar el mapa. El resto se baja después, en
  // tandas de fondo, para no saturar la conexión de campo.
  SECCIONES_PRIORITARIAS: ['seccion01', 'seccion02', 'seccion03', 'seccion07', 'seccion08'],
  TAMANIO_TANDA_RESTO: 5,

    // 1. Descarga masiva al iniciar sesión
  sincronizarCapas: async function() {
    console.log("📡 [CapasDrive] Sincronizando capas desde Google Drive...");

    try {
      const query = `'${window.CAPAS_DRIVE_FOLDER_ID}' in parents and trashed = false and name contains '.geojson'`;
      // 🟢 supportsAllDrives + includeItemsFromAllDrives: sin esto, Drive
      // excluye por default el contenido que vive en Unidades compartidas
      // (como esta carpeta de capas) — la petición da 200 OK pero con
      // "files: []", como si no hubiera nada, aunque los archivos existan.
      const urlList = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

      const resList = await window.fetchConAuth(urlList);

      if (!resList.ok) throw new Error(`HTTP Error ${resList.status}`);


      const dataList = await resList.json();
      const archivos = dataList.files || [];

      console.log(`📦 [CapasDrive] Se encontraron ${archivos.length} archivos en Drive.`);

      const esPrioritaria = (nombreArchivo) => {
        const clave = nombreArchivo.replace('.geojson', '').toLowerCase().trim();
        return this.SECCIONES_PRIORITARIAS.includes(clave);
      };

      const archivosPrioritarios = archivos.filter(a => esPrioritaria(a.name));
      const archivosRestantes = archivos.filter(a => !esPrioritaria(a.name));

            // 🟢 1. Tanda prioritaria: todas en simultáneo (son pocas, no debería
      // saturar ni siquiera una conexión de campo floja). Solo esta tanda
      // avisa con el toast — las de fondo bajan en silencio.
      const idToastCapas = typeof mostrarToast === 'function' ? mostrarToast("Descargando polígonos de catastro...") : null;

      await Promise.all(
        archivosPrioritarios.map(archivo => this.descargarEInyectarGeoJSON(archivo.id, archivo.name))
      );
      console.log("⚡ [CapasDrive] Secciones prioritarias listas:", Object.keys(this.capasCargadas));

      if (typeof ocultarToast === 'function') ocultarToast(idToastCapas);

      // 🟢 2. El resto, en tandas de a TAMANIO_TANDA_RESTO en simultáneo,
      // una tanda detrás de la otra (no todas juntas, para no arriesgar
      // errores de "demasiadas peticiones" ni saturar la conexión).
      for (let i = 0; i < archivosRestantes.length; i += this.TAMANIO_TANDA_RESTO) {
        const tanda = archivosRestantes.slice(i, i + this.TAMANIO_TANDA_RESTO);
        await Promise.all(
          tanda.map(archivo => this.descargarEInyectarGeoJSON(archivo.id, archivo.name))
        );
      }


      console.log("✅ [CapasDrive] Todas las capas en RAM listas:", Object.keys(this.capasCargadas));

    } catch (error) {
      console.error("❌ [CapasDrive] Error sincronizando capas de Drive:", error);
    }
  },

    // 2. Inyección directa en RAM
  descargarEInyectarGeoJSON: async function(fileId, fileName) {
    const urlMedia = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;

    try {
      const res = await window.fetchConAuth(urlMedia);

      if (!res.ok) return;


      const geoJsonData = await res.json();
      
      // Clave exacta eliminando ".geojson" (ej: "seccion01.geojson" -> "seccion01")
      const nombreClave = fileName.replace('.geojson', '').toLowerCase().trim();

      this.capasCargadas[nombreClave] = geoJsonData;
      console.log(`⚡ [CapasDrive] Cargada en RAM: '${nombreClave}' (${geoJsonData.features?.length || 0} parcelas)`);

      // 🟢 Sin esto, si el overlay gris ya estaba activo (modo agregar/editar
      // abierto) pero esta sección todavía no había bajado, _recalcular()
      // la saltea en silencio y no vuelve a intentar sola — se quedaba sin
      // dibujar hasta que el usuario movía o hacía zoom en el mapa (lo cual
      // sí dispara moveend/zoomend). Avisamos acá para que se actualice
      // apenas la sección está lista, sin esperar un gesto del usuario.
      // OverlayCatastro.actualizar() ya tiene debounce (150ms) y corta solo
      // si el overlay no está activo, así que llamarlo siempre es barato.
      if (window.OverlayCatastro && typeof window.OverlayCatastro.actualizar === 'function') {
        window.OverlayCatastro.actualizar();
      }

    } catch (e) {
      console.error(`❌ [CapasDrive] Error cargando ${fileName}:`, e);
    }
  }
};