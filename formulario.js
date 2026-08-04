// ==========================================
// MÓDULO 4: GESTIÓN DE DATOS DEL FORMULARIO
// ==========================================

window.idEdicionActual = null;

const CAMPOS_FORMULARIO = [
  'f-visitado', 'f-relevo', 'f-distrito', 'f-barrio', 'f-direccion', 'f-tipolote',
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

window.cargarDatosEnFormulario = function (terreno) {
  if (!terreno) return;

  // Mapa de ID del Input -> Valor en la propiedad del Terreno
  const mapaValores = {
    'f-visitado': terreno.visitado || "No",
    'f-relevo': terreno.relevo || "",
    'f-distrito': terreno.distrito || "",
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
      // Buscar coincidencia exacta o insensible a mayúsculas
      for (let i = 0; i < el.options.length; i++) {
        if (el.options[i].value.toLowerCase() === valor.toLowerCase() ||
          el.options[i].text.toLowerCase() === valor.toLowerCase()) {
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
};

window.obtenerDatosFormulario = function () {
  const getVal = (id, def = "") => document.getElementById(id) ? document.getElementById(id).value.trim() : def;

  return {
    id: window.idEdicionActual,
    lat: window.selectedLat,
    lng: window.selectedLng,
    colB: getVal('f-colb', window.datosEdicionActualColB || ""),
    visitado: getVal('f-visitado', 'No'), relevo: getVal('f-relevo'),
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
    console.log("⏳ [DEBUG] Enviando a Google Sheets...");
    const idAsignado = await guardarTerrenoEnSheets(datos);

    // 2️⃣ RAYOS X: ¿Qué respondió Google Sheets?
    console.log("✅ [DEBUG] Respuesta del backend (ID):", idAsignado);

    if (idAsignado) {
      if (typeof window.Fotos_procesarYSubirADrive === 'function' && window.fotosParaSubir?.length > 0) {
        console.log("📸 [DEBUG] Iniciando subida de fotos a Drive...");
        try {
          const idsFotosSubidas = await window.Fotos_procesarYSubirADrive(idAsignado);
          console.log("☁️ [DEBUG] Fotos subidas con éxito. IDs:", idsFotosSubidas);

          if (idsFotosSubidas.length > 0 && typeof window.guardarIdsFotosEnHoja2 === 'function') {
            await window.guardarIdsFotosEnHoja2(idAsignado, idsFotosSubidas);
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
      console.error("❌ [ERROR BACKEND]: guardarTerrenoEnSheets no devolvió un ID válido.");
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