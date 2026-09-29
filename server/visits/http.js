import express from 'express';
import { browserCategory, isAutomated, validVisit, visitorIdentity } from './identity.js';
import { logError } from '../observability.js';

export function visitsRouter(service) {
  const router = express.Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.post('/', (request, response, next) => {
    if (!service) return response.json({ enabled: false });
    if (request.get('Origin') !== service.config.origin || !request.is('application/json')) return response.status(403).json({ error: 'FORBIDDEN' });
    const agent = (request.get('User-Agent') || '').slice(0, 1024);
    if (isAutomated(agent)) return response.json({ enabled: false });
    request.visitorAgent = agent;
    next();
  }, express.json({ limit: '1kb', strict: true }), async (request, response) => {
    if (!validVisit(request.body)) return response.status(400).json({ error: 'INVALID_VISIT' });
    const identity = visitorIdentity(service.config, request.body, request.get('Cookie'));
    await service.store.record({ ...request.body, visitorHash: identity.hash, ...browserCategory(request.visitorAgent) });
    response.set('Set-Cookie', identity.cookie).json({ enabled: true });
  });
  router.use((error, _request, response, _next) => {
    if (error.status === 429) return response.set('Retry-After', '60').status(429).json({ error: 'RATE_LIMITED' });
    if (['entity.parse.failed', 'entity.too.large'].includes(error.type)) return response.status(400).json({ error: 'INVALID_VISIT' });
    logError('visits.unavailable', error);
    response.status(503).json({ error: 'VISITS_UNAVAILABLE' });
  });
  return router;
}
