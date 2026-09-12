import express from 'express';
import { isIP } from 'node:net';
import { BlessingError, parseCursor, validateBlessing, validateWriting } from './model.js';

export function blessingsRouter(service) {
  const router = express.Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/config', (_request, response) => response.json({ enabled: Boolean(service), ...(service ? { aiWritingEnabled:Boolean(service.writing?.configured), giftRecordIntervalMs: Math.max(1000, service.config?.minIntervalMs ?? 3000, Math.ceil(60000 / (service.config?.clientLimit || 12))) } : {}) }));
  router.use((_request, _response, next) => next(service ? undefined : new BlessingError('DISABLED', '祝福功能尚未开放', 503)));
  router.get('/history', async (request, response) => {
    const before = parseCursor(singleQuery(request, 'before'));
    response.json(await service.store.history(before));
  });
  router.get('/stream', async (request, response) => {
    const after = parseCursor(request.get('Last-Event-ID') || singleQuery(request, 'after'));
    await openStream(request, response, service, after);
  });
  router.post('/polish', (request,_response,next)=>{
    if(request.get('Origin')!==service.config.origin||!request.is('application/json'))return next(new BlessingError('FORBIDDEN','请从请柬页面使用AI写祝福',403));next();
  },express.json({limit:'4kb',strict:true}),async(request,response)=>{
    response.json(await service.write(validateWriting(request.body),clientNetwork(request,service.config)));
  });
  router.post('/', (request, _response, next) => {
    if (request.get('Origin') !== service.config.origin || !request.is('application/json')) return next(new BlessingError('FORBIDDEN', '请从请柬页面发送祝福', 403));
    next();
  }, express.json({ limit: '4kb', strict: true }), async (request, response) => {
    const message = validateBlessing(request.body);
    const result = await service.store.save(message, clientNetwork(request, service.config));
    response.status(result.created ? 201 : 200).json(result);
    service.hub.refresh();
  });
  router.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const known = error instanceof BlessingError;
    const invalid = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    if (!known && !invalid) console.error('祝福请求失败', error.code || error.name);
    const status = known ? error.status : invalid ? 400 : 503;
    if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
    response.status(status).json({ error: known ? error.code : invalid ? 'INVALID_JSON' : 'UNAVAILABLE', message: known ? error.message : invalid ? '发送内容格式有误' : '祝福服务暂时无法连接，请稍后重试' });
  });
  return router;
}

function singleQuery(request, key) {
  const values = new URL(request.originalUrl, 'http://invitation.local').searchParams.getAll(key);
  if (values.length > 1) throw new BlessingError('INVALID_CURSOR', '消息位置无效');
  return values[0];
}
function clientNetwork(request, config) {
  const forwarded = config.clientIpHeader && request.get(config.clientIpHeader)?.split(',')[0].trim();
  return (forwarded && isIP(forwarded) ? forwarded : request.socket.remoteAddress) || 'unknown';
}

/** 先订阅并暂存更新，再读取快照；写入快照后按序号排除重复。 */
async function openStream(request, response, { store, hub, config, streams }, after) {
  if (!hub.ready) throw new BlessingError('UNAVAILABLE', '祝福正在重连', 503);
  if (streams.size >= config.maxStreams) throw new BlessingError('BUSY', '祝福连接繁忙，请稍后重试', 503);
  let closed = false;
  let syncing = true;
  let cursor = after || '0';
  let pending = [];
  let heartbeat;
  let unsubscribe = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    streams.delete(close);
    if (!response.destroyed) {
      if (response.headersSent) response.end();
      else response.status(503).json({ error: 'UNAVAILABLE', message: '祝福连接中断，请稍后重试' });
    }
  };
  const send = (event, value, id) => {
    if (closed) return false;
    const frame = `${id == null ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    if (response.writableLength > 65536) { close(); response.destroy(); return false; }
    response.write(frame);
    return true;
  };
  const deliver = message => {
    if (BigInt(message.id) <= BigInt(cursor)) return;
    if (send('blessing', message, message.id)) cursor = message.id;
  };
  streams.add(close);
  response.on('close', close);
  unsubscribe = hub.subscribe(message => {
    if (!syncing) return deliver(message);
    pending.push(message);
    if (pending.length > 300) close();
  }, close);
  try {
    let messages;
    let reset = false;
    if (after != null) {
      messages = await store.since(after, 201);
      reset = messages.length > 200 || BigInt(after) > BigInt(await store.latestId());
    }
    if (after == null || reset) messages = (await store.history(null, 6)).messages.reverse();
    if (closed) return;
    cursor = messages.at(-1)?.id || (reset ? '0' : cursor);
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive' });
    response.flushHeaders();
    response.write('retry: 3000\n\n');
    send('sync', { messages, cursor, reset }, cursor);
    syncing = false;
    pending.forEach(deliver);
    pending = [];
    heartbeat = setInterval(() => {
      if (response.writableLength > 65536) { close(); response.destroy(); }
      else response.write(': heartbeat\n\n');
    }, 10000);
    heartbeat.unref();
  } catch (error) { console.error('祝福同步失败', error.code || error.name); close(); }
}
