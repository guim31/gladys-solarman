// -----------------------------------------------------------------------------
// The register maps: every profile decodes the realistic reading of the fake
// logger, and a few raw words are checked by hand (sign conventions, offsets,
// word order), independently of the fake's encoder.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, decode, registersOf } from '../src/profiles.js';
import { SAMPLE_READINGS, encodeReading } from '../tools/fake-logger.mjs';

test('every request stays within 125 registers and the values within the ranges read', () => {
  for (const profile of Object.values(PROFILES)) {
    const read = new Set(registersOf(profile));
    for (const [, count] of profile.ranges) {
      assert.ok(count <= 125, `${profile.key}: ${count} registers in one request`);
    }
    const specs = Object.entries(profile.values).flatMap(([key, spec]) =>
      key === 'strings' ? spec.flatMap((s) => (s.regs ? [s] : [s.voltage, s.current])) : [spec],
    );
    for (const spec of specs) {
      for (const address of spec.regs) {
        assert.ok(read.has(address), `${profile.key}: 0x${address.toString(16)} is not read`);
      }
    }
  }
});

test('every profile decodes the sample reading of the fake logger', () => {
  for (const [key, sample] of Object.entries(SAMPLE_READINGS)) {
    const profile = PROFILES[key];
    const reading = decode(profile, encodeReading(key));
    for (const [field, value] of Object.entries(sample)) {
      if (field === 'state' || field === 'strings' || field === 'stringsVI') {
        continue;
      }
      assert.equal(reading[field], value, `${key}.${field}`);
    }
    assert.equal(reading.state, 'normal', `${key}.state`);
    assert.ok(reading.pvPower > 0, `${key}.pvPower`);
  }
});

const words = (entries) => new Map(entries);

test('Deye single-phase: signed powers, temperature offset, 32-bit totals low word first', () => {
  const reading = decode(
    PROFILES.deye_hybrid,
    words([
      [0x3b, 4],
      [0xa9, 0xfea2], // -350 W: exporting
      [0xbe, 0xf98e], // -1650 W: charging
      [0xb6, 1248], // (1248 - 1000) x 0.1
      [0x5b, 1415],
      [0x60, 0x4911],
      [0x61, 0x0001], // 0x14911 = 84241 -> 8424.1 kWh
      [0xb8, 78],
    ]),
  );
  assert.equal(reading.state, 'fault');
  assert.equal(reading.gridPower, -350);
  assert.equal(reading.batteryPower, -1650);
  assert.equal(reading.batteryTemperature, 24.8);
  assert.equal(reading.inverterTemperature, 41.5);
  assert.equal(reading.productionTotal, 8424.1);
  assert.equal(reading.batteryLevel, 78);
});

test('Deye three-phase: the grid power spans two distant registers', () => {
  const reading = decode(
    PROFILES.deye_hybrid_3p,
    words([
      [0x271, 0x5ee0],
      [0x2b2, 0xffff], // -41248 W as a 32-bit signed value
    ]),
  );
  assert.equal(reading.gridPower, -41248);
  // HV models count the PV and battery powers in tens of watts.
  const pv = [
    [0x2a0, 542],
    [0x2a1, 513],
    [0x2a2, 0],
    [0x2a3, 0],
    [0x24e, 0xffd3],
  ];
  const hv = decode(PROFILES.deye_hybrid_3p_hv, words(pv), 2);
  assert.deepEqual(hv.strings, [5420, 5130]);
  assert.equal(hv.batteryPower, -450);
  assert.deepEqual(decode(PROFILES.deye_hybrid_3p, words(pv), 2).strings, [542, 513]);
});

test('Sofar G3: grid power turned into import +, energies high word first', () => {
  const reading = decode(
    PROFILES.sofar_g3,
    words([
      [0x488, 231], // 2310 W sent to the grid
      [0x684, 0x0000],
      [0x685, 1842], // 18.42 kWh
      [0x404, 5],
    ]),
  );
  assert.equal(reading.gridPower, -2310);
  assert.equal(reading.productionToday, 18.42);
  assert.equal(reading.state, 'fault');
});

test('Solis: input registers, fault codes from 0x1000, PV inputs from voltage and current', () => {
  assert.equal(PROFILES.solis_1p.functionCode, 4);
  const reading = decode(
    PROFILES.solis_1p,
    words([
      [0xbe3, 0x1004],
      [0xbcd, 3124],
      [0xbce, 56],
      [0xbcf, 2981],
      [0xbd0, 56],
    ]),
  );
  assert.equal(reading.state, 'fault');
  assert.deepEqual(reading.strings, [1749, 1669]);
});

test('a battery level out of 0-100 is dropped, unused PV inputs still count in the total', () => {
  const reading = decode(
    PROFILES.deye_hybrid,
    new Map([...encodeReading('deye_hybrid'), [0xb8, 0xffff], [0xbc, 300]]),
    2,
  );
  assert.equal(reading.batteryLevel, undefined);
  assert.deepEqual(reading.strings, [1820, 1390]);
  assert.equal(reading.pvPower, 1820 + 1390 + 300);
});
