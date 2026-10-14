// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// inverter states, connection status, the report of the "Test the connection"
// action and the sentence of the "Read the inverter status" scene action. Four
// languages, those of the Gladys interface; German says "du", Spanish "usted".
// test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

export const STATE_TEXT = {
  en: {
    standby: 'Standby',
    starting: 'Starting',
    normal: 'Normal',
    alarm: 'Alarm',
    fault: 'Fault',
    offline: 'Not answering',
  },
  fr: {
    standby: 'En veille',
    starting: 'Démarrage',
    normal: 'Normal',
    alarm: 'Alarme',
    fault: 'Défaut',
    offline: 'Ne répond pas',
  },
  de: {
    standby: 'Standby',
    starting: 'Startet',
    normal: 'Normal',
    alarm: 'Alarm',
    fault: 'Fehler',
    offline: 'Antwortet nicht',
  },
  es: {
    standby: 'En espera',
    starting: 'Arrancando',
    normal: 'Normal',
    alarm: 'Alarma',
    fault: 'Fallo',
    offline: 'No responde',
  },
};

export const stateText = (language, state) =>
  (STATE_TEXT[language] ?? STATE_TEXT.en)[state] ?? STATE_TEXT.en[state] ?? String(state);

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Shown by Gladys under the integration name when it is not connected.
export const CONNECTION_TEXT = {
  host: {
    en: 'Enter the IP address of the Solarman logger in the configuration.',
    fr: "Saisissez l'adresse IP du logger Solarman dans la configuration.",
    de: 'Gib in der Konfiguration die IP-Adresse des Solarman-Loggers ein.',
    es: 'Introduzca la dirección IP del logger Solarman en la configuración.',
  },
  serial: {
    en: 'Enter the serial number of the logger (10 digits on its label) in the configuration.',
    fr: 'Saisissez le numéro de série du logger (10 chiffres sur son étiquette) dans la configuration.',
    de: 'Gib in der Konfiguration die Seriennummer des Loggers ein (10 Ziffern auf seinem Etikett).',
    es: 'Introduzca el número de serie del logger (10 cifras en su etiqueta) en la configuración.',
  },
  unreachable: {
    en: 'The logger does not answer. Normal at night for an inverter without battery; otherwise check its IP address and serial number.',
    fr: 'Le logger ne répond pas. Normal la nuit pour un onduleur sans batterie ; sinon, vérifiez son adresse IP et son numéro de série.',
    de: 'Der Logger antwortet nicht. Nachts normal bei einem Wechselrichter ohne Batterie; sonst prüfe seine IP-Adresse und Seriennummer.',
    es: 'El logger no responde. Es normal de noche en un inversor sin batería; si no, compruebe su dirección IP y su número de serie.',
  },
};

// The reasons a read fails, for the action report and the logs.
export const PROBLEM_TEXT = {
  en: {
    connect: 'cannot connect to the logger (IP address, port 8899, logger switched off?)',
    timeout: 'the logger does not answer (wrong serial number, or logger asleep)',
    serial: 'the logger answers with another serial number',
    'no-answer': 'the logger answers, but not the inverter (Modbus address, cable)',
    modbus: 'the inverter refuses the registers read (wrong model chosen?)',
    other: 'unexpected answer from the logger',
  },
  fr: {
    connect: 'connexion au logger impossible (adresse IP, port 8899, logger éteint ?)',
    timeout: 'le logger ne répond pas (mauvais numéro de série, ou logger en veille)',
    serial: 'le logger répond avec un autre numéro de série',
    'no-answer': "le logger répond, mais pas l'onduleur (adresse Modbus, câble)",
    modbus: "l'onduleur refuse les registres lus (mauvais modèle choisi ?)",
    other: 'réponse inattendue du logger',
  },
  de: {
    connect: 'keine Verbindung zum Logger (IP-Adresse, Port 8899, Logger aus?)',
    timeout: 'der Logger antwortet nicht (falsche Seriennummer oder Logger im Ruhezustand)',
    serial: 'der Logger antwortet mit einer anderen Seriennummer',
    'no-answer': 'der Logger antwortet, aber nicht der Wechselrichter (Modbus-Adresse, Kabel)',
    modbus: 'der Wechselrichter lehnt die gelesenen Register ab (falsches Modell gewählt?)',
    other: 'unerwartete Antwort des Loggers',
  },
  es: {
    connect: 'no se puede conectar con el logger (dirección IP, puerto 8899, ¿logger apagado?)',
    timeout: 'el logger no responde (número de serie incorrecto o logger en reposo)',
    serial: 'el logger responde con otro número de serie',
    'no-answer': 'el logger responde, pero no el inversor (dirección Modbus, cable)',
    modbus: 'el inversor rechaza los registros leídos (¿modelo elegido incorrecto?)',
    other: 'respuesta inesperada del logger',
  },
};

export const ACTION_TEXT = {
  en: {
    notConfigured: 'Configure the IP address and the serial number of the logger first.',
    ok: (summary) => `Connection OK. ${summary}`,
    failed: (reason) => `Read failed: ${reason}.`,
  },
  fr: {
    notConfigured: "Configurez d'abord l'adresse IP et le numéro de série du logger.",
    ok: (summary) => `Connexion OK. ${summary}`,
    failed: (reason) => `Lecture impossible : ${reason}.`,
  },
  de: {
    notConfigured: 'Konfiguriere zuerst die IP-Adresse und die Seriennummer des Loggers.',
    ok: (summary) => `Verbindung OK. ${summary}`,
    failed: (reason) => `Lesen fehlgeschlagen: ${reason}.`,
  },
  es: {
    notConfigured: 'Configure primero la dirección IP y el número de serie del logger.',
    ok: (summary) => `Conexión correcta. ${summary}`,
    failed: (reason) => `Lectura imposible: ${reason}.`,
  },
};

// The pieces of the status sentence.
const SENTENCE = {
  en: {
    solar: 'solar',
    house: 'house',
    battery: 'battery',
    charging: 'charging',
    discharging: 'discharging',
    importing: 'grid import',
    exporting: 'grid export',
    today: 'produced today',
    state: 'state',
    offline: 'The inverter is not answering.',
    unknown: 'No reading yet.',
    separator: '; ',
  },
  fr: {
    solar: 'solaire',
    house: 'maison',
    battery: 'batterie',
    charging: 'en charge',
    discharging: 'en décharge',
    importing: 'soutirage réseau',
    exporting: 'injection réseau',
    today: "produits aujourd'hui",
    state: 'état',
    offline: "L'onduleur ne répond pas.",
    unknown: 'Aucune lecture pour le moment.',
    separator: ' ; ',
  },
  de: {
    solar: 'Solar',
    house: 'Haus',
    battery: 'Batterie',
    charging: 'lädt',
    discharging: 'entlädt',
    importing: 'Netzbezug',
    exporting: 'Einspeisung',
    today: 'heute erzeugt',
    state: 'Zustand',
    offline: 'Der Wechselrichter antwortet nicht.',
    unknown: 'Noch keine Messung.',
    separator: '; ',
  },
  es: {
    solar: 'solar',
    house: 'casa',
    battery: 'batería',
    charging: 'cargando',
    discharging: 'descargando',
    importing: 'importación de red',
    exporting: 'exportación a red',
    today: 'producidos hoy',
    state: 'estado',
    offline: 'El inversor no responde.',
    unknown: 'Todavía no hay ninguna lectura.',
    separator: '; ',
  },
};

const NUMBER_LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function number(language, value, digits = 0) {
  return new Intl.NumberFormat(NUMBER_LOCALE[language] ?? 'en-GB', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * One sentence describing a reading: "Solar 2,340 W, house 1,200 W, battery
 * 85 % (charging 800 W), grid export 340 W; 12.4 kWh produced today; state Normal."
 * @param {string} language
 * @param {object|null} reading see src/profiles.js
 * @param {boolean} online whether the last read succeeded
 */
export function statusSentence(language, reading, online) {
  const s = SENTENCE[language] ?? SENTENCE.en;
  if (!online) {
    return s.offline;
  }
  if (!reading) {
    return s.unknown;
  }
  const w = (value) => `${number(language, Math.abs(Math.round(value)))} W`;
  const parts = [];
  if (typeof reading.pvPower === 'number') {
    parts.push(`${s.solar} ${w(reading.pvPower)}`);
  }
  if (typeof reading.loadPower === 'number') {
    parts.push(`${s.house} ${w(Math.max(0, reading.loadPower))}`);
  }
  if (typeof reading.batteryLevel === 'number') {
    let battery = `${s.battery} ${number(language, reading.batteryLevel)} %`;
    if (typeof reading.batteryPower === 'number' && Math.abs(reading.batteryPower) >= 10) {
      const way = reading.batteryPower < 0 ? s.charging : s.discharging;
      battery += ` (${way} ${w(reading.batteryPower)})`;
    }
    parts.push(battery);
  }
  if (typeof reading.gridPower === 'number' && Math.abs(reading.gridPower) >= 10) {
    parts.push(`${reading.gridPower > 0 ? s.importing : s.exporting} ${w(reading.gridPower)}`);
  }
  const sentences = [];
  if (parts.length > 0) {
    const text = parts.join(', ');
    sentences.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  if (typeof reading.productionToday === 'number') {
    sentences.push(`${number(language, reading.productionToday, 1)} kWh ${s.today}`);
  }
  if (reading.state) {
    sentences.push(`${s.state} ${stateText(language, reading.state)}`);
  }
  return `${sentences.join(s.separator)}.`;
}
