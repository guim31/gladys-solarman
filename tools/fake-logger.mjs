// -----------------------------------------------------------------------------
// A fake Solarman V5 logger: a TCP server that answers V5 requests with the
// registers of an inverter, for the tests and for the Docker check.
//
//   node tools/fake-logger.mjs [profile] [port] [serial]
//     e.g. node tools/fake-logger.mjs deye_hybrid 8899 1712345678
//
// It behaves like the LSW-3 loggers seen in pysolarmanv5 and ha-solarman
// issues: no answer at all to a wrong serial number, a bare payload when the
// inverter does not answer (wrong Modbus address), Modbus exception 2 for a
// register range the model does not have, optionally the doubled CRC of some
// Deye firmwares and a heartbeat frame of its own before an answer.
// -----------------------------------------------------------------------------

import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { PROFILES } from '../src/profiles.js';
import {
  CONTROL,
  START,
  END,
  checksum,
  crc16,
  encodeResponse,
  splitFrames,
} from '../src/v5/frame.js';

/**
 * A realistic reading per profile (a sunny spring noon), in the units of
 * src/profiles.js. Micro and Solis inputs are given as [volts, amperes].
 */
export const SAMPLE_READINGS = {
  deye_hybrid: {
    state: 2,
    productionToday: 12.4,
    productionTotal: 8421.7,
    importToday: 1.3,
    exportToday: 2.8,
    importTotal: 3120.5,
    exportTotal: 2650.2,
    loadToday: 9.6,
    batteryChargeTotal: 1530.4,
    batteryDischargeTotal: 1402.9,
    inverterTemperature: 41.5,
    gridPower: -350,
    loadPower: 1210,
    batteryTemperature: 24.8,
    batteryLevel: 78,
    batteryPower: -1650,
    strings: [1820, 1390],
  },
  deye_hybrid_3p: {
    state: 2,
    batteryChargeTotal: 2240.1,
    batteryDischargeTotal: 2105.6,
    importToday: 3.1,
    exportToday: 6.4,
    importTotal: 5012.3,
    exportTotal: 4410.8,
    loadToday: 18.2,
    productionToday: 27.5,
    productionTotal: 15302.4,
    inverterTemperature: 47.2,
    batteryTemperature: 22.1,
    batteryLevel: 64,
    batteryPower: 820,
    gridPower: 1240,
    loadPower: 4380,
    strings: [2210, 1980, 0, 0],
  },
  deye_hybrid_3p_hv: {
    state: 2,
    batteryChargeTotal: 4210.5,
    batteryDischargeTotal: 3988.2,
    importToday: 2.2,
    exportToday: 21.7,
    importTotal: 6521.4,
    exportTotal: 9876.5,
    loadToday: 24.9,
    productionToday: 61.3,
    productionTotal: 30412.9,
    inverterTemperature: 52.4,
    batteryTemperature: 26.3,
    batteryLevel: 91,
    batteryPower: -4500,
    gridPower: -6200,
    loadPower: 3150,
    strings: [5420, 5130, 3980, 0],
  },
  deye_micro: {
    state: 2,
    productionToday: 2.1,
    productionTotal: 1387.6,
    pvPower: 612.4,
    inverterTemperature: 38.5,
    stringsVI: [
      [34.2, 4.6],
      [33.9, 4.4],
      [0, 0],
      [0, 0],
    ],
  },
  sofar_g3: {
    state: 2,
    inverterTemperature: 44,
    gridPower: -2310,
    loadPower: 870,
    strings: [1650, 1540],
    productionToday: 18.42,
    productionTotal: 11034.5,
    importToday: 0.85,
    importTotal: 1842.3,
    exportToday: 11.37,
    exportTotal: 7712.6,
  },
  solis_1p: {
    pvPower: 3420,
    productionTotal: 9876,
    productionToday: 14.2,
    inverterTemperature: 46.3,
    state: 3,
    stringsVI: [
      [312.4, 5.6],
      [298.1, 5.6],
    ],
  },
};

function encodeValue(spec, value, words) {
  let raw = Math.round(value / spec.scale + spec.offset);
  const bits = 16 * spec.regs.length;
  if (raw < 0) {
    raw += 2 ** bits;
  }
  spec.regs.forEach((address, index) => {
    words.set(address, Math.floor(raw / 2 ** (16 * index)) & 0xffff);
  });
}

/** The register words of a reading: the inverse of decode() in src/profiles.js. */
export function encodeReading(profileKey, reading = SAMPLE_READINGS[profileKey]) {
  const profile = PROFILES[profileKey];
  const words = new Map();
  for (const [start, count] of profile.ranges) {
    for (let address = start; address < start + count; address += 1) {
      words.set(address, 0);
    }
  }
  for (const [key, spec] of Object.entries(profile.values)) {
    if (key === 'strings') {
      spec.forEach((input, index) => {
        if (input.regs) {
          encodeValue(input, reading.strings?.[index] ?? 0, words);
        } else {
          const [volts, amperes] = reading.stringsVI?.[index] ?? [0, 0];
          encodeValue(input.voltage, volts, words);
          encodeValue(input.current, amperes, words);
        }
      });
    } else if (reading[key] !== undefined) {
      encodeValue(spec, reading[key], words);
    }
  }
  return words;
}

export class FakeLogger {
  /**
   * @param {object} options
   * @param {string} [options.profile] profile key (register map, function code)
   * @param {number} [options.serial] logger serial number
   * @param {number} [options.slaveId] Modbus address of the inverter behind it
   * @param {Map<number, number>} [options.words] register words (default: SAMPLE_READINGS)
   */
  constructor({ profile = 'deye_hybrid', serial = 1712345678, slaveId = 1, words } = {}) {
    this.profile = PROFILES[profile];
    this.serial = serial;
    this.slaveId = slaveId;
    this.words = words ?? encodeReading(profile);
    this.server = null;
    this.sockets = new Set();
    this.requests = [];
    this.connections = 0;
    // Behaviors a test may switch at any time.
    this.silent = false; // never answers (asleep, or a wrong serial number)
    this.doubleCrc = false;
    this.heartbeatFirst = false;
    this.refused = new Set(); // start addresses answered with exception 2
  }

  /** Changes register values: `set(address, word)` or a whole map. */
  set(address, word) {
    this.words.set(address, word & 0xffff);
  }

  setReading(reading) {
    for (const [address, word] of encodeReading(this.profile.key, reading)) {
      this.words.set(address, word);
    }
  }

  start(port = 0, host = '127.0.0.1') {
    this.server = net.createServer((socket) => this.#serve(socket));
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.port = this.server.address().port;
        resolve(this);
      });
    });
  }

  async stop() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
  }

  /** Cuts every open connection, as a logger restarting would. */
  dropConnections() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
  }

  #serve(socket) {
    this.connections += 1;
    this.sockets.add(socket);
    let buffer = Buffer.alloc(0);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      const { frames, rest } = splitFrames(Buffer.concat([buffer, chunk]));
      buffer = rest;
      for (const frame of frames) {
        this.#answer(socket, frame);
      }
    });
  }

  #answer(socket, frame) {
    if (frame[4] !== CONTROL.REQUEST) {
      return; // our answers to the heartbeats, and anything else
    }
    const serial = frame.readUInt32LE(7);
    const sequence = frame.readUInt16LE(5);
    const rtu = frame.subarray(26, frame.length - 2);
    const [slaveId, functionCode] = rtu;
    const start = rtu.readUInt16BE(2);
    const count = rtu.readUInt16BE(4);
    this.requests.push({ serial, slaveId, functionCode, start, count });
    if (this.silent || serial !== this.serial) {
      return;
    }
    if (this.heartbeatFirst) {
      socket.write(heartbeat(this.serial));
    }
    let answer;
    if (slaveId !== this.slaveId) {
      answer = Buffer.alloc(0); // the logger answers, the inverter does not
    } else if (functionCode !== this.profile.functionCode || this.refused.has(start)) {
      const body = Buffer.from([slaveId, functionCode | 0x80, 0x02]);
      answer = Buffer.concat([body, crc16(body)]);
    } else {
      const body = Buffer.alloc(3 + count * 2);
      body[0] = slaveId;
      body[1] = functionCode;
      body[2] = count * 2;
      for (let i = 0; i < count; i += 1) {
        body.writeUInt16BE(this.words.get(start + i) ?? 0, 3 + i * 2);
      }
      answer = Buffer.concat([
        body,
        crc16(body),
        this.doubleCrc ? Buffer.alloc(2) : Buffer.alloc(0),
      ]);
    }
    // Second sequence byte: the logger's own counter.
    socket.write(encodeResponse(this.serial, (sequence & 0xff) | 0x2a00, answer));
  }
}

/** A heartbeat frame (control 0x4710) as a logger sends it unprompted. */
export function heartbeat(serial) {
  const frame = Buffer.alloc(14);
  frame[0] = START;
  frame.writeUInt16LE(1, 1);
  frame[3] = 0x10;
  frame[4] = CONTROL.HEARTBEAT;
  frame.writeUInt16LE(0x0101, 5);
  frame.writeUInt32LE(serial, 7);
  frame[11] = 0x00;
  frame[12] = checksum(frame.subarray(1, 12));
  frame[13] = END;
  return frame;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [profile = 'deye_hybrid', port = '8899', serial = '1712345678'] = process.argv.slice(2);
  const logger = new FakeLogger({ profile, serial: Number(serial) });
  await logger.start(Number(port), '0.0.0.0');
  console.log(`Fake Solarman logger ${serial} (${profile}) listening on port ${logger.port}`);
  const stop = () => logger.stop().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
