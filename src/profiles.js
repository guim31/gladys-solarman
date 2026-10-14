// -----------------------------------------------------------------------------
// Register maps of the supported inverters, and their decoding into one
// reading shape shared by every profile.
//
// Facts taken from the YAML inverter definitions of davidrapan/ha-solarman
// (MIT, David Rapan and contributors), themselves from the manufacturers'
// Modbus documents: Deye Modbus protocol V118 (single-phase hybrid), Deye
// MODBUS RTU V105.1 / V104.3 (three-phase hybrids SG04LP3 / SG01HP3), Deye
// microinverters, Sofar G3 protocol V1.22, Solis 1P-5G (tested by its
// contributors). Only what the integration reads is kept here.
//
// Conventions of a reading (every field may be missing):
//   powers in W; grid power positive when importing, negative when exporting;
//   battery power positive when discharging, negative when charging;
//   energies in kWh; temperatures in °C; state among STATES.
// A 32-bit value is two registers, low word first (`[low, high]`), the order
// ha-solarman writes them.
// -----------------------------------------------------------------------------

export const STATES = ['standby', 'starting', 'normal', 'alarm', 'fault'];

const u16 = (address, scale = 1, offset = 0) => ({ regs: [address], scale, offset });
const s16 = (address, scale = 1, offset = 0) => ({ regs: [address], signed: true, scale, offset });
const u32 = (low, high, scale = 1) => ({ regs: [low, high], scale, offset: 0 });
const s32 = (low, high, scale = 1) => ({ regs: [low, high], signed: true, scale, offset: 0 });

/** Deye "running state" register: 0 standby, 1 self-test, 2 normal, 3 alarm, 4 fault. */
const DEYE_STATE = (code) => ['standby', 'starting', 'normal', 'alarm', 'fault'][code] ?? null;

const deyeSinglePhaseHybrid = {
  key: 'deye_hybrid',
  functionCode: 3,
  ranges: [
    [0x003b, 0x3a], // 0x3b-0x74: state, energies, temperatures
    [0x00a6, 0x1a], // 0xa6-0xbf: grid, load, battery, PV powers
  ],
  maxStrings: 4,
  battery: true,
  values: {
    state: u16(0x003b),
    productionToday: u16(0x006c, 0.1),
    productionTotal: u32(0x0060, 0x0061, 0.1),
    importToday: u16(0x004c, 0.1),
    exportToday: u16(0x004d, 0.1),
    importTotal: u32(0x004e, 0x0050, 0.1),
    exportTotal: u32(0x0051, 0x0052, 0.1),
    loadToday: u16(0x0054, 0.1),
    batteryChargeTotal: u32(0x0048, 0x0049, 0.1),
    batteryDischargeTotal: u32(0x004a, 0x004b, 0.1),
    inverterTemperature: s16(0x005b, 0.1, 1000),
    gridPower: s16(0x00a9),
    loadPower: s16(0x00b2),
    batteryTemperature: u16(0x00b6, 0.1, 1000),
    batteryLevel: u16(0x00b8),
    batteryPower: s16(0x00be),
    strings: [u16(0x00ba), u16(0x00bb), u16(0x00bc), u16(0x00bd)],
  },
  decodeState: DEYE_STATE,
};

const deyeThreePhaseHybrid = {
  key: 'deye_hybrid_3p',
  functionCode: 3,
  ranges: [
    [0x01f4, 0x3b], // 0x1f4-0x22e: state, energies, temperature, alarms
    [0x024a, 0x4a], // 0x24a-0x293: battery, grid, load
    [0x02a0, 0x17], // 0x2a0-0x2b6: PV powers, high words of the grid and load powers
  ],
  maxStrings: 4,
  battery: true,
  values: {
    state: u16(0x01f4),
    batteryChargeTotal: u32(0x0204, 0x0205, 0.1),
    batteryDischargeTotal: u32(0x0206, 0x0207, 0.1),
    importToday: u16(0x0208, 0.1),
    exportToday: u16(0x0209, 0.1),
    importTotal: u32(0x020a, 0x020b, 0.1),
    exportTotal: u32(0x020c, 0x020d, 0.1),
    loadToday: u16(0x020e, 0.1),
    productionToday: u16(0x0211, 0.1),
    productionTotal: u32(0x0216, 0x0217, 0.1),
    inverterTemperature: s16(0x021d, 0.1, 1000),
    batteryTemperature: u16(0x024a, 0.1, 1000),
    batteryLevel: u16(0x024c),
    batteryPower: s16(0x024e),
    gridPower: s32(0x0271, 0x02b2),
    loadPower: s32(0x028d, 0x0293),
    strings: [u16(0x02a0), u16(0x02a1), u16(0x02a2), u16(0x02a3)],
  },
  decodeState: DEYE_STATE,
};

// The high-voltage three-phase hybrids (SG01HP3) count the PV and battery
// powers in tens of watts (ha-solarman `mod` 1).
const deyeThreePhaseHybridHv = {
  ...deyeThreePhaseHybrid,
  key: 'deye_hybrid_3p_hv',
  values: {
    ...deyeThreePhaseHybrid.values,
    batteryPower: s16(0x024e, 10),
    strings: [u16(0x02a0, 10), u16(0x02a1, 10), u16(0x02a2, 10), u16(0x02a3, 10)],
  },
};

const deyeMicro = {
  key: 'deye_micro',
  functionCode: 3,
  ranges: [[0x003b, 0x3a]], // 0x3b-0x74
  maxStrings: 4,
  battery: false,
  values: {
    state: u16(0x003b),
    productionToday: u16(0x003c, 0.1),
    productionTotal: u32(0x003f, 0x0040, 0.1),
    // The AC output of a microinverter is its production.
    pvPower: u32(0x0056, 0x0057, 0.1),
    inverterTemperature: u16(0x005a, 0.01, 1000),
    // No power register per input: voltage x current.
    strings: [
      { voltage: u16(0x006d, 0.1), current: u16(0x006e, 0.1) },
      { voltage: u16(0x006f, 0.1), current: u16(0x0070, 0.1) },
      { voltage: u16(0x0071, 0.1), current: u16(0x0072, 0.1) },
      { voltage: u16(0x0073, 0.1), current: u16(0x0074, 0.1) },
    ],
  },
  decodeState: DEYE_STATE,
};

// Sofar G3 running state: 0 waiting, 1 detection, 2 on-grid, 3 emergency
// power supply, 4 recoverable fault, 5 permanent fault, 6 upgrade,
// 7 self-charging, 8 SVG, 9 PID.
const SOFAR_STATE = (code) =>
  ({ 0: 'standby', 1: 'starting', 4: 'alarm', 5: 'fault', 6: 'starting' })[code] ??
  (code <= 9 ? 'normal' : null);

const sofarG3 = {
  key: 'sofar_g3',
  functionCode: 3,
  ranges: [
    [0x0404, 0x17], // 0x404-0x41a: state, temperatures
    [0x0485, 0x2b], // 0x485-0x4af: grid and load powers
    [0x0584, 0x06], // 0x584-0x589: PV powers
    [0x0684, 0x10], // 0x684-0x693: energies (high word first)
  ],
  maxStrings: 2,
  battery: false,
  values: {
    state: u16(0x0404),
    inverterTemperature: s16(0x041a),
    // Positive when exporting on the inverter side: turned into import +.
    gridPower: s16(0x0488, -10),
    loadPower: s16(0x04af, 10),
    strings: [u16(0x0586, 10), u16(0x0589, 10)],
    productionToday: u32(0x0685, 0x0684, 0.01),
    productionTotal: u32(0x0687, 0x0686, 0.1),
    importToday: u32(0x068d, 0x068c, 0.01),
    importTotal: u32(0x068f, 0x068e, 0.1),
    exportToday: u32(0x0691, 0x0690, 0.01),
    exportTotal: u32(0x0693, 0x0692, 0.1),
  },
  decodeState: SOFAR_STATE,
};

// Solis inverter status: 0 waiting, 1 open run, 2 soft run, 3 generating;
// 0x1000 and above are fault codes (grid off, over-voltage, temperature...).
const SOLIS_STATE = (code) => {
  if (code >= 0x1000) {
    return 'fault';
  }
  return { 0: 'standby', 1: 'starting', 2: 'starting', 3: 'normal' }[code] ?? 'normal';
};

const solis1p = {
  key: 'solis_1p',
  functionCode: 4,
  ranges: [[0x0bbc, 0x28]], // 0xbbc-0xbe3
  maxStrings: 2,
  battery: false,
  values: {
    pvPower: u32(0x0bbf, 0x0bbe),
    productionTotal: u32(0x0bc1, 0x0bc0),
    productionToday: u16(0x0bc6, 0.1),
    inverterTemperature: s16(0x0be1, 0.1),
    state: u16(0x0be3),
    strings: [
      { voltage: u16(0x0bcd, 0.1), current: u16(0x0bce, 0.1) },
      { voltage: u16(0x0bcf, 0.1), current: u16(0x0bd0, 0.1) },
    ],
  },
  decodeState: SOLIS_STATE,
};

export const PROFILES = Object.fromEntries(
  [
    deyeSinglePhaseHybrid,
    deyeThreePhaseHybrid,
    deyeThreePhaseHybridHv,
    deyeMicro,
    sofarG3,
    solis1p,
  ].map((profile) => [profile.key, profile]),
);

export const DEFAULT_PROFILE = 'deye_hybrid';

/** What a profile can publish: the reading keys it decodes. */
export function capabilities(profile, pvInputs = profile.maxStrings) {
  const values = profile.values;
  const strings = Math.min(Math.max(1, pvInputs), profile.maxStrings);
  return {
    strings,
    has: (key) =>
      key === 'pvPower' || key === 'batteryChargePower' || key === 'batteryDischargePower'
        ? key === 'pvPower' || (profile.battery && values.batteryPower !== undefined)
        : values[key] !== undefined,
  };
}

/** Every register a profile reads, for the fake logger and the tests. */
export function registersOf(profile) {
  const addresses = [];
  for (const [start, count] of profile.ranges) {
    for (let address = start; address < start + count; address += 1) {
      addresses.push(address);
    }
  }
  return addresses;
}

function decodeValue(spec, words) {
  let raw = 0;
  for (const [index, address] of spec.regs.entries()) {
    const word = words.get(address);
    if (word === undefined) {
      return null;
    }
    raw += word * 2 ** (16 * index);
  }
  if (spec.signed) {
    const bits = 16 * spec.regs.length;
    if (raw >= 2 ** (bits - 1)) {
      raw -= 2 ** bits;
    }
  }
  return round((raw - spec.offset) * spec.scale);
}

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Decodes the registers read into a reading.
 * @param {object} profile
 * @param {Map<number, number>} words address -> 16-bit word
 * @param {number} [pvInputs] PV inputs wired: only those get their own value
 *   (the total counts every input, an unused one reads 0)
 */
export function decode(profile, words, pvInputs = profile.maxStrings) {
  const { strings: count } = capabilities(profile, pvInputs);
  const reading = {};
  for (const [key, spec] of Object.entries(profile.values)) {
    if (key === 'strings' || key === 'state') {
      continue;
    }
    const value = decodeValue(spec, words);
    if (value !== null) {
      reading[key] = value;
    }
  }

  const strings = profile.values.strings.map((spec) => {
    if (spec.regs) {
      return decodeValue(spec, words);
    }
    const voltage = decodeValue(spec.voltage, words);
    const current = decodeValue(spec.current, words);
    return voltage === null || current === null ? null : Math.round(voltage * current);
  });
  if (strings.every((value) => value !== null)) {
    reading.strings = strings.slice(0, count);
    reading.pvPower ??= Math.round(strings.reduce((sum, value) => sum + value, 0));
  }

  if (profile.values.state) {
    const code = decodeValue(profile.values.state, words);
    if (code !== null) {
      reading.stateCode = code;
      reading.state = profile.decodeState(code);
      if (reading.state === null) {
        delete reading.state;
      }
    }
  }

  if (
    reading.batteryLevel !== undefined &&
    (reading.batteryLevel < 0 || reading.batteryLevel > 100)
  ) {
    delete reading.batteryLevel; // read while the BMS is not answering
  }
  return reading;
}
