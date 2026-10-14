// -----------------------------------------------------------------------------
// The configured inverter: reads its logger, publishes the device and its
// states, fires the scene triggers, answers the actions and the widget.
//
// - One logger, one connection (src/v5/client.js), one read at a time: a read
//   asked while another runs waits for it and shares its result.
// - The container reads by its own timer (the device is published with
//   should_poll: false, see CLAUDE.md), only once the device is added in
//   Gladys; the "Test the connection" action reads on demand.
// - Only changed states are published, with a heartbeat; an energy index is
//   never published lower than the last one (a logger answers 0 for a few
//   reads after a restart).
// - A logger that stops answering (every night for an inverter without
//   battery: the logger is powered by the panels) is written once in the logs,
//   once when it is back. After OFFLINE_AFTER failed reads the state says so and
//   the PV powers fall to 0.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { configProblem } from './config.js';
import { INDEX_KEYS, buildDevice, deviceIds, featureSpecs, featureValues } from './devices.js';
import { PROFILES, decode } from './profiles.js';
import { CONNECTION_TEXT, stateText } from './texts.js';
import { evaluate, initialTriggerState } from './triggers.js';
import { SolarmanClient } from './v5/client.js';
import { ModbusException, V5Error } from './v5/frame.js';

const logger = createLogger({ name: 'solarman' });

export const WIDGET_KEY = 'solar';
export const OFFLINE_AFTER = 3;
const HEARTBEAT_MS = 6 * 60 * 60 * 1000;

/** The kind of a read failure, a key of PROBLEM_TEXT. */
export function problemOf(error) {
  if (error instanceof ModbusException) {
    return 'modbus';
  }
  if (error instanceof V5Error) {
    if (error.code === 'closed') {
      return 'connect';
    }
    return ['connect', 'timeout', 'serial', 'no-answer'].includes(error.code)
      ? error.code
      : 'other';
  }
  return 'other';
}

export class SolarmanHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake)
   * @param {boolean} [options.timers] run the reading timer (off in tests)
   * @param {object} [options.client] client options merged in (tests: timeoutMs)
   * @param {number} [options.intervalMs] reading period override (tests)
   */
  constructor({ gladys, timers = true, client = {}, intervalMs }) {
    this.gladys = gladys;
    this.timers = timers;
    this.intervalMs = intervalMs;
    this.clientOptions = client;
    this.config = null;
    this.client = null;
    this.timer = null;
    this.reading = null;
    this.readAt = null;
    this.failures = 0;
    this.lastProblem = null;
    this.inFlight = null;
    this.triggerMemory = initialTriggerState();
    this.indexes = {};
    this.stopped = false;
  }

  get configured() {
    return this.config !== null && configProblem(this.config) === null;
  }

  get online() {
    return this.failures < OFFLINE_AFTER;
  }

  get profile() {
    return this.config ? PROFILES[this.config.profile] : null;
  }

  ids() {
    return deviceIds(this.gladys, this.config.serial);
  }

  isCreated() {
    if (!this.configured) {
      return false;
    }
    const id = this.ids().device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  async start(config) {
    await this.#apply(config);
    logger.info(
      this.configured
        ? `Started: ${this.config.profile} inverter behind logger ${this.config.host}`
        : 'Started without logger: waiting for the configuration',
    );
  }

  async reconfigure(config) {
    await this.#apply(config);
    logger.info('Configuration updated');
  }

  /** Gladys restarted: publish the device and every state again. */
  async resync() {
    await this.#publishDevice();
    if (this.configured) {
      this.gladys.forgetPublishedStates(this.ids().device);
      await this.#publishStates();
    }
  }

  async #apply(config) {
    this.#stopTimer();
    this.client?.close();
    this.client = null;
    this.config = config;
    this.reading = null;
    this.readAt = null;
    this.failures = 0;
    this.lastProblem = null;
    this.triggerMemory = initialTriggerState();
    this.indexes = {};
    const problem = configProblem(config);
    if (problem) {
      await this.gladys.publishDiscoveredDevices([]);
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT[problem]);
      return;
    }
    this.client = new SolarmanClient({
      host: config.host,
      port: config.port,
      serial: config.serial,
      slaveId: config.slave_id,
      ...this.clientOptions,
    });
    await this.#publishDevice();
    this.#schedule(0);
  }

  async #publishDevice() {
    if (!this.configured) {
      return;
    }
    await this.gladys.publishDiscoveredDevices([buildDevice(this.gladys, this.config)]);
  }

  // --- Reading ---------------------------------------------------------------

  /**
   * Reads the logger now (or joins the read in progress) and publishes.
   * @returns {Promise<{ ok: boolean, problem?: string }>}
   */
  refresh() {
    if (!this.configured) {
      return Promise.resolve({ ok: false, problem: 'config' });
    }
    if (!this.inFlight) {
      this.inFlight = this.#read().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  async #read() {
    const profile = this.profile;
    const client = this.client;
    const words = new Map();
    let readRanges = 0;
    let lastError = null;
    for (const [start, count] of profile.ranges) {
      try {
        const values = await client.readRegisters(profile.functionCode, start, count);
        values.forEach((value, i) => words.set(start + i, value));
        readRanges += 1;
      } catch (err) {
        lastError = err;
        // A register range a model does not have is refused by the inverter:
        // its values stay missing. Anything else is a failed read.
        if (!(err instanceof ModbusException)) {
          break;
        }
        logger.debug(`Range 0x${start.toString(16)} refused: ${err.message}`);
      }
    }
    if (client !== this.client || this.stopped) {
      return { ok: false, problem: 'other' }; // reconfigured meanwhile
    }
    if (readRanges === 0 || (lastError && !(lastError instanceof ModbusException))) {
      await this.#failed(lastError);
      return { ok: false, problem: problemOf(lastError) };
    }
    await this.#succeeded(decode(profile, words, this.config.pv_inputs));
    return { ok: true };
  }

  async #succeeded(reading) {
    const wasOffline = !this.online;
    if (this.failures > 0) {
      logger.info(`Logger ${this.config.host} answers again`);
    }
    this.failures = 0;
    this.lastProblem = null;
    this.reading = reading;
    this.readAt = new Date();
    logger.debug(`Read: ${JSON.stringify(reading)}`);
    await this.gladys.setConnectionStatus(true).catch(() => {});
    await this.#publishStates();
    await this.#fireTriggers(reading);
    if (wasOffline) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async #failed(error) {
    const problem = problemOf(error);
    this.failures += 1;
    if (this.failures === 1 || problem !== this.lastProblem) {
      logger.warn(`Logger ${this.config.host} not read: ${error?.message ?? problem}`);
    } else {
      logger.debug(`Logger still not read: ${error?.message ?? problem}`);
    }
    this.lastProblem = problem;
    if (this.failures === OFFLINE_AFTER) {
      await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.unreachable).catch(() => {});
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    if (this.failures >= OFFLINE_AFTER) {
      await this.#publishStates();
    }
  }

  /** The states of the last reading (or of the offline inverter). */
  currentValues() {
    const language = this.config.language;
    if (!this.online) {
      // The logger of an inverter without battery is powered by the panels:
      // no answer is, most of the time, no production.
      const zero = Object.fromEntries(
        featureSpecs(this.config)
          .filter((spec) => spec.key === 'pv_power' || spec.input)
          .map((spec) => [spec.key, 0]),
      );
      return { ...zero, state: { text: stateText(language, 'offline') } };
    }
    if (!this.reading) {
      return {};
    }
    const values = featureValues(this.config, this.reading, (state) => stateText(language, state));
    for (const key of INDEX_KEYS) {
      if (values[key] === undefined) {
        continue;
      }
      const last = this.indexes[key];
      if (values[key] <= 0 || (last !== undefined && values[key] < last)) {
        logger.debug(`Index ${key} skipped: ${values[key]} after ${last}`);
        delete values[key];
      } else {
        this.indexes[key] = values[key];
      }
    }
    return values;
  }

  async #publishStates() {
    if (!this.isCreated()) {
      return;
    }
    const ids = this.ids();
    const states = Object.entries(this.currentValues()).map(([key, value]) =>
      typeof value === 'object'
        ? { device_feature_external_id: ids.feature(key), text: value.text }
        : { device_feature_external_id: ids.feature(key), state: value },
    );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.warn(`States not published: ${err.message}`);
    }
  }

  async #fireTriggers(reading) {
    const events = evaluate(this.triggerMemory, reading, {
      exportThreshold: this.config.export_threshold,
    });
    for (const event of events) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Scene event ${event.key} not published: ${err.message}`);
      }
    }
  }

  // --- Gladys events -----------------------------------------------------------

  /** The user added the device: its features exist now, every state is sent again. */
  async onDeviceCreated(device) {
    if (!this.configured || device?.external_id !== this.ids().device) {
      return;
    }
    this.gladys.forgetPublishedStates(device.external_id);
    this.indexes = {};
    if (this.reading || !this.online) {
      await this.#publishStates();
    } else {
      await this.refresh();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** onPoll fallback: the device is published with should_poll false. */
  async poll(device) {
    if (this.configured && device?.external_id === this.ids().device) {
      await this.refresh();
    }
  }

  // --- Timer -------------------------------------------------------------------

  #schedule(delayMs) {
    if (!this.timers || this.stopped || !this.configured) {
      return;
    }
    this.#stopTimer();
    this.timer = setTimeout(() => this.#tick(), delayMs);
    this.timer.unref?.();
  }

  async #tick() {
    const periodMs = this.intervalMs ?? this.config.poll_interval * 1000;
    try {
      // Read only for an added device, and not twice within half a period
      // (an action may just have read).
      const fresh = this.readAt && Date.now() - this.readAt.getTime() < periodMs / 2;
      if (this.isCreated() && !fresh) {
        await this.refresh();
      }
    } catch (err) {
      logger.error('Reading cycle failed', err);
    } finally {
      this.#schedule(periodMs);
    }
  }

  #stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async stop() {
    this.stopped = true;
    this.#stopTimer();
    await this.inFlight?.catch(() => {});
    this.client?.close();
  }
}
