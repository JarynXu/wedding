import { log, logError } from './observability.js';
import { WEDDING_CONFIG } from '../src/config.js';
import { publicWeddingFacts } from './game/public-context.js';
import { createInvitationApp } from './app.js';
import { readAdminConfig } from './admin/config.js';
import { readBuildInfo } from './admin/status.js';
import { readBlessingsConfig } from './blessings/config.js';
import { createBlessingsService } from './blessings/service.js';
import { readGameRuntime } from './game/config.js';
import { createGameService } from './game/service.js';
import { BlessingWriter } from './blessings/writing.js';
import { readStaticAssetBase } from './static-assets.js';
import { logOptions } from './log-format.js';

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 须为 1–65535 的端口号');
const blessingsConfig = readBlessingsConfig();
const admin = readAdminConfig();
const gameRuntime = readGameRuntime();
const staticAssetBase = readStaticAssetBase();
logOptions(process.env, process.stdout);

const game = createGameService({ database: blessingsConfig?.database, room: blessingsConfig?.room, runtime: gameRuntime, wedding: publicWeddingFacts(WEDDING_CONFIG) });
const blessings = createBlessingsService(blessingsConfig, { writing: new BlessingWriter(gameRuntime?.ai,game?.modelClient) });
const server = createInvitationApp({ blessings, admin, game, gameOrigin: blessingsConfig?.origin, staticAssetBase }).listen(port, process.env.HOST || '0.0.0.0', () => {
  const build=readBuildInfo();
  log('service.started',{status:'listening',build_id:build.build,commit:build.commit,counts:blessingsConfig?{pool_size:blessingsConfig.database.max,max_instances:blessingsConfig.maxInstances,connection_budget:blessingsConfig.connectionBudget,max_connections:blessingsConfig.maxInstances*(2*blessingsConfig.database.max+1)}:undefined});
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;log('service.stopping');
  const closed = new Promise(resolve => server.close(resolve));
  server.closeIdleConnections?.();
  setTimeout(() => {
    log('service.shutdown_timeout',{},'error');
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000).unref();
  try {
    await Promise.all([blessings?.close(), game?.close()]);
    const error = await closed;
    process.exit(error ? 1 : 0);
  } catch (error) {
    logError('service.shutdown_failed',error);
    process.exit(1);
  }
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
