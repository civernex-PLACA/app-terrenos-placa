# Terrenos App — Contexto del proyecto

PWA de relevamiento de terrenos para el equipo "Placa Estudio" en Posadas,
Misiones. La escribió el dueño del proyecto (no es ingeniero de software)
con ayuda de Gemini, y actualmente se está revisando y optimizando con
Claude.

## Stack (sin backend propio)

- **Frontend**: HTML/JS/CSS vanilla, sin framework ni bundler.
- **Mapa**: Leaflet (capa OSM + capa satelital de Google).
- **"Base de datos"**: Google Sheets, vía Sheets API v4 con OAuth del
  usuario (no hay servidor propio).
- **Archivos**: Google Drive (fotos comprimidas, capas GeoJSON de catastro).
- **Presencia multiusuario en tiempo real**: Supabase Realtime.
- **Geocodificación inversa**: Nominatim (OpenStreetMap).
- **PWA**: Service Worker (`sw.js`) para uso offline en el campo.

## Estructura de módulos (`js/*.js`)

| Archivo | Responsabilidad |
|---|---|
| `auth.js` | Login Google OAuth, token y renovación |
| `api.js` | Leer/escribir Google Sheets (terrenos, fotos, GIS) |
| `mapa.js` | Leaflet: pines, clics, regla, GPS |
| `capasDrive.js` | Descarga capas `.geojson` de Drive a RAM (tanda prioritaria + tandas de fondo) |
| `GeoJson.js` | Point-in-polygon casero: detecta sección/parcela catastral por clic. También tiene las funciones de conversión Mercator↔lat/lng y bbox (usadas por `overlayCatastro.js`) |
| `overlayCatastro.js` | Overlay gris de parcelas cercanas (guía visual al agregar/editar), virtualizado por viewport+zoom |
| `poligonos.js` | Dibuja polígonos (fantasma, permanentes, secciones) |
| `editor.js` | Abre/cierra el modal de ficha de terreno |
| `formulario.js` | Lee/llena campos del formulario, dispara guardado |
| `fotos.js` | Comprime fotos a 2K, sube a Drive, cola IndexedDB offline |
| `geocoding.js` | Nominatim: coordenadas → dirección |
| `iconos.js` | SVGs de íconos y pines dinámicos |
| `tags.js` | Chips visuales del popup (favorable/descartado/visitado) |
| `presencia.js` | Presencia multiusuario vía Supabase |
| `dev.js` | Panel de diagnóstico oculto (Shift+D), desactivado en prod |
| `app.js` | Orquestador: arranque + polling cada 30s |
| `sw.js` | Service Worker offline |

## Estructura real de la planilla (confirmada leyendo el Sheet en vivo)

**Hoja "Relevamiento de Terrenos/Propietarios"** — headers en fila 5, datos
desde fila 6:

`A=ID Terreno | B=ID GIS | C=Visitado | D=Distrito | E=Barrio/Zona |
F=Dirección | G=Enlace(maps) | H=Tipo de Lote | I=Estado | J=Frente |
K=Fondo | L=Sup.Total | M=Agua | N=Cloaca | O=Relevó | P=Excepción FOS PB |
Q=FOS Máx. | R=Tipo emplazamiento | S=Pisos | T=m² Construibles |
U=Calificación | V=(vacía) | W=Propietario | X=Contacto |
Y=Edo.Negociación | Z=Vendedor | AA=Disp.Permuta | AB=Precio Venta |
AC=Incidencia USD/m² | AD=Notas`

**Hoja "Coordenadas IDGIS"**:
`A=ID Terreno | B=Latitud | C=Longitud | D=Calificación | E=Visitado |
F=(sin nombre, usada para ID GIS) | G=ID Fotos | H=GeoJSON`

## Decisiones de diseño ya tomadas (no revertir sin razón)

- **Guardar terreno nuevo**: se descartó `values:append` de la API de
  Sheets — con esta planilla (columnas vacías/autocalculadas intercaladas)
  desalinea las columnas. Se usa `PUT` explícito a `B{fila}:AD{fila}`
  (columnas exactas) + verificación post-escritura (relee columna G) y
  reintento automático (hasta 3 veces) si detecta colisión con otro
  usuario guardando al mismo tiempo. Función: `guardarTerrenoNuevoConReintento`
  en `api.js`.
- **Editar terreno existente**: se busca por coincidencia exacta de
  coordenadas en columna G (regex `q=lat,lng`), luego `PUT` directo a esa
  fila. Sin condición de carrera relevante (mismo terreno = misma fila).
- **Offline (`sw.js`)**: cache-match usa `ignoreSearch: true` para que no
  importe el `?v=4` de los scripts. Cachea en tiempo real archivos propios
  y capas `.geojson` de `capas/`. `CACHE_NAME` hay que subirlo de versión
  cada vez que se toca `sw.js`, si no los usuarios no reciben los cambios.
  Actualmente en `v3`.
- **Renderer de Leaflet — Canvas, no SVG, para capas con muchos polígonos**:
  `poligonos.js` (polígonos permanentes de terrenos) y `overlayCatastro.js`
  usan `L.canvas()` compartido en vez del SVG por default de Leaflet. Con
  SVG, cada polígono es un `<path>` en el DOM — con cientos de terrenos
  esto pesa. Con Canvas, se dibujan todos sobre una sola superficie. Si se
  agrega otra capa con muchos polígonos, seguir el mismo patrón (buscar
  `L.canvas({ padding: 0.5 })` en esos dos archivos como ejemplo). Los
  polígonos permanentes además tienen `interactive: false` (nada escucha
  clics sobre ellos).
- **Pila de notificaciones (`mostrarToast`/`ocultarToast` en `mapa.js`)**:
  pueden convivir varias a la vez sin pisarse (se apilan). Regla obligatoria
  para código nuevo: `mostrarToast(msg)` devuelve un id — **siempre**
  capturarlo y pasarlo a `ocultarToast(id)`. Si no se captura, por
  compatibilidad cierra "la más antigua todavía visible", que puede ser la
  de otra función que sigue trabajando. No confundir con
  `mostrarInstruccion`/`ocultarInstruccion` (el cartel de "Toca una
  ubicación...", sistema aparte, un solo cartel, sin pila).
- **Overlay de parcelas catastrales (`overlayCatastro.js`)**: guía visual
  gris que ayuda a tocar la parcela correcta al agregar/editar un terreno.
  Solo se dibuja con zoom ≥17 y solo lo que entra en el viewport (se
  recalcula al mover/hacer zoom). Tiene dos interruptores independientes
  que se combinan con OR: `manual` (botón `btn-overlay-parcelas` del dock)
  y `automatico` (se prende solo al entrar en modo agregar o abrir el
  panel de edición). Si el usuario lo prendió a mano, no se apaga solo al
  cerrar el panel.

## Checklist de la revisión general (progreso)

1. ✅ Service Worker no cacheaba bien los JS versionados → offline roto
2. ✅ Condición de carrera al guardar terrenos → PUT + verificación/reintento
3. ✅ Fotos subidas a Drive quedan públicas para cualquiera con el link →
   permiso cambiado a `type: 'domain', domain: 'placaestudio.com'` en
   `fotos.js` (antes `type: 'anyone'`)
4. ✅ Riesgo de XSS en popups del mapa → agregada `escaparHTML()` en
   `tags.js` (usada en `mapa.js` y `tags.js`) para todo texto de la
   planilla que se muestra en el popup. El botón "Editar Terreno" ya no
   arma el ID dentro de un `onclick="...('${id}')"` inline, se conecta con
   JS real al abrir el popup.
5. ✅ Scopes de OAuth muy amplios → cambiado de `drive` completo a
   `drive.readonly` (lee capas catastrales existentes en Drive) +
   `drive.file` (crea/escribe solo lo que la app genera, como las fotos)
   en `auth.js`. Se descartó `drive.file` puro porque `capasDrive.js`
   necesita leer archivos de catastro que la app no creó.
6. ✅ Límite fijo de 1000 filas en Sheets al buscar fila libre
7. ✅ Descarga de capas GeoJSON desde Drive es secuencial (lenta en campo)
   → tanda prioritaria (secciones 01, 02, 03, 07, 08) en simultáneo al
   arrancar, el resto en tandas de a 5 en segundo plano (`capasDrive.js`).
   Solo la tanda prioritaria avisa con un toast.
   **Bug encontrado de paso al probar este cambio**: `CAPAS_DRIVE_FOLDER_ID`
   en `capasDrive.js` tenía un typo (le faltaba una "i" al final), así que
   apuntaba a una carpeta inexistente — Drive devolvía 200 OK con
   `files: []` (vacío), sin ningún error visible. Corregido por el
   usuario directamente en el archivo. De paso quedaron agregados
   `supportsAllDrives=true` e `includeItemsFromAllDrives=true` en las
   llamadas a Drive de este archivo — no eran la causa del bug, pero es
   buena práctica tenerlos por si esta u otra carpeta termina viviendo en
   una Unidad compartida.
8. ✅ Polling cada 30s redescarga y redibuja TODO el mapa (parpadeo) →
   sincronizado incremental en `api.js`: se compara una "huella" por
   terreno (no solo el ID, que se recicla por fila) y solo se toca el
   pin/polígono que realmente cambió. Referencias por ID guardadas en
   `window.markersPorId` (`mapa.js`) y `capaPermanentesPorId`
   (`poligonos.js`). De paso se corrigió un bug menor: el color de los
   polígonos nunca se aplicaba (se pasaba un string donde se esperaba
   `{color: ...}`).
9. ⬜ **Bug de datos**: varios polígonos GeoJSON en "Coordenadas IDGIS"
   tienen coordenadas erróneas en Kazajistán (lat≈52, lng≈65) en vez de
   Posadas (lat≈-27, lng≈-55). Afecta al menos POS009, POS102, POS117,
   POS118, y varias filas huérfanas sin ID Terreno al final de la hoja.
   **Actualización 2026-08-03**: la sospecha original (bug en
   `mercatorToLatLng`/`convertirMultiPoligonoGPS`) se **descartó** — se
   confirmó que `secciones.geojson` declara `EPSG:3857` en su `crs`, que
   es exactamente lo que esas funciones asumen, y se verificó a mano
   contra un KML de referencia (Catastro de Misiones) que la conversión
   da resultados correctos. Además, comparando el polígono GUARDADO de
   varios terrenos (POS042, POS069, POS099) contra el que se calcula HOY
   con la misma fórmula para las mismas coordenadas, el desvío no es
   sistemático (varía en dirección y magnitud entre terrenos, y en
   POS099 hasta cambia la cantidad de vértices del polígono) — eso
   descarta un bug de fórmula. La explicación real: el polígono de cada
   terreno se calcula una sola vez al crearlo y nunca se actualiza,
   aunque la capa catastral fuente en Drive se corrija con el tiempo.
   El plan es resolverlo con un recalculo masivo (ver "Módulo de
   limpieza" más abajo), no con un fix de código — pero el bug de las
   filas específicas en Kazajistán (POS009, POS102, POS117, POS118) es
   un caso más extremo que probablemente merece revisión manual aparte
   (podría ser una fila con datos realmente corruptos, no solo
   desactualizados).

## Módulo de limpieza (planeado, alcance ya definido — actualizado 2026-08-04)

Tomás pidió dejarlo anotado para encararlo más adelante, no implementar
todavía sin confirmar antes cuál es prioridad. **Requisito clave: tiene
que poder correr solo, sin depender de que alguien tenga la app abierta**
— por eso este módulo es un candidato natural para vivir en el backend
de Apps Script (ver sección siguiente), usando triggers por tiempo, y no
en el frontend actual.

1. **Recalcular y regrabar el polígono guardado de los terrenos
   existentes** contra la fuente actual de Drive (ver ítem #9 del
   checklist). Reusar `window.CatastroGIS.obtenerDatosPorCoordenada(lat, lng)`
   con el lat/lng ya guardado de cada terreno, regrabar con
   `guardarGisEnHoja2`.
2. **Calcular el área de cada polígono** y guardarla en la planilla —
   módulo/función nueva, no existe cálculo de área en el código todavía.
3. **Autocompletar Columna B (ID GIS) de Hoja 1** al crear un terreno —
   el dato ya está disponible en `properties.IDGIS` de las capas GeoJSON,
   solo falta escribirlo (ver nota de "funcionalidad fantasma" abajo).
4. **Autocompletar el campo Distrito** de la misma forma, usando
   `properties.DISTRITO` (ya se lee en `obtenerDatosPorCoordenada`, pero
   verificar si se está persistiendo siempre).
5. **Limpieza automática de la Hoja 2 al borrar un terreno de la Hoja 1**:
   hoy, cuando se borra una fila en "Relevamiento de Terrenos/Propietarios",
   la fila correspondiente en "Coordenadas IDGIS" (lat, lng, GeoJSON, IDs
   de fotos) queda huérfana — nada la borra. El módulo debe: detectar
   terrenos borrados de Hoja 1 (comparando IDs entre ambas hojas), borrar
   su fila en Hoja 2, y borrar las fotos asociadas en la carpeta de Drive
   (`DRIVE_FOLDER_ID` en `fotos.js`) usando los IDs guardados en la
   columna "ID Fotos" antes de perder la referencia.
6. **Detectar y corregir enlaces de Google Maps rotos/no estándar** en la
   columna "Enlace" de Hoja 1: enlaces acortados (`maps.app.goo.gl/...`)
   o con formato no reconocido por el regex `q=lat,lng` que usa
   `guardarTerrenoEnSheets` para la búsqueda por coincidencia exacta (ver
   nota de POS001 abajo, que ya es un caso conocido de esto). Requiere
   resolver el enlace acortado (siguiendo la redirección) para extraer
   las coordenadas reales y regrabarlo en formato estándar
   (`https://maps.google.com/maps?q=lat,lng`).
7. **Validador de formato de las coordenadas GeoJSON** en la columna H de
   Hoja 2: chequear que cada `geoJson` guardado sea JSON válido, tenga
   `type`/`coordinates` coherentes, y que los valores de lat/lng estén en
   rango físicamente válido para Posadas (una validación de rango barata
   detectaría automáticamente casos como el bug de Kazajistán del ítem
   #9 del checklist, sin depender de encontrarlos a mano).
8. **Sistema de comunicación eficiente frontend↔backend**: a definir en
   detalle cuando se diseñe el backend de Apps Script — cubre cómo el
   frontend le va a pedir trabajo a este módulo (¿on-demand desde un
   botón, además del trigger automático?) y cómo se van a devolver
   resultados/errores de forma que el frontend pueda mostrarlos (toast,
   panel de estado, etc.) sin bloquear la experiencia del usuario en el
   mapa.

**Pendiente**: sigue abierto a sugerencias, cambios, y nuevos módulos a
sumar acá o a mover al backend de Apps Script — no cerrado todavía.

## Fuente de datos catastrales: evaluar migrar de GeoJSON a KML (anotado, no implementado — 2026-08-04)

Hoy las capas de parcelas (`capasDrive.js`, `GeoJson.js`) vienen de la
base de **ordenamiento territorial**, en formato GeoJSON (`EPSG:3857`,
convertido a lat/lng con `mercatorToLatLng`). Tomás quiere evaluar
migrar a la base del **catastro**, que trabaja con **KML** en vez de
GeoJSON, para corregir defectos de precisión en la proyección de las
parcelas (posible causa de fondo de desvíos como los vistos en el punto
#9 del checklist — polígonos guardados que no coinciden con la capa
fuente actual).

Pendiente antes de encarar esto:
- Confirmar si el catastro expone el KML por archivo descargable (como
  hoy con los `.geojson` en Drive) o por algún otro medio (WFS, API,
  etc.).
- Definir si se parsea KML en el frontend (reemplazando el parser de
  GeoJSON actual) o se convierte KML→GeoJSON una vez en el backend de
  Apps Script y se sigue sirviendo GeoJSON al frontend (probablemente
  más simple: no tocar `GeoJson.js`/`poligonos.js`, que ya consumen
  GeoJSON en toda la app).
- Evaluar si el sistema de coordenadas del KML del catastro es el mismo
  (`EPSG:3857`) o si trae otro (KML suele usar WGS84 lat/lng directo,
  sin necesidad de conversión Mercator — a confirmar contra los datos
  reales antes de asumir nada).
- Una vez migrada la fuente, el "módulo de limpieza" (recalculo masivo de
  polígonos, ítem 1) debería correr una sola vez más al final, ya contra
  la fuente definitiva, para no recalcular dos veces.



## Backend futuro: mini-backend en Apps Script (anotado, no implementado — 2026-08-04)

Idea surgida al charlar sobre migrar de GitHub Pages / evaluar volver
parcialmente a Apps Script (la app nació ahí y se migró a app nativa
para poder agregar funciones y hostearla en otro lado — **no se plantea
volver del todo**, sino sumar un backend acotado sin perder esa
flexibilidad de hosting).

**Qué NO cambia**: el frontend sigue siendo estático (HTML/JS/CSS),
hosteado donde ya está (GitHub Pages), hablando directo con Sheets/Drive
para todo lo que ya funciona bien.

**Qué SÍ movería a un Web App de Apps Script** (candidatos, a confirmar
prioridad antes de implementar):

- **Guardar terreno nuevo**: reemplazar el patrón actual de
  "PUT + verificar + reintento" (`guardarTerrenoNuevoConReintento` en
  `api.js`) por un lock real del lado servidor con `LockService`. Elimina
  la ventana de colisión en vez de solo detectarla y reintentar.
- **Módulo de limpieza completo** (ver sección de arriba): es el caso más
  claro para Apps Script, porque necesita correr solo via trigger por
  tiempo, algo que el frontend actual no puede hacer (solo corre código
  mientras alguien tiene la app abierta).
- **Permisos de Drive centralizados**: hoy cada cliente decide el nivel
  de acceso al subir una foto (`fotos.js`); con el backend, esa decisión
  la controla un solo lugar.
- **Scopes de OAuth más chicos para el usuario final**: si el script
  corre con los permisos del dueño de la planilla, el usuario de campo ya
  no necesitaría autorizar un scope tan amplio de Drive/Sheets — solo
  necesita poder llamar al Web App.

**A tener en cuenta (ya charlado, no descartan la idea pero hay que
diseñarlo con esto en mente)**:
- Latencia extra por el salto adicional (navegador → Apps Script → Sheets
  API) + cold starts de Apps Script (pueden ser de 1-3s en la primera
  llamada tras inactividad). Aceptable para operaciones de fondo
  (guardar, limpiar), no para algo que necesite respuesta instantánea en
  pantalla.
- Límite duro de 6 minutos de ejecución por corrida (no debería afectar
  operaciones puntuales de este proyecto).
- Cuotas diarias de Apps Script (ej. `UrlFetch`) — lejos del volumen
  actual del equipo, pero tenerlo en cuenta si crece mucho.
- Apps Script tiene su propio modelo de despliegue/versionado, más
  separado del flujo Git/VS Code/Claude Code que se usa para el resto del
  proyecto — la fricción que en su momento hizo migrar la app fuera de
  Apps Script sigue siendo válida como razón para NO volver del todo.

## Backend de Apps Script — flujo de trabajo con `clasp` (2026-08-04)

El backend de Apps Script se trabaja con `clasp` (herramienta oficial de
Google), NO desde el editor web de script.google.com. Esto permite
editarlo con Claude Code igual que el resto del proyecto.

**Setup (una sola vez)**:
```bash
npm install -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>   # SCRIPT_ID: Apps Script editor → ⚙️ Configuración del proyecto → ID del Script
```

**⚠️ MUY IMPORTANTE — sin ambiente de staging**:
`clasp push` sube el código local y **prueba directo contra la
planilla real en producción** — no hay ambiente de prueba intermedio
para el backend (a diferencia del frontend, que se prueba con Live
Server antes de subir a GitHub Pages, ver sección de abajo). Cualquier
cambio pusheado puede ejecutarse ya mismo contra datos reales del
equipo. Extremar cuidado con funciones destructivas (el módulo de
limpieza que borra filas/fotos, por ejemplo) — probar primero con
`Logger.log` / modo de solo lectura antes de habilitar el borrado real.

**`push` vs `deploy` — no son lo mismo**:
- `clasp push`: sube el código y alcanza para triggers (ej. el módulo de
  limpieza automática) — el cambio queda activo al instante.
- `clasp deploy`: necesario además de `push` si el script está publicado
  como **Web App con URL fija** (ej. si se migra ahí el guardado de
  terrenos con `LockService`). `push` solo actualiza el código; `deploy`
  actualiza qué versión sirve esa URL publicada.

**Riesgo de pisar cambios**: si alguna vez se edita algo directo en el
editor web de Apps Script (no debería pasar si se trabaja siempre desde
local con Claude Code), hay que correr `clasp pull` antes del próximo
`push`, o se pierde ese cambio sin aviso.

**Claude (chat) no puede leer el proyecto de Apps Script directamente**:
los scripts atados a una planilla no aparecen como archivo normal en
Drive, así que el conector de Drive no los puede leer. Para que Claude
(chat) los revise, hay que compartir el contenido de los archivos
`.gs`/`.js` clonados localmente (pegados en el chat o subidos como
archivo).

## Notas menores

- Columna B (ID GIS) de Hoja 1 nunca se completa al crear terreno nuevo
  (no existe campo `f-colb` en el formulario) — funcionalidad fantasma.
- POS001 tiene en columna "Enlace" un string DMS en vez de URL de Maps,
  por eso nunca puede encontrarse por coincidencia de coordenadas.
- `SHEET_ID` está hardcodeado en `api.js`.

## Cómo se prueba y se publica

- **Esta carpeta (Unidad compartida) es el entorno de desarrollo.** Los
  archivos que se modifican acá se prueban localmente con la extensión
  Live Server de Visual Studio Code — no se ven reflejados en la app que
  usa el equipo hasta que se publican.
- **La versión estable está en GitHub Pages**, en un repo aparte. El
  usuario sube manualmente los cambios ahí solo cuando considera una
  versión probada y estable — no hay deploy automático.
- Por lo tanto: un cambio recién hecho acá y "probado" con Live Server
  todavía NO está en producción. Hay que tenerlo en cuenta al dar
  instrucciones de prueba (probar con Live Server) y al hablar de cuándo
  el equipo de campo va a ver el cambio (recién después de que el usuario
  actualice el GitHub Pages).

## Cómo trabajar en este proyecto

- El usuario no es programador — explicaciones claras, sin asumir jerga.
- Cambios probados de a uno, con explicación de qué se tocó y por qué,
  antes de pasar al siguiente ítem del checklist.
