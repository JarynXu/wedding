import express from 'express';
import { GameError, gamePhase } from './model.js';

export function gamePublicRouter(service, origin) {
  const router = express.Router();
  router.use(noCache);
  router.get('/config', async (_request, response) => {
    if (!service) return response.json({ enabled: false });
    await service.ensure();
    const event = await service.store.event();
    if (!event.published) return response.json({ enabled: false, phase: 'draft' });
    response.json({ enabled: true, phase: gamePhase(event, event.now.getTime()), version: event.version, closesAt: event.config.closesAt,
      maxWinners: event.config.maxWinners, requiredCorrect: event.config.requiredCorrect, questions: event.config.questions.map(question => ({ id: question.id, title: question.title })), prizes: event.config.prizes, captchaId:service.runtime.captcha?.appId||null });
  });
  router.use(ready(service));
  router.use((request, _response, next) => {
    if (!['GET', 'HEAD'].includes(request.method) && (request.get('Origin') !== origin || !request.is('application/json'))) return next(new GameError('FORBIDDEN', '请从请柬页面操作', 403));
    next();
  }, express.json({ limit: '8kb', strict: true }));
  router.post('/auth/code', async (request, response) => {
    response.json(await service.identity.requestCode(request.body, request.socket.remoteAddress || 'unknown'));
  });
  router.post('/auth/verify', async (request, response) => {
    const result = await service.identity.verifyCode(request.body);
    response.set('Set-Cookie', cookie(result.token, service.runtime.cookieSecure, 30 * 86400)).json({ authenticated: true });
  });
  router.post('/auth/logout', async (request, response) => { await service.identity.logout(request.get('Cookie')); response.set('Set-Cookie', cookie('', service.runtime.cookieSecure, 0)).json({ authenticated: false }); });
  router.get('/leaderboard', async (_request, response) => {
    const event = await service.store.event();
    if (!event.published) throw new GameError('NOT_OPEN', '活动尚未开放', 409);
    const { candidates, standings } = await service.store.ranking();
    response.json({ provisional: !event.settled_at, qualifiedCount: standings.filter(row => row.qualifiedAt).length, entries: candidates.map(row => ({ rank: row.rank, name: row.name, score: row.score, ...(event.settled_at ? { prize: row.prize } : {}) })) });
  });
  router.use(async (request, _response, next) => {
    const id = await service.identity.session(request.get('Cookie'));
    if (!id) return next(new GameError('AUTH_REQUIRED', '请用手机号验证后参与', 401));
    request.gameParticipantId = id; next();
  });
  router.get('/me', async (request, response) => response.json(await service.store.participant(request.gameParticipantId)));
  router.post('/answers', async (request, response) => {
    const answer = await service.store.submit(request.gameParticipantId, request.body);
    response.status(200).json(answer); service.tick();
  });
  router.use(gameErrors);
  return router;
}

/** 本路由由管理员会话中间件保护，不接受客户端声明的管理员身份。 */
export function gameAdminRouter(service, actor) {
  const router = express.Router(); router.use(noCache, ready(service), express.json({ limit: '48kb', strict: true }));
  const overview = () => service.store.overview(service.integrations);
  router.get('/', async (_request, response) => response.json(await overview()));
  router.put('/config', async (request, response) => { await service.store.saveConfig(request.body, actor); response.json(await overview()); service.tick(); });
  router.post('/publish', async (request, response) => { await service.store.publish(request.body.expectedVersion, service.integrations); response.json(await overview()); });
  router.get('/participants', async (request, response) => response.json(await service.store.participants(request.query.before)));
  router.get('/participants/:id', async (request, response) => response.json(await service.store.participant(request.params.id, true)));
  router.post('/review/:id', async (request, response) => { await service.store.manualReview(request.params.id, request.body, actor); response.json({ ok: true }); });
  router.get('/settlement-preview', async (_request, response) => response.json(await service.store.settlementPreview()));
  router.post('/settle', async (request, response) => response.json(await service.store.settle(request.body,actor)));
  router.post('/redemption/check', async (request, response) => response.json(await service.store.redemption(request.body.code)));
  router.post('/redemption', async (request, response) => response.json(await service.store.redemption(request.body.code, actor, request.body.requestId)));
  router.use(gameErrors); return router;
}
function ready(service) { return async (_request, _response, next) => { if (!service) return next(new GameError('GAME_UNAVAILABLE', '游戏服务尚未配置', 503)); await service.ensure(); next(); }; }
function noCache(_request, response, next) { response.set('Cache-Control', 'no-store'); next(); }
function cookie(value, secure, age) { return `wedding_game=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`; }
function gameErrors(error, _request, response, next) {
  if (response.headersSent) return next(error);
  const known = error instanceof GameError, invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
  if (!known && !invalid) console.error('游戏请求失败', error.code || error.name);
  if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
  response.status(known ? error.status : invalid ? 400 : 503).json({ error: known ? error.code : invalid ? 'INVALID_JSON' : 'UNAVAILABLE', message: known ? error.message : invalid ? '提交内容格式有误' : '游戏服务暂时无法连接，请稍后重试' });
}
