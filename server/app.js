import express from 'express';
import compression from 'compression';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { WEDDING_CONFIG } from '../src/config.js';
import { getShareMetadata } from '../src/share-metadata.js';
import { InvalidInvitationLinkError } from '../src/family-invitation.js';
import { renderShareMetadata } from '../src/share-html.js';
import { blessingsRouter } from './blessings/http.js';
import { adminRouter } from './admin/http.js';
import { readBuildInfo } from './admin/status.js';
import { gamePublicRouter } from './game/http.js';
import { requestTracing, logError } from './observability.js';
import { readStaticAssetBase, renderStaticAssets, readStaticStyles } from './static-assets.js';

/** HTML 按请求生成分享信息；媒体、条件请求与范围下载交给静态文件中间件。 */
export function createInvitationApp({ distDir = resolve('dist'), config = WEDDING_CONFIG, blessings = null, admin = null, game = null, gameOrigin, startedAt = new Date(), buildInfo, staticAssetBase = readStaticAssetBase() } = {}) {
  const html = renderStaticAssets(readFileSync(resolve(distDir, 'index.html'), 'utf8'), staticAssetBase);
  renderShareMetadata(html, getShareMetadata(config));
  const app = express();
  const applicationBuildInfo = buildInfo ?? readBuildInfo({ distDir });
  app.disable('x-powered-by');
  app.use(requestTracing(applicationBuildInfo));
  app.use(compression({ filter: (request, response) => !request.path.startsWith('/api/blessings') && !request.headers.range && compression.filter(request, response) }));
  app.use('/api/blessings', blessingsRouter(blessings));
  app.use('/admin', adminRouter({ config: admin, blessings, game, startedAt, buildInfo: applicationBuildInfo }));
  app.use('/api/game', gamePublicRouter(game, gameOrigin || new URL(config.share.siteUrl).origin));
  app.get('/healthz', (_request, response) => response.type('text/plain').send('ok\n'));
  app.get(['/', '/index.html'], (request, response, next) => {
    try {
      const search = new URL(request.originalUrl, 'http://invitation.local/').search;
      const share = getShareMetadata(config, search, staticAssetBase);
      // 公开请柬允许浏览器保留返回快照；普通导航仍验证 HTML，访客接口单独禁止缓存。
      response.set('Cache-Control', 'private, no-cache').type('html').send(renderShareMetadata(html, share));
    } catch (error) {
      if (!(error instanceof InvalidInvitationLinkError)) return next(error);
      response.status(400).set('Cache-Control', 'no-store').type('text/plain').send(error.message);
    }
  });
  for (const page of ['game.html', 'calendar.html']) {
    const file = resolve(distDir, page);
    if (!existsSync(file)) continue;
    const content = renderStaticAssets(readFileSync(file, 'utf8'), staticAssetBase);
    app.get('/' + page, (_request, response) => response.set('Cache-Control', 'no-store').type('html').send(content));
  }
  for (const [path, content] of readStaticStyles(distDir, staticAssetBase)) {
    app.get(path, (_request, response) => response.set('Cache-Control', 'no-cache').type('css').send(content));
  }
  app.use(express.static(distDir, {
    index: false,
    etag: true,
    setHeaders(response, file) {
      if (extname(file) === '.ics') {
        response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        response.setHeader('Content-Disposition', 'inline; filename="wedding.ics"');
      }
      const compiled = relative(distDir, file).replaceAll('\\', '/').startsWith('app/');
      response.setHeader('Cache-Control', compiled ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.use((_request, response) => response.status(404).type('text/plain').send('页面或文件不存在。'));
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const status = error.status === 400 || error.status === 403 ? error.status : 500;
    if (status === 500) logError('http.unhandled_error',error);
    response.status(status).type('text/plain').send(status === 500 ? '页面暂时无法打开，请稍后重试。' : '请求地址无效。');
  });
  return app;
}
