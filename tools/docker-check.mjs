// -----------------------------------------------------------------------------
// Check run INSIDE the integration image, in the Gladys sandbox constraints
// (see CLAUDE.md, "Vérification Docker"), against a fake logger running in
// another container (FAKE_HOST): the real client and its failures, then the
// whole integration against the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { problemOf } from '../src/hub.js';
import { PROFILES, decode } from '../src/profiles.js';
import { SolarmanClient } from '../src/v5/client.js';

process.env.LOG_LEVEL ??= 'silent';
const host = process.env.FAKE_HOST;
const serial = 1712345678;
const step = (text) => console.log(`- ${text}`);

// 1. The client, as is.
const client = new SolarmanClient({ host, serial, timeoutMs: 3000 });
const profile = PROFILES.deye_hybrid;
const words = new Map();
for (const [start, count] of profile.ranges) {
  (await client.readRegisters(3, start, count)).forEach((word, i) => words.set(start + i, word));
}
const reading = decode(profile, words, 2);
assert.equal(reading.pvPower, 3210);
assert.equal(reading.gridPower, -350);
step(`client read ${words.size} registers: ${JSON.stringify(reading)}`);
client.close();

const failure = async (options, expected) => {
  const c = new SolarmanClient({ host, serial, timeoutMs: 1500, ...options });
  await assert.rejects(c.readRegisters(3, 0xb8, 1), (err) => problemOf(err) === expected);
  c.close();
  step(`${JSON.stringify(options)} -> ${expected}`);
};
await failure({ serial: serial + 1 }, 'timeout');
await failure({ slaveId: 2 }, 'no-answer');
await failure({ port: 8898 }, 'connect');

// 2. The integration against the SDK's fake Gladys.
const gladys = createFakeGladys({
  config: { host, serial: String(serial), profile: 'deye_hybrid', language: 'fr' },
});
const app = registerHandlers(gladys, { timers: false });
await gladys.connect();
await app.ready;
const [device] = gladys.fake.discoveredDevices;
await gladys.fake.deviceCreated(device);
await app.hub.inFlight;
step(
  `device "${device.name}", ${device.features.length} features, ${gladys.fake.states.length} states`,
);
const ack = await gladys.fake.sceneAction('read_status', {});
step(`read_status: ${ack.data.outputs.summary}`);
const widget = await gladys.fake.widgetGet('solar', { settings: {}, language: 'fr' });
assert.equal(widget.success, true);
await app.stop();

const { rss, heapUsed } = process.memoryUsage();
step(`memory: rss ${Math.round(rss / 1e6)} MB, heap ${Math.round(heapUsed / 1e6)} MB`);
console.log('Docker check OK');
process.exit(0);
