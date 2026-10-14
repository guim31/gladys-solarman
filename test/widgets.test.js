// -----------------------------------------------------------------------------
// The `solar` widget: valid for the core (SDK validator: budget, sizes), in
// every state (not configured, not added, live, offline), its bound features
// existing on the device.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { OFFLINE_AFTER } from '../src/hub.js';
import { PROFILES } from '../src/profiles.js';
import { createWorld } from './helpers/world.js';

async function content(world, language = 'en') {
  const ack = await world.fake.widgetGet('solar', { settings: {}, language });
  assert.equal(ack.success, true);
  return ack.data.content;
}

function check(world, widget, where) {
  assert.deepEqual(validateWidgetContent(widget), [], where);
  const ids = new Set(
    (world.fake.discoveredDevices[0]?.features ?? []).map((feature) => feature.external_id),
  );
  for (const component of widget.components) {
    if (component.device_feature) {
      assert.ok(ids.has(component.device_feature), `${where}: ${component.device_feature}`);
    }
  }
}

for (const profile of Object.keys(PROFILES)) {
  test(`the solar widget of a ${profile} is valid, before and after adding it, and offline`, async (t) => {
    const world = await createWorld({ profile, config: { pv_inputs: 4 } });
    t.after(() => world.stop());
    for (const language of LANGUAGES) {
      check(world, await content(world, language), `${profile} not added (${language})`);
    }
    const before = await content(world);
    assert.match(before.components.at(-1).text, /Discovery tab/);

    await world.fake.deviceCreated(world.fake.discoveredDevices[0]);
    await world.hub.inFlight;
    const live = await content(world, 'fr');
    check(world, live, `${profile} live`);
    assert.equal(live.components[0].device_feature, world.ids().feature('pv_power'));

    world.logger.silent = true;
    for (let i = 0; i < OFFLINE_AFTER; i += 1) {
      await world.hub.refresh();
    }
    const offline = await content(world);
    check(world, offline, `${profile} offline`);
    assert.match(offline.components.at(-1).text, /not answering/);
  });
}

test('the widget asks for the configuration first', async (t) => {
  const world = await createWorld({ config: { host: '' } });
  t.after(() => world.stop());
  const widget = await content(world, 'de');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.match(widget.components[0].text, /Konfiguriere/);
});

test('the grid and battery tiles say which way the power flows', async (t) => {
  const world = await createWorld({ created: true });
  t.after(() => world.stop());
  const labels = (await content(world)).components.map((c) => `${c.label}:${c.value ?? 'live'}`);
  assert.ok(labels.includes('Grid export:350'));
  assert.ok(labels.includes('Charging:1650'));
});
