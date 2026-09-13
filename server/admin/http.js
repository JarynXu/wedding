import express from 'express';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AdminAuth } from './auth.js';
import { createAdminStatus } from './status.js';
import { gameAdminRouter } from '../game/http.js';
import { AdminSecurityStore } from './security-store.js';
import { log, logError } from '../observability.js';
import { RoomOperations } from '../room-operations.js';
import { GameError } from '../game/model.js';

const ADMIN_DIR = fileURLToPath(new URL('./', import.meta.url));

export function adminRouter({ config = null, blessings = null, game = null, startedAt = new Date(), buildInfo, clock } = {}) {
  const router = express.Router();
  const pool=game?.store?.pool||blessings?.store?.pool;
  const auth = config ? new AdminAuth(config, { ...(clock ? { clock } : {}),store:pool?new AdminSecurityStore(pool,config):null }) : null;
  const operations=config&&game&&blessings&&game.store.room===blessings.config.room?new RoomOperations({pool,room:game.store.room,secret:config.sessionSecret}):null;
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
    log('admin.login',{status:result.ok?'accepted':result.rateLimited?'limited':'rejected'});
    if (result.rateLimited) {
      response.set('Retry-After', String(result.retryAfter));
      return response.status(429).json({ error: 'LOGIN_RATE_LIMITED', message: '登录尝试次数过多，请稍后再试' });
    }
    if (!result.ok) return response.status(401).json({ error: 'INVALID_LOGIN', message: '用户名或密码错误' });
    response.set('Set-Cookie', serializeCookie(config, result.cookieValue, result.maxAge));
    return response.status(200).json({ authenticated: true });
  });

  router.post('/api/logout', async (request, response) => {
    if (!auth) return unavailable(response);
    await auth.logout(request.get('Cookie'));
    log('admin.logout');
    response.set('Set-Cookie', serializeCookie(config, '', 0));
    return response.status(204).end();
  });

  router.get('/api/status', requireSession(auth), async (_request, response) => response.status(200).json(await status.snapshot()));
  router.use('/api/game', requireSession(auth), gameAdminRouter(game, config?.username));
  router.get('/api/operations',requireSession(auth),async(_request,response)=>response.json(operations?{enabled:true,...await operations.snapshot()}:{enabled:false}));
  router.post('/api/operations/:action',requireSession(auth),(request,response,next)=>{if(!request.is('application/json')||request.get('Origin')!==blessings?.config.origin)return response.status(403).json({message:'请从后台页面操作'});next();},express.json({limit:'6kb',strict:true}),async(request,response)=>{
    if(!operations)return response.status(503).json({message:'业务服务尚未就绪'});
    if(request.params.action==='pause')return response.json(await operations.pause(request.body.paused,config.username));
    if(request.params.action!=='reset')return response.status(404).end();
    const verified=await auth.login(config.username,request.body.password,request.socket.remoteAddress);
    if(!verified.ok)return response.status(verified.rateLimited?429:403).json({message:verified.rateLimited?'尝试次数过多，请稍后再试':'请填写当前管理员密码确认操作'});
    response.json(await operations.reset(request.body,config.username));
  });

  router.get(['/', '/index.html'], sendStatic('index.html'));
  router.get('/admin.js', sendStatic('admin.js'));
  router.get('/knowledge.js', sendStatic('knowledge.js'));
  router.get('/operations.js', sendStatic('operations.js'));
  router.get('/admin.css', sendStatic('admin.css'));
  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    if(error instanceof GameError)return response.status(error.status).json({error:error.code,message:error.message});
    const invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    if (invalid) return response.status(400).json({ error: 'INVALID_LOGIN', message: '登录信息格式有误' });
    logError('admin.request_failed',error);
    return response.status(500).json({ error: 'ADMIN_UNAVAILABLE', message: '管理后台暂时无法响应' });
  });
  return router;
}

function sendStatic(file) {
  return (_request, response, next) => response.sendFile(join(ADMIN_DIR, file), error => { if (error) next(error); });
}

function requireSession(auth) {
  return async (request, response, next) => {
    if (!auth) return unavailable(response);
    if (!await auth.authenticateCookie(request.get('Cookie'))) return response.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录管理后台' });
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
