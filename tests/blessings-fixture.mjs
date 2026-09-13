import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readBlessingsConfig } from '../server/blessings/config.js';
import { createBlessingsService } from '../server/blessings/service.js';
import { createInvitationApp } from '../server/app.js';
export const databaseUrl = process.env.BLESSINGS_TEST_DATABASE_URL;
export const waitFor = async (condition, timeout = 10000) => {
  const deadline = Date.now() + timeout;
  while (!await condition()) { if (Date.now() >= deadline) throw new Error('等待条件超时'); await new Promise(resolve => setTimeout(resolve, 30)); }
};
export async function fixture(overrides = {}, { writing = null } = {}) {
  const config = readBlessingsConfig({ BLESSINGS_DATABASE_URL: databaseUrl, BLESSINGS_DB_SSL: 'false', BLESSINGS_RATE_SECRET: 'isolated-test-secret-32-characters-minimum', BLESSINGS_ROOM: `test-${randomUUID()}`, BLESSINGS_MIN_INTERVAL_MS: '0', BLESSINGS_CLIENT_LIMIT: '120', ...overrides });
  const db = new pg.Client(config.database); await db.connect();
  await db.query(await readFile(new URL('../server/operations-schema.sql',import.meta.url),'utf8'));
  await db.query(await readFile(new URL('../server/blessings/schema.sql', import.meta.url), 'utf8'));
  const instances = [];
  async function instance() {
    const instanceConfig = { ...config };
    const service = createBlessingsService(instanceConfig,{writing});
    const server = createInvitationApp({ blessings: service }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    instanceConfig.origin = origin;
    const stop = async () => { await service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
    const result = { origin, service, stop };
    instances.push(result);
    await waitFor(() => service.hub.ready);
    return result;
  }
  return { config, db, instance, async close() { for (const server of instances) await server.stop(); await db.query('DELETE FROM wedding_blessings WHERE room_id=$1', [config.room]); await db.query('DELETE FROM wedding_blessing_writing WHERE room_id=$1',[config.room]);await db.end(); } };
}
export const payload = (values = {}) => ({ requestId: randomUUID(), clientId: randomUUID(), name: '测试来宾', text: '百年好合', gift: '', theme: 'classic', ...values });
export const post = (origin, body, headers = {}) => fetch(origin + '/api/blessings', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
export async function stream(origin, after = null, headers = {}) {
  const controller = new AbortController();
  const response = await fetch(origin + '/api/blessings/stream' + (after == null ? '' : `?after=${after}`), { headers, signal: controller.signal });
  if (!response.ok) { controller.abort(); throw new Error(`SSE ${response.status}`); }
  const events = [];
  let failure;
  const reading = (async () => {
    const decoder = new TextDecoder(); let pending = '';
    try {
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          const type = frame.match(/^event: (.+)$/m)?.[1]; const data = frame.match(/^data: (.+)$/m)?.[1];
          if (type && data) events.push({ type, data: JSON.parse(data), id: frame.match(/^id: (.+)$/m)?.[1] });
        }
      }
    } catch (error) { if (!controller.signal.aborted) failure = error; }
  })();
  return { response, events, async take(predicate) { await waitFor(() => { if (failure) throw failure; return events.some(predicate); }); return events.find(predicate); }, async close() { controller.abort(); await reading; } };
}
