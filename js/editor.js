// ==========================================
// MÓDULO: EDITOR VISUAL (editor.js)
// 100% enfocado en Datos y Estados (UI es delegada a CSS)
// ==========================================

window.Editor = {
  modoActual: null,
  terrenoActual: null,

  // Lógica UNIFICADA: Textos, botones y apertura (cero cálculos de layout)
  _prepararYAbrir: function (tituloTexto, btnTexto, btnClase) {
    const modal = document.getElementById('modal-terreno');
    const titulo = document.getElementById('titulo-form');
    const btnGuardar = document.getElementById('btn-guardar-form');

    if (titulo) titulo.innerText = tituloTexto;
    if (btnGuardar) {
      btnGuardar.innerText = btnTexto;

      // 🟢 JS remueve estados anteriores y asigna el nuevo, sin tocar colores
      btnGuardar.classList.remove('btn-nuevo', 'btn-editar');
      btnGuardar.classList.add(btnClase);

      btnGuardar.onclick = () => {
        if (typeof window.procesarFormulario === 'function') window.procesarFormulario();
      };
    }

    if (modal) {
      modal.style.display = 'flex'; // CSS decide si flex es al costado o abajo
      setTimeout(() => modal.classList.add('active'), 10);
    }
  },

  abrirParaNuevo: function (lat, lng) {
    this.modoActual = 'add';
    window.modoEdicionActivo = false;
    window.idEdicionActual = null;
    window.selectedLat = lat;
    window.selectedLng = lng;

    if (typeof window.limpiarFormulario === 'function') window.limpiarFormulario();

    // 🟢 Pasamos la clase 'btn-nuevo' en lugar del código de color
    this._prepararYAbrir("Nuevo Terreno", "Guardar Terreno", "btn-nuevo");
  },

  abrirParaEdicion: function (terreno) {
    if (!terreno) {
      console.warn("⚠️ [Editor] abrirParaEdicion llamado sin datos de terreno.");
      if (typeof DevTrace !== 'undefined' && DevTrace.error) {
        DevTrace.error("No se pudo abrir el panel: faltan datos del terreno.");
      }
      return;
    }
    this.modoActual = 'edit';
    this.terrenoActual = terreno;
    window.modoEdicionActivo = true;
    window.idEdicionActual = terreno.id;
    window.selectedLat = terreno.lat;
    window.selectedLng = terreno.lng;

    if (typeof window.cargarDatosEnFormulario === 'function') window.cargarDatosEnFormulario(terreno);

    // 🟢 Pasamos la clase 'btn-editar' en lugar del código de color
    this._prepararYAbrir(`Editar ${terreno.id}`, "Guardar Cambios", "btn-editar");
  },

  cerrar: function (esGuardado = false) {
    const modal = document.getElementById('modal-terreno');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => { modal.style.display = 'none'; }, 300);
    }

    window.modoEdicionActivo = false;

    // 🟢 CORRECCIÓN: Solo limpiamos y removemos el pin si el usuario canceló (esGuardado === false)
    if (esGuardado !== true) {
      if (typeof window.removerPinFantasma === 'function') {
        window.removerPinFantasma();
      }
      if (typeof window.limpiarFormulario === 'function') {
        window.limpiarFormulario();
      }
    }
  }
};

window.abrirModalTerreno = () => {
  if (window.modoEdicionActivo) window.Editor.abrirParaEdicion(window.Editor.terrenoActual);
  else window.Editor.abrirParaNuevo(window.selectedLat, window.selectedLng);
};

window.cerrarModalTerreno = (esGuardado) => window.Editor.cerrar(esGuardado);