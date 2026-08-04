// ==========================================
// MÓDULO 6: GEOCODIFICACIÓN INVERSA (SOLO CALLE)
// ==========================================

async function obtenerDireccionDesdeCoordenadas(lat, lng) {
  try {
    const latFix = Number(lat).toFixed(6);
    const lngFix = Number(lng).toFixed(6);

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latFix}&lon=${lngFix}`;

    const respuesta = await fetch(url, {
      headers: {
        'Accept-Language': 'es'
      }
    });

    if (!respuesta.ok) throw new Error("Error en la respuesta de la red");

    const data = await respuesta.json();

    if (data && data.address) {
      const a = data.address;

      const calle = a.road || a.pedestrian || a.suburb || a.neighbourhood || "";
      const numero = a.house_number ? ` ${a.house_number}` : "";

      const direccionCompleta = (calle + numero).trim();

      return {
        direccion: direccionCompleta || "Dirección no identificada"
      };
    }

    return { direccion: "" };

  } catch (error) {
    console.error("Error al obtener dirección automática:", error);
    return { direccion: "" };
  }
}