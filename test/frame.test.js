// -----------------------------------------------------------------------------
// The V5 envelope and the Modbus RTU frame inside, against a real exchange
// (test/fixtures/captures.js) and the corner cases the loggers produce.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, decode } from '../src/profiles.js';
import {
  ModbusException,
  V5Error,
  crc16,
  decodeResponse,
  encodeRequest,
  encodeResponse,
  encodeTimeResponse,
  parseReadResponse,
  readRequest,
  splitFrames,
} from '../src/v5/frame.js';
import { heartbeat } from '../tools/fake-logger.mjs';
import { DEYE_REQUEST, DEYE_RESPONSE, SERIAL } from './fixtures/captures.js';

test('a read request is byte for byte the one pysolarmanv5 sent', () => {
  assert.deepEqual(encodeRequest(SERIAL, 0x28, readRequest(1, 3, 0x3b, 0x36)), DEYE_REQUEST);
});

test('the real Deye answer decodes, its doubled CRC included', () => {
  const rtu = decodeResponse(DEYE_RESPONSE, { serial: SERIAL, sequence: 0x28 });
  const words = parseReadResponse(rtu, { slaveId: 1, functionCode: 3, count: 0x36 });
  assert.equal(words.length, 0x36);
  // Deye layout shared by the string and micro inverters from 0x3b.
  const reading = decode(PROFILES.deye_micro, new Map(words.map((w, i) => [0x3b + i, w])));
  assert.equal(reading.state, 'normal');
  assert.equal(reading.productionToday, 22.6);
  assert.equal(reading.productionTotal, 24704.1);
});

test('a response for another sequence, serial or with a bad checksum is refused', () => {
  assert.throws(
    () => decodeResponse(DEYE_RESPONSE, { serial: SERIAL, sequence: 0x29 }),
    (err) => err instanceof V5Error && err.code === 'sequence',
  );
  assert.throws(
    () => decodeResponse(DEYE_RESPONSE, { serial: SERIAL + 1, sequence: 0x28 }),
    (err) => err.code === 'serial',
  );
  const broken = Buffer.from(DEYE_RESPONSE);
  broken[40] ^= 0xff;
  assert.throws(
    () => decodeResponse(broken, { serial: SERIAL, sequence: 0x28 }),
    (err) => err.code === 'frame',
  );
});

test('a bare answer means the inverter did not reply behind the logger', () => {
  const frame = encodeResponse(SERIAL, 7, Buffer.alloc(0));
  assert.throws(
    () => decodeResponse(frame, { serial: SERIAL, sequence: 7 }),
    (err) => err.code === 'no-answer',
  );
});

test('a Modbus exception and a wrong CRC are told apart', () => {
  const body = Buffer.from([1, 0x83, 2]);
  assert.throws(
    () =>
      parseReadResponse(Buffer.concat([body, crc16(body)]), {
        slaveId: 1,
        functionCode: 3,
        count: 2,
      }),
    (err) => err instanceof ModbusException && err.exceptionCode === 2,
  );
  const ok = Buffer.from([1, 3, 4, 0, 1, 0, 2]);
  assert.deepEqual(
    parseReadResponse(Buffer.concat([ok, crc16(ok)]), { slaveId: 1, functionCode: 3, count: 2 }),
    [1, 2],
  );
  assert.throws(
    () =>
      parseReadResponse(Buffer.concat([ok, Buffer.from([0, 0])]), {
        slaveId: 1,
        functionCode: 3,
        count: 2,
      }),
    /CRC/,
  );
});

test('frames are cut out of a stream: glued, split, after garbage', () => {
  const beat = heartbeat(SERIAL);
  const stream = Buffer.concat([Buffer.from([0x00, 0x15]), beat, DEYE_RESPONSE]);
  const first = splitFrames(stream.subarray(0, 30));
  assert.equal(first.frames.length, 1);
  assert.deepEqual(first.frames[0], beat);
  const second = splitFrames(Buffer.concat([first.rest, stream.subarray(30)]));
  assert.deepEqual(second.frames, [DEYE_RESPONSE]);
  assert.equal(second.rest.length, 0);
});

test('a heartbeat is answered with the matching response code', () => {
  const answer = encodeTimeResponse(heartbeat(SERIAL));
  assert.equal(answer[4], 0x17);
  assert.equal(answer.readUInt32LE(7), SERIAL);
  assert.equal(splitFrames(answer).frames.length, 1);
});
