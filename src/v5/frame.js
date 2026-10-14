// -----------------------------------------------------------------------------
// Solarman V5 frames: the envelope a Solarman Wi-Fi logger (LSW-3 and
// friends) wraps around Modbus RTU on its TCP port 8899.
//
// Layout (all V5 fields little-endian, the Modbus frame big-endian), after
// pysolarmanv5 (MIT, Jonathan McCrohan), docs/solarmanv5_protocol.rst:
//
//   A5 | length (2) | control (2) | sequence (2) | logger serial (4)   header
//   request payload:  02 | 0000 | 00000000 x3 | Modbus RTU frame       (15 + n)
//   response payload: 02 | status | 3 x uint32 | Modbus RTU frame      (14 + n)
//   checksum (sum of every byte but the first and the last two) | 15
//
// `length` is the payload length. A request is control 0x4510, its answer
// 0x1510. The logger also sends frames of its own on the same socket
// (heartbeat 0x4710, data 0x4210...), answered with a time frame.
// -----------------------------------------------------------------------------

export const START = 0xa5;
export const END = 0x15;
export const CONTROL = {
  HANDSHAKE: 0x41,
  DATA: 0x42,
  INFO: 0x43,
  REQUEST: 0x45,
  RESPONSE: 0x15,
  HEARTBEAT: 0x47,
  REPORT: 0x48,
};
const HEADER_LENGTH = 11;
const RESPONSE_PAYLOAD_PREFIX = 14;
// header + checksum + end: a frame is this plus its payload length.
const ENVELOPE = 13;

export class V5Error extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'V5Error';
    this.code = code;
  }
}

/** A Modbus exception answered by the inverter (function code | 0x80). */
export class ModbusException extends Error {
  constructor(exceptionCode) {
    super(`Modbus exception ${exceptionCode}`);
    this.name = 'ModbusException';
    this.exceptionCode = exceptionCode;
  }
}

/** Sum of the bytes, modulo 256. */
export function checksum(bytes) {
  let sum = 0;
  for (const byte of bytes) {
    sum = (sum + byte) & 0xff;
  }
  return sum;
}

/** Modbus RTU CRC-16 (polynomial 0xA001), returned as the two bytes sent: low, high. */
export function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return Buffer.from([crc & 0xff, crc >>> 8]);
}

/** A Modbus RTU read request (function 3: holding, 4: input registers). */
export function readRequest(slaveId, functionCode, start, count) {
  const body = Buffer.from([
    slaveId,
    functionCode,
    start >>> 8,
    start & 0xff,
    count >>> 8,
    count & 0xff,
  ]);
  return Buffer.concat([body, crc16(body)]);
}

/** Header + payload + trailer, with the length and checksum filled in. */
function envelope(control, sequence, serial, payload) {
  const frame = Buffer.alloc(HEADER_LENGTH + payload.length + 2);
  frame[0] = START;
  frame.writeUInt16LE(payload.length, 1);
  frame[3] = 0x10;
  frame[4] = control;
  frame.writeUInt16LE(sequence & 0xffff, 5);
  frame.writeUInt32LE(serial >>> 0, 7);
  payload.copy(frame, HEADER_LENGTH);
  frame[frame.length - 2] = checksum(frame.subarray(1, frame.length - 2));
  frame[frame.length - 1] = END;
  return frame;
}

/** The V5 request frame carrying a Modbus RTU frame. */
export function encodeRequest(serial, sequence, modbusFrame) {
  const payload = Buffer.concat([Buffer.from([0x02]), Buffer.alloc(14), modbusFrame]);
  return envelope(CONTROL.REQUEST, sequence & 0xff, serial, payload);
}

/** The V5 response frame (what a logger answers), for the fake logger and the tests. */
export function encodeResponse(serial, sequence, modbusFrame, { now = Date.now() } = {}) {
  const prefix = Buffer.alloc(RESPONSE_PAYLOAD_PREFIX);
  prefix[0] = 0x02;
  prefix[1] = 0x01;
  prefix.writeUInt32LE(3600, 2); // total working time
  prefix.writeUInt32LE(600, 6); // power-on time
  prefix.writeUInt32LE(Math.max(0, Math.floor(now / 1000) - 3600), 10); // offset time
  return envelope(CONTROL.RESPONSE, sequence, serial, Buffer.concat([prefix, modbusFrame]));
}

/**
 * The answer to a frame the logger sends on its own (heartbeat, data...):
 * the response code with the time, as pysolarmanv5 does, so the logger keeps
 * the socket open.
 */
export function encodeTimeResponse(frame) {
  const payload = Buffer.alloc(10);
  payload.writeUInt16LE(0x0100, 0);
  payload.writeUInt32LE(Math.floor(Date.now() / 1000), 2);
  const sequence = ((frame[5] + 1) & 0xff) | (frame[6] << 8);
  return envelope(frame[4] - 0x30, sequence, frame.readUInt32LE(7), payload);
}

/**
 * Cuts complete frames out of a receive buffer. Bytes before a start byte
 * are dropped (garbage, half frames after a reconnection).
 * @returns {{ frames: Buffer[], rest: Buffer }}
 */
export function splitFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(START, offset);
    if (start < 0) {
      return { frames, rest: Buffer.alloc(0) };
    }
    if (buffer.length - start < 3) {
      return { frames, rest: buffer.subarray(start) };
    }
    const total = ENVELOPE + buffer.readUInt16LE(start + 1);
    if (buffer.length - start < total) {
      return { frames, rest: buffer.subarray(start) };
    }
    const frame = buffer.subarray(start, start + total);
    if (frame[total - 1] !== END) {
      // Not a frame boundary: look for the next start byte.
      offset = start + 1;
      continue;
    }
    frames.push(frame);
    offset = start + total;
  }
  return { frames, rest: Buffer.alloc(0) };
}

/**
 * Checks a response frame and returns the Modbus RTU frame inside.
 * @param {Buffer} frame a complete V5 frame
 * @param {{ serial: number, sequence: number }} expected
 */
export function decodeResponse(frame, { serial, sequence }) {
  if (frame[0] !== START || frame[frame.length - 1] !== END) {
    throw new V5Error('Invalid V5 start or end byte', 'frame');
  }
  if (frame[frame.length - 2] !== checksum(frame.subarray(1, frame.length - 2))) {
    throw new V5Error('Invalid V5 checksum', 'frame');
  }
  if (frame[4] !== CONTROL.RESPONSE) {
    throw new V5Error(`Unexpected V5 control code 0x${frame[4].toString(16)}`, 'frame');
  }
  if (frame[5] !== (sequence & 0xff)) {
    throw new V5Error('V5 sequence number mismatch', 'sequence');
  }
  if (frame.readUInt32LE(7) !== serial >>> 0) {
    throw new V5Error('V5 logger serial number mismatch', 'serial');
  }
  if (frame[HEADER_LENGTH] !== 0x02) {
    throw new V5Error('V5 frame type is not an inverter answer', 'frame');
  }
  const modbus = frame.subarray(HEADER_LENGTH + RESPONSE_PAYLOAD_PREFIX, frame.length - 2);
  if (modbus.length < 5) {
    // The logger answers a bare payload when the inverter did not reply
    // (wrong slave id, inverter asleep).
    throw new V5Error('The inverter did not answer the logger', 'no-answer');
  }
  return modbus;
}

/**
 * The register values of a Modbus RTU read response.
 * Some Deye loggers append the CRC twice (two extra 0x00 bytes): tolerated.
 * @returns {number[]} unsigned 16-bit words
 */
export function parseReadResponse(rtu, { slaveId, functionCode, count }) {
  if (rtu[1] === (functionCode | 0x80)) {
    throw new ModbusException(rtu[2]);
  }
  if (rtu[0] !== slaveId || rtu[1] !== functionCode) {
    throw new V5Error('Modbus answer for another request', 'frame');
  }
  const byteCount = rtu[2];
  if (byteCount !== count * 2 || rtu.length < 3 + byteCount + 2) {
    throw new V5Error('Modbus answer of an unexpected length', 'frame');
  }
  const body = rtu.subarray(0, 3 + byteCount);
  if (!crc16(body).equals(rtu.subarray(3 + byteCount, 5 + byteCount))) {
    throw new V5Error('Invalid Modbus CRC', 'frame');
  }
  const words = [];
  for (let i = 0; i < count; i += 1) {
    words.push(rtu.readUInt16BE(3 + i * 2));
  }
  return words;
}
