import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AdminAuth } from './auth.js';
import { createAdminStatus } from './status.js';
import { gameAdminRouter } from '../game/http.js';

const ADMIN_DIR = fileURLToPath(new URL('./', import.meta.url));

export function adminRouter({ config = null, blessings = null, game = null, startedAt = new Date(), buildInfo, clock } = {}) {
  const router = express.Router();
  const auth = config ? new AdminAuth(config, { ...(clock ? { clock } : {}) }) : null;
  const status = createAdminStatus({ blessings, startedAt, ...(buildInfo ? { buildInfo } : {}), ...(clock ? { clock: () => new Date(clock()) } : {}) });

  router.use((_request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; style-src 'self'; script-src 'self'",
    });
    next();
  });

  router.post('/api/login', express.json({ limit: '4kb', strict: true }), async (request, response) => {
    if (!auth) return unavailable(response);
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.username !== 'string' || typeof body.password !== 'string') return response.status(400).json({ error: 'INVALID_LOGIN', message: '登录信息格式有误' });
    const result = await auth.login(body.username, body.password, request.socket.remoteAddress);
    if (result.rateLimited) {
      response.set('Retry-After', String(result.retryAfter));
      return response.status(429).json({ error: 'LOGIN_RATE_LIMITED', message: '登录尝试次数过多，请稍后再试' });
    }
    if (!result.ok) return response.status(401).json({ error: 'INVALID_LOGIN', message: '用户名或密码错误' });
    response.set('Set-Cookie', serializeCookie(config, result.cookieValue, result.maxAge));
    return response.status(200).json({ authenticated: true });
  });

  router.post('/api/logout', (request, response) => {
    if (!auth) return unavailable(response);
    auth.logout(request.get('Cookie'));
    response.set('Set-Cookie', serializeCookie(config, '', 0));
    return response.status(204).end();
  });

  router.get('/api/status', requireSession(auth), async (_request, response) => response.status(200).json(await status.snapshot()));
  router.use('/api/game', requireSession(auth), gameAdminRouter(game, config?.username));

  router.get(['/', '/index.html'], sendStatic('index.html'));
  router.get('/admin.js', sendStatic('admin.js'));
  router.get('/admin.css', sendStatic('admin.css'));
  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    if (invalid) return response.status(400).json({ error: 'INVALID_LOGIN', message: '登录信息格式有误' });
    console.error('管理后台请求失败', error.code || error.name);
    return response.status(500).json({ error: 'ADMIN_UNAVAILABLE', message: '管理后台暂时无法响应' });
  });
  return router;
}

function sendStatic(file) {
  return (_request, response, next) => response.sendFile(join(ADMIN_DIR, file), error => { if (error) next(error); });
}

function requireSession(auth) {
  return (request, response, next) => {
    if (!auth) return unavailable(response);
    if (!auth.sessionFromCookie(request.get('Cookie'))) return response.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录管理后台' });
    return next();
  };
}

function unavailable(response) {
  return response.status(503).json({ error: 'ADMIN_NOT_CONFIGURED', message: '管理后台尚未配置' });
}

function serializeCookie(config, value, maxAge) {
  const attributes = [`${config.cookieName}=${value}`, 'Path=/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (config.cookieSecure) attributes.push('Secure');
  return attributes.join('; ');
}
