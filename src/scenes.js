// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `read_status` reads the inverter now (or uses a reading younger than
// FRESH_MS) and gives the following actions of the scene a sentence to send
// ("Solar 2,340 W, house 1,200 W...") and the main values as numbers. A scene
// action does not receive the user's language: the sentence is written in the
// language of the configuration.
//
// The triggers (battery, fault, grid export) are fired by the hub on the
// readings, never by these actions.
// -----------------------------------------------------------------------------

import { statusSentence } from './texts.js';

const FRESH_MS = 15_000;

export const SCENE_ACTIONS = {
  async read_status(hub) {
    if (!hub.configured) {
      throw new Error('The Solarman logger is not configured');
    }
    const fresh = hub.readAt && Date.now() - hub.readAt.getTime() < FRESH_MS;
    if (!fresh) {
      await hub.refresh();
    }
    const reading = hub.online ? hub.reading : null;
    const number = (value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : 0);
    return {
      summary: statusSentence(hub.config.language, hub.reading, hub.online),
      online: hub.online && hub.reading !== null,
      production: number(reading?.pvPower),
      house_consumption: number(reading?.loadPower),
      grid_power: number(reading?.gridPower),
      battery_level: number(reading?.batteryLevel),
      production_today: number(reading?.productionToday),
    };
  },
};
