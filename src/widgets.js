// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `solar`.
//
// The power flows of the house in one card: solar production, house
// consumption, grid exchange (one signed tile, "Import" or "Export"), battery
// level and power, production of the day, and the inverter state.
//
// Budget (8 components, 2 texts, 1 status): six tiles, a status list, a
// caption. Tiles of a value Gladys stores are bound to the feature once the
// device is added (live); the signed ones (grid, battery power) are written by
// the integration and refreshed by the TTL.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { stateText } from './texts.js';

const TTL_SECONDS = 30;

export const TEXT = {
  notConfigured: {
    en: 'Configure the Solarman logger in the integration settings.',
    fr: "Configurez le logger Solarman dans les réglages de l'intégration.",
    de: 'Konfiguriere den Solarman-Logger in den Einstellungen der Integration.',
    es: 'Configure el logger Solarman en los ajustes de la integración.',
  },
  notCreated: {
    en: 'Add the inverter from the Discovery tab of the integration.',
    fr: "Ajoutez l'onduleur depuis l'onglet Découverte de l'intégration.",
    de: 'Füge den Wechselrichter über den Tab „Entdecken“ der Integration hinzu.',
    es: 'Añada el inversor desde la pestaña Descubrir de la integración.',
  },
  offline: {
    en: 'The logger is not answering: last values shown.',
    fr: 'Le logger ne répond pas : dernières valeurs affichées.',
    de: 'Der Logger antwortet nicht: letzte Werte angezeigt.',
    es: 'El logger no responde: se muestran los últimos valores.',
  },
  solar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  house: { en: 'House', fr: 'Maison', de: 'Haus', es: 'Casa' },
  import: { en: 'Grid import', fr: 'Soutirage', de: 'Netzbezug', es: 'Importación' },
  export: { en: 'Grid export', fr: 'Injection', de: 'Einspeisung', es: 'Exportación' },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  charging: { en: 'Charging', fr: 'Charge', de: 'Ladung', es: 'Carga' },
  discharging: { en: 'Discharging', fr: 'Décharge', de: 'Entladung', es: 'Descarga' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  inverter: { en: 'Inverter', fr: 'Onduleur', de: 'Wechselrichter', es: 'Inversor' },
  lastRead: {
    en: 'Last reading',
    fr: 'Dernière lecture',
    de: 'Letzte Messung',
    es: 'Última lectura',
  },
};

const t = (text, language) => text[language] ?? text.en;
const STATE_COLOR = {
  normal: WIDGET_COLORS.SUCCESS,
  standby: WIDGET_COLORS.NEUTRAL,
  starting: WIDGET_COLORS.INFO,
  alarm: WIDGET_COLORS.WARNING,
  fault: WIDGET_COLORS.DANGER,
  offline: WIDGET_COLORS.DANGER,
};

function message(text, language) {
  return {
    ttl_seconds: TTL_SECONDS,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** A tile bound to its feature when the device exists, else the value read. */
function tile(hub, created, { key, label, icon, value, unit, color }, language) {
  const base = { type: 'value', label: t(label, language), icon, ...(color ? { color } : {}) };
  if (created) {
    return { ...base, device_feature: hub.ids().feature(key) };
  }
  return { ...base, value: typeof value === 'number' ? Math.round(value) : '-', unit };
}

function clock(date, language, timeZone) {
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', timeZone }).format(
    date,
  );
}

/**
 * The widget content.
 * @param {object} hub
 * @param {object} request `{ settings, language }`
 */
export function solarWidget(hub, { language = 'en' } = {}) {
  if (!hub.configured) {
    return message(TEXT.notConfigured, language);
  }
  const created = hub.isCreated();
  const reading = hub.reading ?? {};
  const online = hub.online;
  const components = [];
  const has = (key) => typeof reading[key] === 'number';
  const pv = online ? reading.pvPower : 0;

  components.push(
    tile(
      hub,
      created,
      {
        key: 'pv_power',
        label: TEXT.solar,
        icon: 'sun',
        value: pv,
        unit: 'W',
        color: WIDGET_COLORS.SUCCESS,
      },
      language,
    ),
  );
  if (has('loadPower')) {
    components.push(
      tile(
        hub,
        created,
        {
          key: 'load_power',
          label: TEXT.house,
          icon: 'home',
          value: Math.max(0, reading.loadPower),
          unit: 'W',
        },
        language,
      ),
    );
  }
  if (has('gridPower')) {
    const exporting = reading.gridPower < 0;
    components.push({
      type: 'value',
      label: t(exporting ? TEXT.export : TEXT.import, language),
      icon: exporting ? 'upload' : 'download',
      value: Math.abs(Math.round(reading.gridPower)),
      unit: 'W',
      color: exporting ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }
  if (has('batteryLevel')) {
    components.push(
      tile(
        hub,
        created,
        {
          key: 'battery_level',
          label: TEXT.battery,
          icon: 'battery',
          value: reading.batteryLevel,
          unit: '%',
        },
        language,
      ),
    );
  }
  if (has('batteryPower')) {
    const charging = reading.batteryPower < 0;
    components.push({
      type: 'value',
      label: t(charging ? TEXT.charging : TEXT.discharging, language),
      icon: charging ? 'battery-charging' : 'zap',
      value: Math.abs(Math.round(reading.batteryPower)),
      unit: 'W',
    });
  }
  if (has('productionToday')) {
    components.push(
      created
        ? tile(
            hub,
            true,
            { key: 'production_today', label: TEXT.today, icon: 'calendar' },
            language,
          )
        : {
            type: 'value',
            label: t(TEXT.today, language),
            icon: 'calendar',
            value: Math.round(reading.productionToday * 10) / 10,
            unit: 'kWh',
          },
    );
  }

  const state = online ? reading.state : 'offline';
  const items = [];
  if (state) {
    items.push({
      label: t(TEXT.inverter, language),
      value: stateText(language, state),
      color: STATE_COLOR[state] ?? WIDGET_COLORS.NEUTRAL,
    });
  }
  if (hub.readAt) {
    items.push({
      label: t(TEXT.lastRead, language),
      value: clock(hub.readAt, language, process.env.TZ || undefined),
      icon: 'clock',
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }
  if (!created) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.notCreated, language) });
  } else if (!online) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.offline, language) });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => solarWidget(hub, request),
  },
};
