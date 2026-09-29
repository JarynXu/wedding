import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { anonymousVisitor } from '../src/visit-tracking.js';
import { visitorIdentity, browserCategory, validVisit, isAutomated } from '../server/visits/identity.js';
import { VisitStore } from '../server/visits/store.js';
import { visitFixture, visitsTestAvailable } from './visits-fixture.mjs';
import { createInvitationApp } from '../server/app.js';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), clear: () => values.clear() }; };
const body = overrides => ({ visitorId: randomUUID(), visitId: randomUUID(), storage: 'local', event: 'open', theme: 'chinese', ...overrides });
const wechat = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.60';

test('长期匿名编号、会话和内存降级；清除长期存储后创建新编号', () => {
  const persistent = storage(), session = storage(), options = { local: () => persistent, session: () => session, createId: randomUUID };
  const first = anonymousVisitor(options);
  assert.equal(first.storage, 'local'); assert.equal(anonymousVisitor(options).visitorId, first.visitorId);
  persistent.clear(); assert.notEqual(anonymousVisitor(options).visitorId, first.visitorId);
  const blocked = () => { throw Error('storage disabled'); };
  const fallback = anonymousVisitor({ ...options, local: blocked });
  assert.equal(fallback.storage, 'session'); assert.equal(anonymousVisitor({ ...options, local: blocked }).visitorId, fallback.visitorId);
  assert.equal(anonymousVisitor({ ...options, local: blocked, session: blocked }).storage, 'memory');
});

test('匿名编号在数据库前做密钥摘要；Cookie 降级保留浏览器身份但不恢复已清除的长期编号', () => {
  const config = { room: 'wedding-test', secret: 'test-secret-'.repeat(4), origin: 'https://wedding.example' }, input = body();
  const first = visitorIdentity(config, input);
  assert.match(first.hash, /^[a-f0-9]{64}$/); assert.ok(!first.hash.includes(input.visitorId));
  assert.match(first.cookie, /HttpOnly; SameSite=Lax; Max-Age=15552000; Secure$/);
  assert.equal(visitorIdentity(config, input).hash, first.hash);
  assert.notEqual(visitorIdentity({ ...config, room: 'other-room' }, input).hash, first.hash);
  assert.notEqual(visitorIdentity({ ...config, secret: 'different-secret' }, input).hash, first.hash);
  assert.equal(visitorIdentity(config, body({ storage: 'session' }), first.cookie).hash, first.hash);
  assert.notEqual(visitorIdentity(config, body(), first.cookie).hash, first.hash);
  const tampered = first.cookie.replace(/^wedding_visit=./, 'wedding_visit=z');
  assert.notEqual(visitorIdentity(config, body({ storage: 'memory' }), tampered).hash, first.hash);
  assert.deepEqual(browserCategory(wechat), { browser: 'wechat', device: 'ios' });
  assert.deepEqual(browserCategory('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Safari/537.36'), { browser: 'chrome', device: 'android' });
  assert.ok(isAutomated('Googlebot/2.1')); assert.ok(isAutomated('HeadlessChrome/140')); assert.equal(isAutomated(wechat), false);
  assert.ok(validVisit(input)); assert.ok(!validVisit({ ...input, visitorId: 'someone@example.com' }));
});

test('数据库按访客和打开分别计数，跨实例重试不重复；心跳不增加次数', { skip: !visitsTestAvailable && '需要 PGLITE_MODULE_PATH', timeout: 30000 }, async () => {
  const f = await visitFixture();
  try {
    const input = { visitId: randomUUID(), visitorHash: 'a'.repeat(64), event: 'open', theme: 'chinese', ...browserCategory(wechat) };
    const another = new VisitStore(f.pool, f.config.room);
    await Promise.all([f.store.record(input), another.record(input), f.store.record({ ...input, visitId: randomUUID() })]);
    let snapshot = await f.store.snapshot();
    assert.equal(snapshot.visitors, 1); assert.equal(snapshot.opens, 2); assert.equal(snapshot.todayVisitors, 1); assert.equal(snapshot.active, 1);
    await f.store.record({ ...input, visitorHash: 'b'.repeat(64) });
    assert.equal((await f.store.snapshot()).visitors, 1, '重复上报不能留下没有访问记录的访客');
    await f.pool.query("UPDATE wedding_visitors SET last_seen=clock_timestamp()-interval '3 minutes'");
    await f.pool.query("UPDATE wedding_visits SET last_seen=clock_timestamp()-interval '3 minutes'");
    assert.equal((await f.store.snapshot()).active, 0);
    await f.store.record({ ...input, event: 'ping' });
    snapshot = await f.store.snapshot();
    assert.equal(snapshot.active, 1); assert.equal(snapshot.opens, 2);
    assert.equal(snapshot.browsers[0].kind, 'wechat'); assert.equal(snapshot.browsers[0].opens, 2);
    assert.equal(snapshot.trend.length, 7); assert.equal(snapshot.trend.at(-1).visitors, 1);
    assert.equal((await new VisitStore(f.pool, 'different-room').snapshot()).visitors, 0);
    assert.ok(!JSON.stringify(snapshot).includes(input.visitorHash));
  } finally { await f.close(); }
});

test('北京时间零点分日，同一访客跨日出现且累计只计一次', { skip: !visitsTestAvailable && '需要 PGLITE_MODULE_PATH', timeout: 30000 }, async () => {
  const f = await visitFixture();
  try {
    const input = { visitId: randomUUID(), visitorHash: 'c'.repeat(64), event: 'open', theme: 'classic', browser: 'safari', device: 'ios' };
    await f.store.record(input); await f.store.record({ ...input, visitId: randomUUID() });
    await f.pool.query(`UPDATE wedding_visits SET started_at=((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date::timestamp AT TIME ZONE 'Asia/Shanghai')-interval '1 second' WHERE visit_id=$1`, [input.visitId]);
    const snapshot = await f.store.snapshot();
    assert.equal(snapshot.opens, 2); assert.equal(snapshot.visitors, 1); assert.equal(snapshot.todayOpens, 1);
    assert.equal(snapshot.trend.at(-2).visitors, 1); assert.equal(snapshot.trend.at(-1).visitors, 1);
  } finally { await f.close(); }
});

test('访问入口限制来源和输入，后台统计需要登录且只返回汇总', { skip: !visitsTestAvailable && '需要 PGLITE_MODULE_PATH', timeout: 30000 }, async () => {
  const f = await visitFixture(), password = 'isolated-admin-password';
  const admin = readAdminConfig({ ADMIN_USERNAME: 'test', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 'test-'.repeat(10), ADMIN_COOKIE_SECURE: 'false' });
  const server = createInvitationApp({ visits: f, admin }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = f.config.origin = `http://127.0.0.1:${server.address().port}`;
  const send = (input, extra = {}) => fetch(origin + '/api/visits', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'User-Agent': wechat, ...extra }, body: JSON.stringify(input) });
  try {
    const input = body();
    assert.equal((await send(input, { Origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await send({ ...input, visitId: 'bad' })).status, 400);
    assert.equal((await send(input, { 'User-Agent': 'Googlebot/2.1' })).status, 200);
    assert.equal((await f.store.snapshot()).visitors, 0);
    const accepted = await send(input); assert.equal(accepted.status, 200); assert.equal(accepted.headers.get('cache-control'), 'no-store');
    assert.equal((await send(input)).status, 200);
    assert.equal((await fetch(origin + '/admin/api/visits')).status, 401);
    const login = await fetch(origin + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test', password }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const snapshot = await (await fetch(origin + '/admin/api/visits', { headers: { Cookie: cookie } })).json();
    assert.equal(snapshot.visitors, 1); assert.equal(snapshot.opens, 1);
    assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(input.visitorId + '|' + input.visitId + '|visitor_hash|phone|userAgent'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close(); }
});
