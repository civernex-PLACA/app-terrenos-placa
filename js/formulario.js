// ==========================================
// MÓDULO 4: GESTIÓN DE DATOS DEL FORMULARIO
// ==========================================

window.idEdicionActual = null;

const CAMPOS_FORMULARIO = [
  'f-visitado', 'f-relevo', 'f-distrito', 'f-idgis', 'f-barrio', 'f-direccion', 'f-tipolote',
  'f-estado', 'f-frente', 'f-fondo', 'f-agua', 'f-cloaca', 'f-propietario',
  'f-contacto', 'f-vendedor', 'f-notas'
];

window.limpiarFormulario = function () {
  CAMPOS_FORMULARIO.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'f-contacto') el.value = "3764";
    else if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = "";
  });

  // 🟢 Superficie: solo informativa, no se manda al backend (no está en
  // CAMPOS_FORMULARIO) — se limpia aparte.
  const fSuperficiePreview = document.getElementById('f-superficie-preview');
  if (fSuperficiePreview) fSuperficiePreview.value = "";

  // 🟢 Limpieza manual del buffer de fotos y vista previa
  window.fotosParaSubir = [];
  const contenedorPrevio = document.getElementById('vista-previa-fotos');
  if (contenedorPrevio) contenedorPrevio.innerHTML = '';
  const inputFotos = document.getElementById('f-fotos');
  if (inputFotos) inputFotos.value = "";

  window.idEdicionActual = null;
};

// ==========================================
// POBLADO Y LIMPIEZA DE CAMPOS DEL FORMULARIO
// ==========================================

// 🟢 Quita los acentos (tildes) de un texto para comparar sin que
// "Sí" vs "SI" o "Distrito" vs "Dístrito" cuenten como distintos.
// Construido por código de carácter (0x0300-0x036F, marcas diacríticas
// combinantes que deja normalize('NFD')) en vez de escribir el rango
// unicode literal en el código fuente, para que no dependa de cómo el
// editor/la fuente representen esos caracteres invisibles.
const RANGO_DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036F) + ']', 'g');
function normalizarParaComparar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(RANGO_DIACRITICOS, '');
}

window.cargarDatosEnFormulario = function (terreno) {
  if (!terreno) return;

  // Mapa de ID del Input -> Valor en la propiedad del Terreno
  const mapaValores = {
    'f-visitado': terreno.visitado || "NO",
    'f-relevo': terreno.relevo || "",
    'f-distrito': terreno.distrito || "",
    'f-idgis': terreno.colB || "",
    'f-barrio': terreno.barrio || "",
    'f-direccion': terreno.direccion || "",
    'f-tipolote': terreno.tipolote || "Entre Medianeras",
    'f-estado': terreno.estado || "Baldío",
    'f-frente': terreno.frente || "",
    'f-fondo': terreno.fondo || "",
    'f-agua': terreno.agua || "",
    'f-cloaca': terreno.cloaca || "",
    'f-propietario': terreno.propietario || "",
    'f-contacto': terreno.contacto || "3764",
    'f-vendedor': terreno.vendedor || "",
    'f-notas': terreno.notas || ""
  };

  Object.keys(mapaValores).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const valor = String(mapaValores[id]).trim();

    // Asignación inteligente según el tipo de Tag HTML
    if (el.tagName === 'SELECT') {
      let opcionEncontrada = false;
      // 🟢 Comparación insensible a mayúsculas Y a tildes: terrenos
      // guardados antes de que las opciones se ajustaran a los valores
      // exactos que exige la validación de la planilla (ej. "Sí" viejo
      // vs "SI" nuevo en Agua/Cloaca) tienen que seguir encontrando su
      // opción al editar, no quedar en blanco por el cambio.
      const valorNormalizado = normalizarParaComparar(valor);
      for (let i = 0; i < el.options.length; i++) {
        if (normalizarParaComparar(el.options[i].value) === valorNormalizado ||
          normalizarParaComparar(el.options[i].text) === valorNormalizado) {
          el.selectedIndex = i;
          opcionEncontrada = true;
          break;
        }
      }
      if (!opcionEncontrada) el.selectedIndex = 0; // Fallback si no coincide ninguna opción
    } else {
      el.value = valor;
    }
  });

  // 🟢 Superficie: al editar un terreno existente, ya tiene el valor
  // real calculado por el backend guardado en Hoja 1 columna L
  // (terreno.sup) — no hace falta recalcular nada acá, es más preciso
  // que la aproximación local. Al agregar un terreno nuevo, la completa
  // mapa.js apenas se detecta el polígono al hacer clic (todavía no
  // existe un valor guardado para ese caso).
  const fSuperficiePreview = document.getElementById('f-superficie-preview');
  if (fSuperficiePreview) {
    const sup = String(terreno.sup || "").trim();
    fSuperficiePreview.value = sup ? `${sup} m²` : "";
  }
};

window.obtenerDatosFormulario = function () {
  const getVal = (id, def = "") => document.getElementById(id) ? document.getElementById(id).value.trim() : def;

  return {
    id: window.idEdicionActual,
    lat: window.selectedLat,
    lng: window.selectedLng,
    colB: getVal('f-idgis'),
    visitado: getVal('f-visitado', 'NO'), relevo: getVal('f-relevo'),
    distrito: getVal('f-distrito'), barrio: getVal('f-barrio'),
    direccion: getVal('f-direccion'), tipolote: getVal('f-tipolote', 'Entre Medianeras'),
    estado: getVal('f-estado', 'Baldío'), frente: getVal('f-frente'),
    fondo: getVal('f-fondo'), agua: getVal('f-agua'), cloaca: getVal('f-cloaca'),
    propietario: getVal('f-propietario'), contacto: getVal('f-contacto'),
    vendedor: getVal('f-vendedor'), notas: getVal('f-notas')
  };
};

window.procesarFormulario = async function () {
  const datos = window.obtenerDatosFormulario();

  // 1️⃣ RAYOS X: ¿Qué capturó exactamente el formulario?
  console.log("📝 [DEBUG] Datos listos para enviar:", datos);

  if (!datos.lat || !datos.lng) return alert("Faltan coordenadas.");
  if (!datos.direccion) return alert("Falta la dirección. Espera a que el buscador termine o escríbela a mano.");

  if (typeof window.actualizarPinFantasmaDesdeFormulario === 'function') {
    window.actualizarPinFantasmaDesdeFormulario();
  }

  if (window.Editor) window.Editor.cerrar(true);
  const idToastGuardando = typeof window.mostrarToast === 'function' ? window.mostrarToast("Guardando datos...") : null;

  try {
    // 🟢 Backend atómico (Apps Script) en vez del PUT directo a Sheets
    // desde el navegador: asigna el ID (mismo contador que ID Robusto,
    // ya no adivinado por posición de fila) y escribe Hoja 1 + Hoja 2
    // bajo un único lock del lado servidor — reemplaza
    // guardarTerrenoEnSheets/guardarTerrenoNuevoConReintento/
    // guardarGisEnHoja2 (ver CLAUDE.md, "Backend Apps Script", y
    // js/api.js#guardarTerrenoViaBackendAtomico para el detalle de por
    // qué la autenticación va en el cuerpo del POST, no en una cabecera).
    if (window.datosGisTemporales) {
      datos.datosGis = window.datosGisTemporales;
    }

    console.log("⏳ [DEBUG] Enviando al backend atómico...");
    const idAsignado = await guardarTerrenoViaBackendAtomico(datos);
    window.datosGisTemporales = null;

    // 2️⃣ RAYOS X: ¿Qué respondió el backend?
    console.log("✅ [DEBUG] Respuesta del backend (ID):", idAsignado);

    if (idAsignado) {
      if (typeof window.Fotos_procesarYSubirADrive === 'function' && window.fotosParaSubir?.length > 0) {
        console.log("📸 [DEBUG] Iniciando subida de fotos a Drive...");
        try {
          const idsFotosSubidas = await window.Fotos_procesarYSubirADrive(idAsignado);
          console.log("☁️ [DEBUG] Fotos subidas con éxito. IDs:", idsFotosSubidas);

          if (idsFotosSubidas.length > 0 && typeof window.guardarIdsFotosViaBackendAtomico === 'function') {
            await window.guardarIdsFotosViaBackendAtomico(idAsignado, idsFotosSubidas);
            console.log("🔗 [DEBUG] IDs de fotos vinculados en Sheets.");
          }
        } catch (fotoError) {
          console.error("❌ [ERROR CRÍTICO FOTOS]:", fotoError.message);
          alert("Los datos se guardaron, pero hubo un error subiendo las fotos: " + fotoError.message);
        }
      } else {
        console.warn("⚠️ [DEBUG] No se subieron fotos. Motivo: fotosParaSubir está vacío o falta la función.");
      }
    } else {
      console.error("❌ [ERROR BACKEND]: guardarTerrenoViaBackendAtomico no devolvió un ID válido.");
    }

    if (typeof window.ocultarToast === 'function') window.ocultarToast(idToastGuardando);
    if (typeof window.mostrarToast === 'function') window.mostrarToast("¡Guardado! ✅");
    window.limpiarFormulario();
    if (typeof window.removerPinFantasma === 'function') window.removerPinFantasma();
    if (typeof descargarYCruzarDatos === 'function') setTimeout(() => descargarYCruzarDatos(), 1000);

  } catch (error) {
    console.error("❌ [ERROR GUARDADO GENERAL]:", error);
    if (typeof window.ocultarToast === 'function') window.ocultarToast(idToastGuardando);
    alert("Hubo un error al guardar. Revisa la consola.");
    if (window.Editor) {
      if (datos.id) window.Editor.abrirParaEdicion(datos);
      else {
        window.Editor.abrirParaNuevo(datos.lat, datos.lng);
        window.cargarDatosEnFormulario(datos);
      }
    }
  }
};