import { BlessingStore } from './store.js';
import { BlessingHub } from './hub.js';

export function createBlessingsService(config) {
  if (!config) return null;
  const store = new BlessingStore(config);
  const hub = new BlessingHub(store, config);
  const streams = new Set();
  hub.start();
  let closing;
  return {
    config, store, hub, streams,
    close() {
      closing ??= (async () => { await hub.close(); for (const close of streams) close(); await store.close(); })();
      return closing;
    },
  };
}
