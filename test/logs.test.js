// -----------------------------------------------------------------------------
// What the integration writes at the default level (LOG_LEVEL=info): the life
// cycle only. A normal run (readings, states, scene events) writes nothing; a
// logger that stops answering is written once, then once when it is back.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_READINGS } from '../tools/fake-logger.mjs';
import { createWorld } from './helpers/world.js';

/** Every line the SDK logger writes from now on, at the default level. */
function captureLogs(t) {
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  for (const name of ['log', 'info', 'warn', 'error']) {
    t.mock.method(console, name, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

test('a normal run writes nothing at the info level', async (t) => {
  const world = await createWorld({ created: true });
  t.after(() => world.stop());
  const lines = captureLogs(t);
  const sent = world.fake.states.length;
  for (const gridPower of [-900, 400, -1500, 200]) {
    world.logger.setReading({ ...SAMPLE_READINGS.deye_hybrid, gridPower });
    await world.hub.refresh();
  }
  assert.ok(world.fake.states.length > sent, 'states were published');
  assert.ok(world.fake.sceneEvents.length > 0, 'scene events were sent');
  assert.deepEqual(lines, []);
});

test('a logger lost for a whole night is written once, and once when back', async (t) => {
  const world = await createWorld({ created: true });
  t.after(() => world.stop());
  const lines = captureLogs(t);
  world.logger.silent = true;
  for (let i = 0; i < 6; i += 1) {
    await world.hub.refresh();
  }
  world.logger.silent = false;
  await world.hub.refresh();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /not read: No answer from the logger/);
  assert.match(lines[1], /answers again/);
  assert.ok(
    lines.every((line) => !line.includes('1712345678')),
    'no serial number in the logs',
  );
});
