import { createInvitationApp } from './app.js';
import { readAdminConfig } from './admin/config.js';
import { readBlessingsConfig } from './blessings/config.js';
import { createBlessingsService } from './blessings/service.js';
import { readGameRuntime } from './game/config.js';
import { createGameService } from './game/service.js';
import { BlessingWriter } from './blessings/writing.js';

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 须为 1–65535 的端口号');
const blessingsConfig = readBlessingsConfig();
const admin = readAdminConfig();
const gameRuntime = readGameRuntime();
const blessings = createBlessingsService(blessingsConfig, { writing: new BlessingWriter(gameRuntime?.ai) });
const game = createGameService({ database: blessingsConfig?.database, room: blessingsConfig?.room, runtime: gameRuntime });
const server = createInvitationApp({ blessings, admin, game, gameOrigin: blessingsConfig?.origin }).listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`请柬服务已监听端口 ${port}`);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise(resolve => server.close(resolve));
  server.closeIdleConnections?.();
  setTimeout(() => {
    console.error('请柬服务关闭超时');
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000).unref();
  try {
    await Promise.all([blessings?.close(), game?.close()]);
    const error = await closed;
    process.exit(error ? 1 : 0);
  } catch (error) {
    console.error('祝福服务关闭失败', error.code || error.name);
    process.exit(1);
  }
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
