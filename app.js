// app.js

// Inicializa el mapa centrado inicialmente en una ubicación predeterminada
const map = L.map('map').setView([-0.1807, -78.4678], 12); // Quito como ubicación predeterminada

// Agrega el mapa de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

let marker;

// Intenta obtener la ubicación actual del usuario
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    function(position) {
      const { latitude, longitude } = position.coords;

      // Centra el mapa en la ubicación actual del usuario
      map.setView([latitude, longitude], 15);

      // Coloca un marcador rojo en la ubicación actual
      marker = L.marker([latitude, longitude], { color: 'red' }).addTo(map);
      marker.bindPopup("Tu ubicación actual").openPopup();

      document.getElementById('status').textContent = 'Ubicación detectada. Puedes ajustar tu posición en el mapa.';

      // Llama a la función para buscar el área de cobertura usando la ubicación detectada
      findSpatialFeature(latitude, longitude);
    },
    function(error) {
      console.error("Error al obtener la ubicación:", error);
      document.getElementById('status').textContent = 'No se pudo obtener la ubicación automática. Selecciona tu ubicación manualmente en el mapa.';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
} else {
  document.getElementById('status').textContent = 'Geolocalización no es soportada por tu navegador.';
}

// Evento para permitir al usuario ajustar la ubicación haciendo clic en el mapa
map.on('click', function (e) {
  const { lat, lng } = e.latlng;

  if (marker) {
    marker.setLatLng(e.latlng); // Mueve el marcador a la nueva posición
  } else {
    marker = L.marker(e.latlng, { color: 'red' }).addTo(map); // Crea un marcador rojo si no existe
  }

  marker.bindPopup("Ubicación ajustada").openPopup();
  document.getElementById('status').textContent = 'Ubicación ajustada manualmente. Buscando información...';

  // Llama a la función para buscar el área de cobertura usando las coordenadas seleccionadas
  findSpatialFeature(lat, lng);
});

// Function to find spatial feature (coverage area) without a proxy
function findSpatialFeature(latitude, longitude) {
  const spatialLayerUrl = 'https://arcgis.eeq.com.ec/arcgis/rest/services/Hosted/Coberturas/FeatureServer';
  const queryUrl = `${spatialLayerUrl}/0/query?geometry=${longitude},${latitude}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;

  fetchWithRetry(queryUrl)
    .then(data => {
      console.log("Coverage data received:", data); // Log data for debugging
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const attributes = feature.attributes;
        const alimentadorId = attributes.alimentadorid || attributes.ALIMENTADORID;

        if (alimentadorId) {
          document.getElementById('zoneName').textContent = `Alimentador ID: ${alimentadorId}`;
          queryOutageTable(alimentadorId); // Procede a consultar la tabla de desconexiones
        } else {
          document.getElementById('status').textContent = 'No se encontró el identificador del alimentador en tu ubicación.';
        }
      } else {
        document.getElementById('status').textContent = 'Tu ubicación no está dentro de una zona de cobertura.';
      }
    })
    .catch(error => {
      console.error('Error al obtener la zona de cobertura:', error);
      document.getElementById('status').textContent = 'Error al obtener la zona de cobertura.';
    });
}

// Function to query the OUTAGES table without a proxy
function queryOutageTable(alimentadorId) {
  const restServiceUrl = 'https://arcgis.eeq.com.ec/arcgis/rest/services/Hosted/DESCONEXIONES/FeatureServer';
  const whereClause = encodeURIComponent(`alimentadorid='${alimentadorId}'`);
  const queryUrl = `${restServiceUrl}/0/query?where=${whereClause}&outFields=*&orderByFields=fecha_desconexion%20ASC&periodo_desconexion%20ASC&f=json`;

  fetchWithRetry(queryUrl)
    .then(data => {
      console.log("Outage data received:", data); // Log data for debugging
      if (data.features && data.features.length > 0) {
        displayAllOutages(data.features);
      } else {
        document.getElementById('status').textContent = 'no hay desconexiones programadas para tu área :)';
        document.getElementById('schedule').textContent = '';
      }
    })
    .catch(error => {
      console.error('Error al obtener información de desconexiones:', error);
      document.getElementById('status').textContent = 'Error al obtener información de desconexiones.';
    });
}

// Retry logic for fetch requests
function fetchWithRetry(url, retries = 2) {
  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .catch(error => {
      if (retries > 0) {
        console.warn(`Retrying... (${retries} retries left)`);
        return new Promise(resolve => setTimeout(resolve, 1000))
          .then(() => fetchWithRetry(url, retries - 1));
      } else {
        throw error;
      }
    });
}

// Function to display all outage dates
function displayAllOutages(outages) {
  const DateTime = luxon.DateTime;
  const today = DateTime.now().setZone('America/Guayaquil').startOf('day');

  document.getElementById('status').textContent = '';
  document.getElementById('schedule').textContent = '';

  let todayOutage = null;
  const upcomingOutages = [];

  outages.forEach(outage => {
    const fechaDesconexion = DateTime.fromMillis(outage.attributes.fecha_desconexion, { zone: 'America/Guayaquil' });
    const periodoDesconexion = outage.attributes.periodo_desconexion;
    const fechaFormatted = fechaDesconexion.toFormat('dd/MM/yyyy');

    if (fechaDesconexion.hasSame(today, 'day')) {
      todayOutage = `día: ${fechaFormatted}, hora: ${periodoDesconexion}`;
    } else if (fechaDesconexion > today) {
      upcomingOutages.push(`día: ${fechaFormatted}, hora: ${periodoDesconexion}`);
    }
  });

  if (todayOutage) {
    document.getElementById('schedule').textContent += `horario del corte de hoy:\n${todayOutage}\n\n`;
  } else {
    document.getElementById('schedule').textContent += `no hay cortes programados para hoy :)\n\n`;
  }

  if (upcomingOutages.length > 0) {
    document.getElementById('schedule').textContent += "próximos cortes:\n" + upcomingOutages.join('\n');
  } else {
    document.getElementById('schedule').textContent += "no hay próximos cortes programados.";
  }
}
