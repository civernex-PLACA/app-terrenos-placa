// ==========================================
// MÓDULO 5: GESTIÓN INTEGRAL DE FOTOS Y VISOR HD
// ==========================================

window.DRIVE_FOLDER_ID = "1aHzoGtmkosQfPsqje_R6MjlWGBxQFyvr";
window.fotosParaSubir = []; // Buffer de fotos

// ==========================================
// MOTOR DE BASE DE DATOS LOCAL (IndexedDB) PARA FOTOS FALLIDAS
// ==========================================
window.ColaFotos = {
  dbName: 'TerrenosAppDB',
  storeName: 'fotosPendientes',
  
  init: function() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id_unico' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  guardar: async function(fotoData) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(fotoData);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject();
    });
  },
  
  obtenerTodas: async function() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject();
    });
  },
  
  eliminar: async function(id_unico) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id_unico);
      tx.oncomplete = () => resolve();
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const inputFotos = document.getElementById('f-fotos');
  if (inputFotos) {
    inputFotos.addEventListener('change', Fotos_manejarSeleccion);
  }
});

// ----------------------------------------------------------------
// 1. SELECCIÓN Y COMPRESIÓN (Inmediata, sin esperar ID)
// ----------------------------------------------------------------
async function Fotos_manejarSeleccion(event) {
  const archivos = event.target.files;
  if (!archivos || archivos.length === 0) return;

  const contenedorPrevio = document.getElementById('vista-previa-fotos');
  if (contenedorPrevio) contenedorPrevio.innerHTML = ''; 
  window.fotosParaSubir = []; 
  
  const idToast = typeof mostrarToast === 'function' ? mostrarToast("Procesando imágenes...") : null;

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    if (!archivo.type.match('image.*')) continue;

    try {
      const archivoComprimido = await Fotos_comprimirImagen(archivo);
      window.fotosParaSubir.push(archivoComprimido);

      if (contenedorPrevio) {
        const imgItem = document.createElement('div');
        imgItem.className = 'previa-foto-item';
        const img = document.createElement('img');
        img.src = archivoComprimido.base64;
        imgItem.appendChild(img);
        contenedorPrevio.appendChild(imgItem);
      }
    } catch (error) {
      console.error("Error al procesar foto:", error);
    }
  }
  if (typeof ocultarToast === 'function') ocultarToast(idToast);
}

function Fotos_comprimirImagen(archivoFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(archivoFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const MAX_WIDTH = 2048;
        const MAX_HEIGHT = 2048;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve({
          tipoMime: 'image/jpeg',
          base64: dataUrl,
          datosCrudos: dataUrl.split(',')[1]
        });
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

// ----------------------------------------------------------------
// 2. SUBIDA A DRIVE CON NOMENCLATURA (Ocurre en 2do plano)
// ----------------------------------------------------------------
window.Fotos_procesarYSubirADrive = async function(idTerreno) {
  if (window.fotosParaSubir.length === 0) return []; 
  if (!window.gapiToken) throw new Error("Sin sesión de Google");

  const enlacesDrive = [];
  
for (let i = 0; i < window.fotosParaSubir.length; i++) {
    const foto = window.fotosParaSubir[i];
    const letraSufijo = String.fromCharCode(65 + i); 
    const nombreArchivo = `${idTerreno}-${letraSufijo}.jpg`; 

    try {
      const idSubida = await Fotos_enviarREST(foto.datosCrudos, foto.tipoMime, nombreArchivo);
      if (idSubida) enlacesDrive.push(idSubida);
    } catch (e) {
      console.error(`Fallo subida de ${nombreArchivo}, enviando a cola local:`, e);
      
      // 🟢 NUEVO: Guardar en la base de datos local para reintentar luego
      await window.ColaFotos.guardar({
        id_unico: Date.now().toString() + '-' + i, // ID único temporal
        idTerreno: idTerreno,
        datosCrudos: foto.datosCrudos,
        tipoMime: foto.tipoMime,
        nombreArchivo: nombreArchivo
      });
      
      if (typeof mostrarToast === 'function') mostrarToast("Guardado sin red. Las fotos se subirán luego.");
    }
  }

  // Limpiar memoria
  window.fotosParaSubir = []; 
  const contenedorPrevio = document.getElementById('vista-previa-fotos');
  if (contenedorPrevio) contenedorPrevio.innerHTML = '';
  const inputFotos = document.getElementById('f-fotos');
  if (inputFotos) inputFotos.value = "";

  return enlacesDrive;
};

async function Fotos_enviarREST(base64Crudo, mimeType, fileName) {
  const boundary = '-------314159265358979323846';
  const delimitador = "\r\n--" + boundary + "\r\n";
  const cierre = "\r\n--" + boundary + "--";

  const metadata = { name: fileName, mimeType: mimeType, parents: [window.DRIVE_FOLDER_ID] };
  const multipartRequestBody = delimitador + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + delimitador + 'Content-Type: ' + mimeType + '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64Crudo + cierre;

  const respuesta = await window.fetchConAuth('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: multipartRequestBody
  });

  if (!respuesta.ok) throw new Error(await respuesta.text());
  const data = await respuesta.json();
  
  try {
    // 🟢 Antes: type: 'anyone' dejaba la foto visible para cualquiera con el
    // link, sin login. Ahora se restringe a cuentas del dominio de la
    // empresa (necesario porque el <img> del carrusel carga la miniatura
    // sin token, así que el archivo igual tiene que ser accesible por link
    // — pero solo para el equipo, no para cualquiera en internet).
    await window.fetchConAuth(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'domain', domain: 'placaestudio.com' })
    });
  } catch (e) {}

  return data.id; 
}


// ----------------------------------------------------------------
// 3. GENERADOR DEL CARRUSEL PARA EL POPUP DEL MAPA
// ----------------------------------------------------------------
window.Fotos_renderizarCarruselHTML = function(cadenaIds) {
  if (!cadenaIds || String(cadenaIds).trim() === "") return "";
  
  const ids = String(cadenaIds).split(',').map(id => id.trim()).filter(id => id);
  if (ids.length === 0) return "";

  let htmlFotos = `<div class="carrusel-popup">`;
  
  ids.forEach((id, index) => {
    const urlImagen = `https://drive.google.com/thumbnail?id=${id}&sz=w400-h300`;
    htmlFotos += `
      <div class="carrusel-item" onclick="window.Fotos_abrirVisorHD('${cadenaIds}', ${index})">
        <img class="carrusel-img" src="${urlImagen}" alt="Foto Terreno">
      </div>
    `;
  });
  htmlFotos += `</div>`;
  return htmlFotos;
};

// ----------------------------------------------------------------
// 4. VISOR HD (LIGHTBOX) CON CARGA PROGRESIVA, SLIDER Y SWIPE
// ----------------------------------------------------------------
window.Fotos_abrirVisorHD = function(cadenaIds, indexInicial) {
  const ids = cadenaIds.split(',').map(id => id.trim()).filter(Boolean);
  if (ids.length === 0) return;

  let currentIndex = indexInicial;

  // 1. Contenedor principal a pantalla completa
  const overlay = document.createElement('div');
  overlay.id = 'visor-hd-overlay';
  overlay.className = 'visor-hd-overlay';

  const cerrarVisor = () => {
    if (overlay.parentNode) document.body.removeChild(overlay);
  };

  // ✅ CIERRE AL TOCAR EL FONDO NEGRO/GRIS
  overlay.onclick = (e) => {
    if (e.target === overlay || e.target === mainContainer || e.target === imgContainer) {
      cerrarVisor();
    }
  };

  // 2. Botón de Cerrar
  const closeBtn = document.createElement('button');
  closeBtn.className = 'visor-close-btn';
  closeBtn.innerHTML = '✖';
  closeBtn.onclick = cerrarVisor;

  // 3. Encabezado con Contador
  const header = document.createElement('div');
  header.className = 'visor-header';

  // 4. Contenedor Central de la Imagen Principal y Botones
  const mainContainer = document.createElement('div');
  mainContainer.className = 'visor-main-container';

  const imgContainer = document.createElement('div');
  imgContainer.className = 'visor-img-container';

  const imgElement = document.createElement('img');
  imgElement.className = 'visor-img-main';
  imgElement.onclick = (e) => e.stopPropagation();

  imgContainer.appendChild(imgElement);

  // Botones de navegación laterales
  const prevBtn = document.createElement('button');
  prevBtn.className = 'visor-nav-btn visor-prev';
  prevBtn.innerHTML = '◀';
  prevBtn.onclick = (e) => { e.stopPropagation(); if (currentIndex > 0) loadImage(currentIndex - 1); };

  const nextBtn = document.createElement('button');
  nextBtn.className = 'visor-nav-btn visor-next';
  nextBtn.innerHTML = '▶';
  nextBtn.onclick = (e) => { e.stopPropagation(); if (currentIndex < ids.length - 1) loadImage(currentIndex + 1); };

  mainContainer.appendChild(prevBtn);
  mainContainer.appendChild(imgContainer);
  mainContainer.appendChild(nextBtn);

  // 5. SLIDER INFERIOR DE MINIATURAS
  const thumbSlider = document.createElement('div');
  thumbSlider.className = 'visor-thumb-slider';
  thumbSlider.onclick = (e) => e.stopPropagation(); // Evitar cerrar al tocar el slider

  const thumbElements = ids.map((id, index) => {
    const thumbImg = document.createElement('img');
    thumbImg.className = 'visor-thumb-img';
    thumbImg.src = `https://drive.google.com/thumbnail?id=${id}&sz=w200`;
    thumbImg.onclick = (e) => {
      e.stopPropagation();
      loadImage(index);
    };
    thumbSlider.appendChild(thumbImg);
    return thumbImg;
  });

  // --- LÓGICA DE CARGA DE IMAGEN Y SINCRONIZACIÓN DE MINIATURAS ---
  const loadImage = (index) => {
    currentIndex = index;
    const id = ids[index];
    const lowResUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w400-h300`;
    const highResUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w2048-h2048`;

    imgElement.src = lowResUrl;

    const hdImg = new Image();
    hdImg.src = highResUrl;
    hdImg.onload = () => {
      if (currentIndex === index) imgElement.src = highResUrl;
    };

    header.innerText = `${index + 1} / ${ids.length}`;

    // JS sólo añade/quita clases de visibilidad
    prevBtn.classList.toggle('oculto', index === 0);
    nextBtn.classList.toggle('oculto', index === ids.length - 1);

    // JS sólo gestiona la clase activa de la miniatura
    thumbElements.forEach((thumb, i) => {
      if (i === index) {
        thumb.classList.add('activo');
        thumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        thumb.classList.remove('activo');
      }
    });
  };

  // --- LÓGICA DE SWIPE (TÁCTIL) ---
  let touchstartX = 0;
  let touchendX = 0;
  
  mainContainer.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
  mainContainer.addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].screenX;
    if (touchendX < touchstartX - 50 && currentIndex < ids.length - 1) loadImage(currentIndex + 1); 
    if (touchendX > touchstartX + 50 && currentIndex > 0) loadImage(currentIndex - 1); 
  }, {passive: true});

  // Ensamblar visor
  overlay.appendChild(closeBtn);
  overlay.appendChild(header);
  overlay.appendChild(mainContainer);
  if (ids.length > 1) overlay.appendChild(thumbSlider);

  document.body.appendChild(overlay);

  // Cargar primera foto solicitada
  loadImage(currentIndex);
};

// ==========================================
// PROCESADOR DE COLA EN SEGUNDO PLANO
// ==========================================
window.ProcesarColaFotos = async function() {
  if (!window.gapiToken) return;
  
  try {
    const pendientes = await window.ColaFotos.obtenerTodas();
    if (pendientes.length === 0) return; // No hay nada pendiente
    
    console.log(`🔄 [Cola] Intentando subir ${pendientes.length} fotos rezagadas...`);
    
    for (let foto of pendientes) {
      try {
        const idSubida = await Fotos_enviarREST(foto.datosCrudos, foto.tipoMime, foto.nombreArchivo);
        if (idSubida && typeof window.guardarIdsFotosEnHoja2 === 'function') {
          // Si la subió bien a Drive, la enlazamos en Sheets (Hoja 2)
          await window.guardarIdsFotosEnHoja2(foto.idTerreno, [idSubida]);
          
          // Y la borramos de la memoria del celular
          await window.ColaFotos.eliminar(foto.id_unico);
          console.log(`✅ [Cola] Foto rezagada ${foto.nombreArchivo} subida y enlazada.`);
        }
      } catch(e) {
        console.warn(`⏳ [Cola] Sigue fallando la foto ${foto.nombreArchivo}. Se intentará en el próximo ciclo.`);
      }
    }
  } catch (error) {
    console.error("Error al procesar la cola de fotos:", error);
  }
};