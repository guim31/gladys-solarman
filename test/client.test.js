// -----------------------------------------------------------------------------
// The TCP client against the fake logger: one connection reused, requests in
// turn, the logger's own frames answered, every failure classified.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemOf } from '../src/hub.js';
import { SolarmanClient } from '../src/v5/client.js';
import { FakeLogger } from '../tools/fake-logger.mjs';

const SERIAL = 1712345678;

async function setup(t, options = {}) {
  const logger = await new FakeLogger({ serial: SERIAL, ...options }).start();
  const client = new SolarmanClient({
    host: '127.0.0.1',
    port: logger.port,
    serial: SERIAL,
    timeoutMs: 300,
    ...options.client,
  });
  t.after(async () => {
    client.close();
    await logger.stop();
  });
  return { logger, client };
}

test('concurrent reads share one connection and are sent one after the other', async (t) => {
  const { logger, client } = await setup(t);
  logger.heartbeatFirst = true;
  logger.doubleCrc = true;
  const [a, b] = await Promise.all([
    client.readRegisters(3, 0xb8, 1),
    client.readRegisters(3, 0x6b, 2),
  ]);
  assert.deepEqual(a, [78]);
  assert.deepEqual(b, [0, 124]); // 12.4 kWh today at 0x6c
  assert.equal(logger.connections, 1);
  assert.deepEqual(
    logger.requests.map((r) => r.start),
    [0xb8, 0x6b],
  );
});

test('a wrong serial number gets no answer: timeout, then the next read reconnects', async (t) => {
  const { logger, client } = await setup(t, { client: { serial: SERIAL + 1 } });
  await assert.rejects(client.readRegisters(3, 0xb8, 1), (err) => problemOf(err) === 'timeout');
  client.serial = SERIAL;
  assert.deepEqual(await client.readRegisters(3, 0xb8, 1), [78]);
  assert.equal(logger.connections, 2);
});

test('a wrong Modbus address: the logger answers, not the inverter', async (t) => {
  const { client } = await setup(t, { client: { slaveId: 2 } });
  await assert.rejects(client.readRegisters(3, 0xb8, 1), (err) => problemOf(err) === 'no-answer');
});

test('a refused range is a Modbus exception', async (t) => {
  const { logger, client } = await setup(t);
  logger.refused.add(0xb8);
  await assert.rejects(client.readRegisters(3, 0xb8, 1), (err) => problemOf(err) === 'modbus');
});

test('a dropped connection is reopened on the next read', async (t) => {
  const { logger, client } = await setup(t);
  await client.readRegisters(3, 0xb8, 1);
  logger.dropConnections();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await client.readRegisters(3, 0xb8, 1), [78]);
  assert.equal(logger.connections, 2);
});

test('nobody listening: a connection problem', async () => {
  const logger = await new FakeLogger({ serial: SERIAL }).start();
  const port = logger.port;
  await logger.stop();
  const client = new SolarmanClient({ host: '127.0.0.1', port, serial: SERIAL, timeoutMs: 300 });
  await assert.rejects(client.readRegisters(3, 0xb8, 1), (err) => problemOf(err) === 'connect');
  client.close();
});

test('close() while connecting leaves no connection open on the logger', async (t) => {
  const { logger, client } = await setup(t);
  const read = client.readRegisters(3, 0xb8, 1);
  await new Promise((resolve) => setImmediate(resolve)); // the TCP connection is being opened
  client.close();
  await assert.rejects(read, (err) => problemOf(err) === 'connect');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(logger.sockets.size, 0);
  assert.equal(logger.requests.length, 0);
});
