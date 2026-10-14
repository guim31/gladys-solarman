// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Solarman logger (a real
// TCP server on the loopback interface, tools/fake-logger.mjs), and the
// integration wired on top through registerHandlers. No timer runs unless
// asked: the tests read with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { deviceIds } from '../../src/devices.js';
import { FakeLogger } from '../../tools/fake-logger.mjs';

process.env.LOG_LEVEL ??= 'silent';

export const SERIAL = 1712345678;

/**
 * @param {object} [options]
 * @param {string} [options.profile]
 * @param {object} [options.config] raw config merged over a working one
 * @param {boolean} [options.created] whether the inverter is already added in Gladys
 * @param {object} [options.logger] FakeLogger options
 */
export async function createWorld({
  profile = 'deye_hybrid',
  config = {},
  created = false,
  logger: loggerOptions = {},
  timers = false,
  intervalMs,
} = {}) {
  const logger = await new FakeLogger({ profile, serial: SERIAL, ...loggerOptions }).start();
  const fullConfig = {
    host: '127.0.0.1',
    port: logger.port,
    serial: String(SERIAL),
    profile,
    language: 'en',
    ...config,
  };
  const gladys = createFakeGladys({ config: fullConfig });
  const app = registerHandlers(gladys, { timers, client: { timeoutMs: 300 }, intervalMs });
  const world = { gladys, fake: gladys.fake, app, hub: app.hub, logger };
  world.ids = () => deviceIds(gladys, SERIAL);
  world.stop = async () => {
    await app.stop();
    await logger.stop();
  };
  await gladys.connect();
  await app.ready;
  if (created) {
    await createInverter(world);
  }
  return world;
}

/** Adds the discovered inverter in Gladys, as the user would. */
export async function createInverter(world) {
  const [device] = world.fake.discoveredDevices;
  await world.fake.deviceCreated(device);
  await world.hub.inFlight;
}

/** The last state published for a feature key (number, or text). */
export function lastValue(world, key) {
  return world.fake.lastState(world.ids().feature(key));
}
