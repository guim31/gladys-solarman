// -----------------------------------------------------------------------------
// The integration as Gladys sees it: discovery, states, offline logger,
// energy indexes, scene triggers, actions, the container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_AFTER } from '../src/hub.js';
import { SAMPLE_READINGS } from '../tools/fake-logger.mjs';
import { createInverter, createWorld, lastValue } from './helpers/world.js';

async function world(t, options) {
  const created = await createWorld(options);
  t.after(() => created.stop());
  return created;
}

test('the configured inverter is discovered, read only, and not polled by Gladys', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.external_id, w.ids().device);
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.ok(device.features.every((feature) => feature.read_only === true));
  assert.equal(w.logger.requests.length, 0, 'nothing read before the device is added');
});

test('adding the device publishes every state, then only what changed', async (t) => {
  const w = await world(t, { created: true });
  assert.equal(lastValue(w, 'pv_power'), 3210);
  assert.equal(lastValue(w, 'pv1_power'), 1820);
  assert.equal(lastValue(w, 'grid_power'), -350);
  assert.equal(lastValue(w, 'battery_charge_power'), 1650);
  assert.equal(lastValue(w, 'battery_discharge_power'), 0);
  assert.equal(lastValue(w, 'grid_import_total'), 3120.5);
  assert.equal(lastValue(w, 'state'), 'Normal');
  assert.deepEqual(w.fake.widgetRefreshes, ['solar']);
  const count = w.fake.states.length;

  w.logger.setReading({ ...SAMPLE_READINGS.deye_hybrid, loadPower: 1500 });
  await w.hub.refresh();
  assert.equal(w.fake.states.length, count + 1);
  assert.equal(lastValue(w, 'load_power'), 1500);
});

test('an energy index is never published lower than before, nor at 0', async (t) => {
  const w = await world(t, { created: true });
  w.logger.setReading({ ...SAMPLE_READINGS.deye_hybrid, importTotal: 0, productionTotal: 8400 });
  await w.hub.refresh();
  assert.equal(lastValue(w, 'grid_import_total'), 3120.5);
  assert.equal(lastValue(w, 'production_total'), 8421.7);
  w.logger.setReading({ ...SAMPLE_READINGS.deye_hybrid, productionTotal: 8422.3 });
  await w.hub.refresh();
  assert.equal(lastValue(w, 'production_total'), 8422.3);
});

test('a logger that stops answering: offline after a few reads, back on its own', async (t) => {
  const w = await world(t, { created: true });
  w.logger.silent = true;
  for (let i = 1; i < OFFLINE_AFTER; i += 1) {
    const result = await w.hub.refresh();
    assert.deepEqual(result, { ok: false, problem: 'timeout' });
  }
  assert.equal(lastValue(w, 'state'), 'Normal', 'one missed read is not an outage');
  await w.hub.refresh();
  assert.equal(lastValue(w, 'state'), 'Not answering');
  assert.equal(lastValue(w, 'pv_power'), 0);
  assert.equal(lastValue(w, 'pv2_power'), 0);
  assert.equal(lastValue(w, 'battery_level'), 78, 'the other values are kept');
  assert.equal(w.fake.connectionStatus.connected, false);

  w.logger.silent = false;
  await w.hub.refresh();
  assert.equal(lastValue(w, 'state'), 'Normal');
  assert.equal(lastValue(w, 'pv_power'), 3210);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('triggers: battery full and below a step, fault, export started and stopped', async (t) => {
  const w = await world(t, { created: true, config: { export_threshold: 200 } });
  const base = SAMPLE_READINGS.deye_hybrid;
  const step = async (changes) => {
    w.logger.setReading({ ...base, ...changes });
    await w.hub.refresh();
  };
  assert.deepEqual(w.fake.sceneEvents, [], 'nothing on the first reading');

  await step({ batteryLevel: 100 });
  await step({ batteryLevel: 99 });
  await step({ batteryLevel: 100 }); // not re-armed: 99 % is not 95 %
  await step({ batteryLevel: 19 }); // through 50, 40, 30, 25 and 20
  await step({ batteryLevel: 21 });
  await step({ batteryLevel: 20 }); // 20 not re-armed at 21
  await step({ batteryLevel: 26 });
  await step({ batteryLevel: 19 }); // 20 again; 25 is not re-armed below 30
  await step({ state: 4 });
  await step({ state: 4 });
  await step({ state: 2, gridPower: -50 });
  await step({ gridPower: -150 }); // between 100 and 200: unchanged
  await step({ gridPower: -900 });
  await step({ gridPower: -120 });
  await step({ gridPower: 300 });

  assert.deepEqual(
    w.fake.sceneEvents.map(({ key, data }) => [
      key,
      data.threshold ?? data.state ?? data.power ?? data.battery_level,
    ]),
    [
      ['battery_full', 100],
      ['battery_below', '20'],
      ['battery_below', '25'],
      ['battery_below', '30'],
      ['battery_below', '40'],
      ['battery_below', '50'],
      ['battery_below', '20'],
      ['inverter_fault', 'fault'],
      ['grid_export_stopped', 50], // the sample reading exports 350 W
      ['grid_export_started', 900],
      ['grid_export_stopped', -300],
    ],
  );
});

test('the test action reads now and reports, or explains the failure', async (t) => {
  const w = await world(t, { config: { language: 'fr' } });
  const ok = await w.fake.action('test_connection', {});
  assert.match(ok.data.message, /^Connexion OK\. Solaire 3\s210 W, maison 1\s210 W/);
  w.logger.silent = true;
  const failed = await w.fake.action('test_connection', {});
  assert.match(failed.data.message, /mauvais numéro de série/);
});

test('without IP address or serial number: nothing published, the configuration asked', async (t) => {
  const w = await world(t, { config: { serial: '' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /serial number/);
  const ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message, /serial number/);

  await w.fake.configUpdated({ ...w.fake.config, serial: '1712345678' });
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('the read_status scene action gives a sentence and numbers', async (t) => {
  const w = await world(t, { created: true });
  const ack = await w.fake.sceneAction('read_status', {});
  assert.equal(ack.success, true);
  const outputs = ack.data.outputs;
  assert.match(
    outputs.summary,
    /^Solar 3,210 W, house 1,210 W, battery 78 % \(charging 1,650 W\), grid export 350 W; 12\.4 kWh produced today; state Normal\.$/,
  );
  assert.equal(outputs.online, true);
  assert.equal(outputs.grid_power, -350);
  assert.equal(outputs.battery_level, 78);
});

test('the container reads by its own timer, without any poll from Gladys', async (t) => {
  const w = await world(t, { timers: true, intervalMs: 40 });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(w.logger.requests.length, 0, 'no read before the device is added');
  await createInverter(w);
  const after = w.logger.requests.length;
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(w.logger.requests.length >= after + 4, 'the timer keeps reading');
});

test('a profile without battery publishes no battery feature, a micro its PV inputs', async (t) => {
  const w = await world(t, { profile: 'deye_micro', config: { pv_inputs: '2' }, created: true });
  const keys = w.fake.discoveredDevices[0].features.map((f) => f.external_id.split(':').pop());
  assert.deepEqual(keys, [
    'pv_power',
    'pv1_power',
    'pv2_power',
    'production_today',
    'production_total',
    'inverter_temperature',
    'state',
  ]);
  assert.equal(lastValue(w, 'pv_power'), 612.4);
  assert.equal(lastValue(w, 'pv1_power'), 157);
});
