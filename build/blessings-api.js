import { loadEnv } from 'vite';
import express from 'express';
import { readBlessingsConfig } from '../server/blessings/config.js';
import { createBlessingsService } from '../server/blessings/service.js';
import { blessingsRouter } from '../server/blessings/http.js';

/** 开发与预览复用生产 API；环境变量不注入浏览器脚本。 */
export function blessingsApi() {
  let env;
  let service;
  const attach = server => {
    service = createBlessingsService(readBlessingsConfig(env));
    const app = express();
    app.use('/api/blessings', blessingsRouter(service));
    server.middlewares.use('/api', (request, response, next) => {
      request.url = '/api' + request.url;
      app(request, response, next);
    });
    server.httpServer?.once('close', () => { service?.close().catch(error => console.error('祝福服务关闭失败', error.code || error.name)); });
  };
  return {
    name: 'blessings-api',
    configResolved(config) { env = { ...loadEnv(config.mode, config.envDir, 'BLESSINGS_'), ...process.env }; },
    configureServer: attach,
    configurePreviewServer: attach,
    closeBundle() { return service?.close(); },
  };
}
