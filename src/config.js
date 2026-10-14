// -----------------------------------------------------------------------------
// Integration configuration: defaults (mirroring the manifest `config_schema`)
// and normalization, so the rest of the code never deals with strings or
// `undefined`.
// -----------------------------------------------------------------------------

import { DEFAULT_PROFILE, PROFILES } from './profiles.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = {
  host: '',
  serial: '',
  profile: DEFAULT_PROFILE,
  port: 8899,
  slave_id: 1,
  pv_inputs: 2,
  poll_interval: 30,
  export_threshold: 100,
  language: 'fr',
};

export const MIN_POLL_INTERVAL = 15;
export const MAX_POLL_INTERVAL = 3600;

function integer(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const number = Number(String(value ?? '').trim());
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/**
 * The logger serial number: 10 digits printed on the stick (17xxxxxxxx,
 * 21xxxxxxxx, 23xxxxxxxx, 27xxxxxxxx, 40xxxxxxxx...), a 32-bit number.
 * @returns {number|null}
 */
export function parseSerial(value) {
  const text = String(value ?? '').replace(/\s+/g, '');
  if (!/^\d{1,10}$/.test(text)) {
    return null;
  }
  const serial = Number(text);
  return serial > 0 && serial <= 0xffffffff ? serial : null;
}

/** A host name or an IPv4/IPv6 address, without scheme, port or path. */
export function parseHost(value) {
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9.:-]{1,253}$/.test(text) ? text : null;
}

export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  return {
    host: parseHost(config.host),
    serial: parseSerial(config.serial),
    profile: PROFILES[config.profile] ? config.profile : DEFAULT_CONFIG.profile,
    port: integer(config.port, DEFAULT_CONFIG.port, 1, 65535),
    slave_id: integer(config.slave_id, DEFAULT_CONFIG.slave_id, 1, 247),
    pv_inputs: integer(config.pv_inputs, DEFAULT_CONFIG.pv_inputs, 1, 4),
    poll_interval: integer(
      config.poll_interval,
      DEFAULT_CONFIG.poll_interval,
      MIN_POLL_INTERVAL,
      MAX_POLL_INTERVAL,
    ),
    export_threshold: integer(config.export_threshold, DEFAULT_CONFIG.export_threshold, 10, 100000),
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
  };
}

/** What is missing for the integration to read the logger, or null. */
export function configProblem(config) {
  if (!config.host) {
    return 'host';
  }
  if (!config.serial) {
    return 'serial';
  }
  return null;
}
