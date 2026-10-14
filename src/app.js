// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake) and
// returns the hub, so index.js stays a few lines and the tests drive the very
// same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { SolarmanHub } from './hub.js';
import { SCENE_ACTIONS } from './scenes.js';
import { ACTION_TEXT, INIT_FAILED, PROBLEM_TEXT, statusSentence } from './texts.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'solarman-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: timers, client options, intervalMs
 */
export function registerHandlers(gladys, options = {}) {
  const hub = new SolarmanHub({
    gladys,
    timers: options.timers ?? true,
    client: options.client,
    intervalMs: options.intervalMs,
  });

  // Resolved once the hub has started; every handler waits for it.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): publish again what Gladys may have lost.
        await hub.resync();
        return;
      }
      started = true;
      await hub.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, INIT_FAILED).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onScanRequest(whenReady(() => hub.resync()));

  // Published with should_poll: false (read by the hub's own timer): only
  // serves a Gladys that would poll anyway.
  gladys.onPoll(whenReady((device) => hub.poll(device)));

  gladys.onDeviceCreated(whenReady((device) => hub.onDeviceCreated(device)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      await hub.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    'test_connection',
    whenReady(async () => {
      const texts = ACTION_TEXT[hub.config?.language] ?? ACTION_TEXT.fr;
      if (!hub.configured) {
        return texts.notConfigured;
      }
      logger.info('Action: test the connection');
      const result = await hub.refresh();
      const language = hub.config.language;
      if (!result.ok) {
        const problems = PROBLEM_TEXT[language];
        return texts.failed(problems[result.problem] ?? problems.other);
      }
      return texts.ok(statusSentence(language, hub.reading, true));
    }),
  );

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(
      key,
      whenReady((fields) => handler(hub, { fields: fields ?? {} })),
    );
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(
      key,
      whenReady((request) => widget.get(hub, request)),
    );
  }

  return {
    hub,
    ready,
    stop: () => hub.stop(),
  };
}
