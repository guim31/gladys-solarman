// -----------------------------------------------------------------------------
// Scene triggers: things that HAPPEN to the inverter, fired on a crossing,
// never on a level (Gladys already reacts to the state of a feature).
//
// The scene filters of Gladys only compare for equality: a threshold cannot be
// a filter on a battery level. `battery_below` fires one event per step of a
// fixed ladder the level goes down through, carrying the step as `threshold`;
// the scene picks its step in a select. A step fires once and is re-armed
// when the level is back REARM_PERCENT above it.
//
// Nothing fires on the first reading: a battery already at 15 % or a house
// already exporting when the integration starts is a state, not an event.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  BATTERY_FULL: 'battery_full',
  BATTERY_BELOW: 'battery_below',
  INVERTER_FAULT: 'inverter_fault',
  EXPORT_STARTED: 'grid_export_started',
  EXPORT_STOPPED: 'grid_export_stopped',
};

export const BATTERY_THRESHOLDS = [10, 15, 20, 25, 30, 40, 50];
export const FULL_LEVEL = 100;
export const FULL_REARM_LEVEL = 95;
export const REARM_PERCENT = 5;
const FAULT_STATES = ['alarm', 'fault'];

/** A fresh memory of what was seen: everything unknown. */
export function initialTriggerState() {
  return { level: undefined, fired: [], full: undefined, state: undefined, exporting: undefined };
}

/**
 * Compares a reading with the previous ones.
 * @param {object} memory from initialTriggerState(), updated in place
 * @param {object} reading see src/profiles.js
 * @param {{ exportThreshold: number }} options export power (W) that counts as exporting
 * @returns {Array<{ key: string, data: object }>} the events to publish
 */
export function evaluate(memory, reading, { exportThreshold }) {
  const events = [];

  if (typeof reading.batteryLevel === 'number') {
    const level = reading.batteryLevel;
    const first = memory.level === undefined;
    // Full: once at 100 %, re-armed below 95 %.
    if (level >= FULL_LEVEL) {
      if (memory.full === false) {
        events.push({ key: TRIGGERS.BATTERY_FULL, data: { battery_level: level } });
      }
      memory.full = true;
    } else if (memory.full === undefined || level <= FULL_REARM_LEVEL) {
      memory.full = false;
    }
    // Below: each step reached on the way down (a scene filters on its own step).
    const fired = [];
    for (const threshold of BATTERY_THRESHOLDS) {
      const wasFired = memory.fired.includes(threshold);
      if (level <= threshold) {
        fired.push(threshold);
        if (!first && !wasFired) {
          events.push({
            key: TRIGGERS.BATTERY_BELOW,
            data: { threshold: String(threshold), battery_level: level },
          });
        }
      } else if (wasFired && level < threshold + REARM_PERCENT) {
        fired.push(threshold); // not far enough above the step yet
      }
    }
    memory.fired = fired;
    memory.level = level;
  }

  if (reading.state) {
    const faulty = FAULT_STATES.includes(reading.state);
    const wasFaulty = memory.state === undefined ? undefined : FAULT_STATES.includes(memory.state);
    if (faulty && wasFaulty === false) {
      events.push({
        key: TRIGGERS.INVERTER_FAULT,
        data: { state: reading.state, code: reading.stateCode ?? 0 },
      });
    }
    memory.state = reading.state;
  }

  if (typeof reading.gridPower === 'number') {
    const exported = -reading.gridPower;
    // Hysteresis: starts above the threshold, stops below half of it.
    let exporting = memory.exporting;
    if (exported > exportThreshold) {
      exporting = true;
    } else if (exported < exportThreshold / 2) {
      exporting = false;
    }
    if (memory.exporting === false && exporting === true) {
      events.push({ key: TRIGGERS.EXPORT_STARTED, data: { power: Math.round(exported) } });
    } else if (memory.exporting === true && exporting === false) {
      events.push({ key: TRIGGERS.EXPORT_STOPPED, data: { power: Math.round(exported) } });
    }
    memory.exporting = exporting ?? false;
  }

  return events;
}
