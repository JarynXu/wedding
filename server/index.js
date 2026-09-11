import { createInvitationApp } from './app.js';

const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 须为 1–65535 的端口号');
const server = createInvitationApp().listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`请柬服务已监听端口 ${port}`);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(error => process.exit(error ? 1 : 0));
  server.closeIdleConnections?.();
  setTimeout(() => {
    console.error('请柬服务关闭超时');
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
