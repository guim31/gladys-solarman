// -----------------------------------------------------------------------------
// Real Solarman V5 exchanges, published in pysolarmanv5 issue #62 ("double
// CRC", a Deye inverter behind an LSW-3 logger): a read of the 54 holding
// registers from 0x3b and its answer, whose Modbus frame carries the CRC
// twice. Anonymized: the logger serial number (bytes 7-10) is replaced by
// SERIAL and the V5 checksum computed again; the Modbus payload is untouched.
// -----------------------------------------------------------------------------

import { checksum } from '../../src/v5/frame.js';

export const SERIAL = 1712345678;

function anonymize(hex) {
  const frame = Buffer.from(hex.replace(/\s+/g, ''), 'hex');
  frame.writeUInt32LE(SERIAL, 7);
  frame[frame.length - 2] = checksum(frame.subarray(1, frame.length - 2));
  return frame;
}

export const DEYE_REQUEST = anonymize(
  'a5 17 00 10 45 28 00 b2 6e 3c 6a 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 03 00 3b 00 36 b4 11 96 15',
);

export const DEYE_RESPONSE = anonymize(
  'a5 81 00 10 15 28 e6 b2 6e 3c 6a 02 01 4f 84 ef 00 c7 1b 00 00 af f0 b7 65 01 03 6c 00 02 00 e2 00 00 00 00 c5 01 00 03 ' +
    '00 00 00 00 00 00 00 00 00 00 10 2e 10 18 10 4f 09 58 09 4b 09 6b 00 1e 00 1e 00 1e 13 89 51 d2 00 00 53 3d 00 00 ' +
    '51 de 00 00 99 dd 00 00 00 0c 00 00 05 bd 05 bd 05 bd 03 e7 00 00 00 00 00 00 00 00 00 10 00 00 00 00 00 00 00 00 ' +
    '00 00 00 00 00 00 00 00 00 00 00 00 12 92 00 16 12 ed 00 15 eb 4e 00 00 88 15',
);
