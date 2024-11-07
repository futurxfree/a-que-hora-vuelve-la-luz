// app.js

// Define el proxyUrl globalmente
const proxyUrl = 'https://mi-proxy-cors-727443ca806f.herokuapp.com/';

// Verifica si la Geolocalización es soportada
if ('geolocation' in navigator) {
  requestLocation();
} else {
  document.getElementById('status').textContent = 'Geolocalización no es soportada por tu navegador.';
}

// Función para solicitar la ubicación
function requestLocation() {
  navigator.geolocation.getCurrentPosition(success, error, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

// Función de éxito
function success(position) {
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  document.getElementById('status').textContent = 'ubi detectada, buscando info';

  // Procede a encontrar el área de cobertura
  findSpatialFeature(latitude, longitude);
}

// Función de error
function error(err) {
  console.warn(`ERROR(${err.code}): ${err.message}`);
  let errorMessage = 'No se pudo obtener tu ubicación.';

  if (err.code === err.PERMISSION_DENIED) {
    errorMessage += ' Has denegado el acceso a la ubicación.';
    document.getElementById('instruction').innerHTML = 'Por favor, habilita el acceso a la ubicación en tu dispositivo y navegador.<br>Para volver a intentarlo, <a href="#" onclick="requestLocation()">haz clic aquí</a>.';
  } else if (err.code === err.POSITION_UNAVAILABLE) {
    errorMessage += ' La información de ubicación no está disponible.';
  } else if (err.code === err.TIMEOUT) {
    errorMessage += ' La solicitud para obtener la ubicación ha caducado.';
    document.getElementById('instruction').innerHTML = 'Por favor, asegúrate de tener una buena señal de GPS o conexión a Internet.<br>Para volver a intentarlo, <a href="#" onclick="requestLocation()">haz clic aquí</a>.';
  } else {
    errorMessage += ' Error desconocido.';
  }

  document.getElementById('status').textContent = errorMessage;
  document.getElementById('status').classList.add('error');
}

// Función para encontrar la característica espacial (área de cobertura)
function findSpatialFeature(latitude, longitude) {
  const spatialLayerUrl = 'https://arcgis.eeq.com.ec/arcgis/rest/services/Hosted/Coberturas/FeatureServer';
  const queryUrl = `${spatialLayerUrl}/0/query?geometry=${longitude},${latitude}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;

  const fullUrl = proxyUrl + queryUrl;

  fetch(fullUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const attributes = feature.attributes;
        const alimentadorId = attributes.alimentadorid || attributes.ALIMENTADORID;

        if (alimentadorId) {
          // Procede a consultar la tabla DESCONEXIONES
          queryOutageTable(alimentadorId);
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

// Función para consultar la tabla DESCONEXIONES
function queryOutageTable(alimentadorId) {
  const DateTime = luxon.DateTime;
  const todayStart = DateTime.now().setZone('America/Guayaquil').startOf('day').toMillis();

  const restServiceUrl = 'https://arcgis.eeq.com.ec/arcgis/rest/services/Hosted/DESCONEXIONES/FeatureServer';
  const whereClause = encodeURIComponent(`alimentadorid='${alimentadorId}' AND fecha_desconexion >= ${todayStart}`);
  const queryUrl = `${restServiceUrl}/0/query?where=${whereClause}&outFields=*&orderByFields=fecha_desconexion%20ASC&periodo_desconexion%20ASC&f=json`;

  const fullUrl = proxyUrl + queryUrl;

  fetch(fullUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.features && data.features.length > 0) {
        displayOutageInfo(alimentadorId, data.features);
      } else {
        document.getElementById('status').textContent = 'No hay desconexiones programadas para tu área.';
        // Limpia información previa si existe
        document.getElementById('zoneName').textContent = '';
        document.getElementById('schedule').textContent = '';
        document.getElementById('countdown').textContent = '';
      }
    })
    .catch(error => {
      console.error('Error al obtener información de desconexiones:', error);
      document.getElementById('status').textContent = 'Error al obtener información de desconexiones.';
    });
}

// Función para mostrar la información de la desconexión
function displayOutageInfo(alimentadorId, outageFeatures) {
  const DateTime = luxon.DateTime;

  document.getElementById('status').textContent = '';
  document.getElementById('zoneName').textContent = `Alimentador: ${alimentadorId}`;

  let scheduleText = 'próximos horarios de desconexión :(\n';

  outageFeatures.forEach((feature) => {
    const outageInfo = feature.attributes;

    // Crear el objeto DateTime directamente en la zona horaria 'America/Guayaquil'
    const fechaDesconexion = DateTime.fromMillis(outageInfo.fecha_desconexion, { zone: 'America/Guayaquil' });

    const periodoDesconexion = outageInfo.periodo_desconexion;

    // Formatea la fecha
    const fechaFormatted = fechaDesconexion.toFormat('dd/MM/yyyy');

    scheduleText += `- ${fechaFormatted} ${periodoDesconexion}\n`;
  });

  document.getElementById('schedule').textContent = scheduleText;

  // Tomamos la primera desconexión para iniciar el contador
  const firstOutage = outageFeatures[0].attributes;
  const fechaDesconexion = DateTime.fromMillis(firstOutage.fecha_desconexion, { zone: 'America/Guayaquil' });
  const periodoDesconexion = firstOutage.periodo_desconexion;

  const endTime = calculateEndTime(fechaDesconexion, periodoDesconexion);
  startCountdown(endTime);
}

// Función para calcular la hora de finalización basada en el periodo
function calculateEndTime(startDateTime, period) {
  const DateTime = luxon.DateTime;

  // Suponiendo que el periodo está en el formato '15:00 a 18:00'
  const timeRange = period.split(' a ');
  if (timeRange.length === 2) {
    const endTimeString = timeRange[1];
    const [hours, minutes] = endTimeString.split(':').map(Number);

    // Crea un objeto DateTime para la hora de finalización en la zona horaria 'America/Guayaquil'
    const endDateTime = DateTime.fromObject(
      {
        year: startDateTime.year,
        month: startDateTime.month,
        day: startDateTime.day,
        hour: hours,
        minute: minutes,
      },
      { zone: 'America/Guayaquil' }
    );

    return endDateTime;
  } else {
    // Maneja formato inesperado
    return startDateTime;
  }
}

// Función para iniciar la cuenta regresiva
function startCountdown(endTime) {
  let countdownInterval;

  function updateCountdown() {
    const DateTime = luxon.DateTime;
    const now = DateTime.now().setZone('America/Guayaquil');

    if (endTime > now) {
      const timeRemaining = endTime.diff(now, ['hours', 'minutes', 'seconds']).toObject();

      const hours = Math.floor(timeRemaining.hours);
      const minutes = Math.floor(timeRemaining.minutes);
      const seconds = Math.floor(timeRemaining.seconds);

      document.getElementById('countdown').textContent = `Tiempo restante: ${hours}h ${minutes}m ${seconds}s`;
    } else {
      document.getElementById('countdown').textContent = 'deberías tener luz :)';
      clearInterval(countdownInterval);
    }
  }

  updateCountdown(); // Llamada inicial
  countdownInterval = setInterval(updateCountdown, 1000); // Actualiza cada segundo
}
