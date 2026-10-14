// -----------------------------------------------------------------------------
// The Gladys device of an inverter: its features, their names in the four
// languages, and the states of a reading.
//
// The type of a measure decides what the Gladys core does with it (energy
// module, scenes, dashboard), so each one was chosen by reading who consumes
// it in the core (5.2.0), as gladys-solaredge and gladys-modbus do:
// - production total: `energy-production-sensor/index`, the production index;
// - grid import total: `energy-sensor/index`, the ONLY measure the energy
//   module counts as consumption (and costs): what the supplier bills;
// - grid export total: `grid-sensor/output-index`; battery totals:
//   `battery-storage/charge-index` / `discharge-index` (no pipeline reads them);
// - energies "of the day" other than production: `energy-sensor/index-today`,
//   read by no pipeline. The house consumption total has no type that the
//   energy module would not bill a second time: not published.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { PROFILES, capabilities } from './profiles.js';

export const DEVICE_TYPE = 'inverter';

const POWER_MAX = 100_000; // W: three-phase hybrids go up to 50 kW
const INDEX_MAX = 1_000_000_000;
const DAY_MAX = 100_000;

// Feature key -> where its value comes from (`reading`) and what it is.
const FEATURES = [
  {
    key: 'pv_power',
    reading: 'pvPower',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: POWER_MAX,
  },
  {
    key: 'production_today',
    reading: 'productionToday',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: DAY_MAX,
  },
  {
    key: 'production_total',
    reading: 'productionTotal',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: INDEX_MAX,
    index: true,
  },
  {
    key: 'grid_power',
    reading: 'gridPower',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.POWER,
    unit: U.WATT,
    min: -POWER_MAX,
    max: POWER_MAX,
  },
  {
    key: 'grid_import_today',
    reading: 'importToday',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX_TODAY,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: DAY_MAX,
  },
  {
    key: 'grid_export_today',
    reading: 'exportToday',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX_TODAY,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: DAY_MAX,
  },
  {
    key: 'grid_import_total',
    reading: 'importTotal',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: INDEX_MAX,
    index: true,
  },
  {
    key: 'grid_export_total',
    reading: 'exportTotal',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.OUTPUT_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: INDEX_MAX,
    index: true,
  },
  {
    key: 'load_power',
    reading: 'loadPower',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: POWER_MAX,
  },
  {
    key: 'load_today',
    reading: 'loadToday',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX_TODAY,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: DAY_MAX,
  },
  {
    key: 'battery_level',
    reading: 'batteryLevel',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.BATTERY_LEVEL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  {
    key: 'battery_charge_power',
    reading: 'batteryChargePower',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: POWER_MAX,
  },
  {
    key: 'battery_discharge_power',
    reading: 'batteryDischargePower',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: POWER_MAX,
  },
  {
    key: 'battery_charge_total',
    reading: 'batteryChargeTotal',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: INDEX_MAX,
    index: true,
  },
  {
    key: 'battery_discharge_total',
    reading: 'batteryDischargeTotal',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: INDEX_MAX,
    index: true,
  },
  {
    key: 'battery_temperature',
    reading: 'batteryTemperature',
    category: C.DEVICE_TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -40,
    max: 100,
  },
  {
    key: 'inverter_temperature',
    reading: 'inverterTemperature',
    category: C.DEVICE_TEMPERATURE_SENSOR,
    type: T.SENSOR.DECIMAL,
    unit: U.CELSIUS,
    min: -40,
    max: 150,
  },
  { key: 'state', reading: 'state', category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0 },
];

export const INDEX_KEYS = FEATURES.filter((feature) => feature.index).map((f) => f.key);

// `{n}`: the PV input number.
export const NAMES = {
  en: {
    device: 'Solar inverter',
    pv_power: 'Solar production',
    pv_input: 'PV{n} production',
    production_today: 'Production today',
    production_total: 'Total production',
    grid_power: 'Grid power',
    grid_import_today: 'Grid import today',
    grid_export_today: 'Grid export today',
    grid_import_total: 'Grid import index',
    grid_export_total: 'Grid export index',
    load_power: 'House consumption',
    load_today: 'House consumption today',
    battery_level: 'Battery level',
    battery_charge_power: 'Battery charge',
    battery_discharge_power: 'Battery discharge',
    battery_charge_total: 'Battery charge index',
    battery_discharge_total: 'Battery discharge index',
    battery_temperature: 'Battery temperature',
    inverter_temperature: 'Inverter temperature',
    state: 'Inverter state',
  },
  fr: {
    device: 'Onduleur solaire',
    pv_power: 'Production solaire',
    pv_input: 'Production PV{n}',
    production_today: 'Production du jour',
    production_total: 'Production totale',
    grid_power: 'Puissance réseau',
    grid_import_today: 'Soutiré aujourd’hui',
    grid_export_today: 'Injecté aujourd’hui',
    grid_import_total: 'Index soutiré',
    grid_export_total: 'Index injecté',
    load_power: 'Consommation maison',
    load_today: 'Consommation du jour',
    battery_level: 'Niveau de batterie',
    battery_charge_power: 'Charge batterie',
    battery_discharge_power: 'Décharge batterie',
    battery_charge_total: 'Index de charge batterie',
    battery_discharge_total: 'Index de décharge batterie',
    battery_temperature: 'Température batterie',
    inverter_temperature: 'Température onduleur',
    state: 'État de l’onduleur',
  },
  de: {
    device: 'Solar-Wechselrichter',
    pv_power: 'Solarproduktion',
    pv_input: 'Produktion PV{n}',
    production_today: 'Produktion heute',
    production_total: 'Gesamtproduktion',
    grid_power: 'Netzleistung',
    grid_import_today: 'Netzbezug heute',
    grid_export_today: 'Einspeisung heute',
    grid_import_total: 'Zählerstand Netzbezug',
    grid_export_total: 'Zählerstand Einspeisung',
    load_power: 'Hausverbrauch',
    load_today: 'Hausverbrauch heute',
    battery_level: 'Batteriestand',
    battery_charge_power: 'Batterieladung',
    battery_discharge_power: 'Batterieentladung',
    battery_charge_total: 'Zählerstand Batterieladung',
    battery_discharge_total: 'Zählerstand Batterieentladung',
    battery_temperature: 'Batterietemperatur',
    inverter_temperature: 'Wechselrichtertemperatur',
    state: 'Wechselrichterzustand',
  },
  es: {
    device: 'Inversor solar',
    pv_power: 'Producción solar',
    pv_input: 'Producción PV{n}',
    production_today: 'Producción de hoy',
    production_total: 'Producción total',
    grid_power: 'Potencia de red',
    grid_import_today: 'Importado hoy',
    grid_export_today: 'Exportado hoy',
    grid_import_total: 'Índice de importación',
    grid_export_total: 'Índice de exportación',
    load_power: 'Consumo de la casa',
    load_today: 'Consumo de hoy',
    battery_level: 'Nivel de batería',
    battery_charge_power: 'Carga de batería',
    battery_discharge_power: 'Descarga de batería',
    battery_charge_total: 'Índice de carga de batería',
    battery_discharge_total: 'Índice de descarga de batería',
    battery_temperature: 'Temperatura de batería',
    inverter_temperature: 'Temperatura del inversor',
    state: 'Estado del inversor',
  },
};

// The brand shown in the device name and model, per profile.
export const MODELS = {
  deye_hybrid: { brand: 'Deye', model: 'Deye hybrid (single-phase)' },
  deye_hybrid_3p: { brand: 'Deye', model: 'Deye hybrid (three-phase, LV battery)' },
  deye_hybrid_3p_hv: { brand: 'Deye', model: 'Deye hybrid (three-phase, HV battery)' },
  deye_micro: { brand: 'Deye', model: 'Deye microinverter' },
  sofar_g3: { brand: 'Sofar', model: 'Sofar G3' },
  solis_1p: { brand: 'Solis', model: 'Solis single-phase (5G)' },
};

/** The features a configuration publishes, as `{ key, reading, ...spec }`, PV inputs included. */
export function featureSpecs(config) {
  const profile = PROFILES[config.profile];
  const { strings, has } = capabilities(profile, config.pv_inputs);
  const specs = [];
  for (const feature of FEATURES) {
    if (!has(feature.reading)) {
      continue;
    }
    specs.push(feature);
    if (feature.key === 'pv_power' && strings > 1) {
      // One production per PV input, right after the total.
      for (let n = 1; n <= strings; n += 1) {
        specs.push({ ...feature, key: `pv${n}_power`, reading: `string${n}`, input: n });
      }
    }
  }
  return specs;
}

export function deviceIds(gladys, serial) {
  return gladys.externalIds(DEVICE_TYPE, String(serial));
}

/** The discovered device of the configured inverter. */
export function buildDevice(gladys, config) {
  const names = NAMES[config.language] ?? NAMES.fr;
  const ids = deviceIds(gladys, config.serial);
  const { brand, model } = MODELS[config.profile];
  return {
    name: `${names.device} ${brand}`,
    external_id: ids.device,
    model,
    // Read by the container's own timer, at the configured interval.
    should_poll: false,
    features: featureSpecs(config).map((spec) => ({
      name: spec.input ? names.pv_input.replace('{n}', spec.input) : names[spec.key],
      external_id: ids.feature(spec.key),
      category: spec.category,
      type: spec.type,
      ...(spec.unit ? { unit: spec.unit } : {}),
      read_only: true,
      has_feedback: false,
      keep_history: spec.key !== 'state',
      min: spec.min,
      max: spec.max,
    })),
  };
}

/**
 * The value of every feature in a reading (missing values left out).
 * @param {object} reading see src/profiles.js
 * @param {(state: string) => string} stateText the state in the user's language
 */
export function featureValues(config, reading, stateText) {
  const values = {};
  const derived = {
    ...reading,
    ...(typeof reading.batteryPower === 'number'
      ? {
          batteryChargePower: Math.max(0, -reading.batteryPower),
          batteryDischargePower: Math.max(0, reading.batteryPower),
        }
      : {}),
    ...Object.fromEntries((reading.strings ?? []).map((value, i) => [`string${i + 1}`, value])),
  };
  for (const spec of featureSpecs(config)) {
    const value = derived[spec.reading];
    if (value === undefined || value === null) {
      continue;
    }
    if (spec.key === 'state') {
      values.state = { text: stateText(value) };
    } else if (spec.key === 'load_power' || spec.key === 'pv_power' || spec.input) {
      values[spec.key] = Math.max(0, value);
    } else {
      values[spec.key] = value;
    }
  }
  return values;
}
