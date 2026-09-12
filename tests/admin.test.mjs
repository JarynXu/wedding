import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';
import { createBlessingsService } from '../server/blessings/service.js';
import { createInvitationApp } from '../server/app.js';
import { databaseUrl, fixture, waitFor } from './blessings-fixture.mjs';

const password = 'test-admin-password';

test('管理后台配置要求服务端凭据并区分未配置状态', async () => {
  assert.equal(readAdminConfig({}), null);
  assert.equal(readAdminConfig({ ADMIN_ENABLED: 'false', ADMIN_USERNAME: 'jaryn' }), null);
  assert.throws(() => readAdminConfig({ ADMIN_ENABLED: 'true' }), /ADMIN_USERNAME/);
  const hash = await hashPassword(password, { salt: Buffer.from('test-admin-salt-16') });
  const config = readAdminConfig({ ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: hash, ADMIN_SESSION_SECRET: 's'.repeat(32), ADMIN_COOKIE_SECURE: 'false' });
  assert.equal(config.username, 'jaryn');
  assert.equal(config.cookieSecure, false);
  assert.throws(() => readAdminConfig({ ADMIN_USERNAME: 'jaryn' }), /ADMIN_PASSWORD_HASH/);
  assert.throws(() => readAdminConfig({ ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: 'plain', ADMIN_SESSION_SECRET: 's'.repeat(32) }), /ADMIN_PASSWORD_HASH/);
});

test('管理后台登录、会话、登出和状态快照', async () => {
  const config = await adminConfig();
  const startedAt = new Date(Date.now() - 3725000);
  const blessings = fakeBlessings({ totalCount: '12', lastSavedAt: '2026-09-12T03:04:05.000Z', hubState: 'ready', connections: 2 });
  await withServer({ admin: config, blessings, startedAt, buildInfo: { version: '1.2.3', build: 'build-abc', buildTime: '2026-09-12T02:03:04.000Z', buildSource: 'test' } }, async origin => {
    const page = await fetch(origin + '/admin');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /运行后台/);
    assert.doesNotMatch(html, /Mcptt\.123|test-admin-password/);
    assert.equal((await fetch(origin + '/admin/admin.js')).status, 200);
    assert.equal((await fetch(origin + '/admin/admin.css')).status, 200);
    assert.equal((await fetch(origin + '/admin/password.js')).status, 404);
    assert.equal((await fetch(origin + '/admin/api/status')).status, 401);

    const invalid = await login(origin, 'wrong-password');
    assert.equal(invalid.status, 401);
    const signedIn = await login(origin, password);
    assert.equal(signedIn.status, 200);
    const cookieHeader = signedIn.headers.get('set-cookie');
    assert.match(cookieHeader, /^admin_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Path=\/admin; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
    const cookie = cookieHeader.split(';', 1)[0];

    const statusResponse = await fetch(origin + '/admin/api/status', { headers: { Cookie: cookie } });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.application.version, '1.2.3');
    assert.equal(status.application.build, 'build-abc');
    assert.equal(status.application.buildTime, '2026-09-12T02:03:04.000Z');
    assert.equal(status.application.commit, 'unknown');
    assert.equal(status.database.connection, 'connected');
    assert.equal(status.database.read, 'ready');
    assert.equal(status.blessings.totalCount, '12');
    assert.equal(status.blessings.lastSavedAt, '2026-09-12T03:04:05.000Z');
    assert.equal(status.notifications.sseListener, 'ready');
    assert.equal(status.instance.realtimeConnections, 2);
    assert.equal(status.instance.realtimeConnectionScope, 'current_instance');
    assert.ok(status.instance.uptimeSeconds >= 3725);
    assert.equal(status.scope.realtimeConnections, 'current_instance_only');

    const tampered = await fetch(origin + '/admin/api/status', { headers: { Cookie: cookie.replace(/.$/, cookie.endsWith('a') ? 'b' : 'a') } });
    assert.equal(tampered.status, 401);
    const loggedOut = await fetch(origin + '/admin/api/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(loggedOut.status, 204);
    assert.match(loggedOut.headers.get('set-cookie'), /^admin_session=; Path=\/admin; HttpOnly; SameSite=Strict; Max-Age=0$/);
    assert.equal((await fetch(origin + '/admin/api/status')).status, 401);
  });
});

test('共享会话密钥允许跨实例访问，退出登录清除本机 Cookie 但不伪造全局撤销', async () => {
  const config = await adminConfig();
  const first = await startServer({ admin: config, blessings: fakeBlessings() });
  const second = await startServer({ admin: config, blessings: fakeBlessings() });
  try {
    const signedIn = await login(first.origin, password);
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get('set-cookie').split(';', 1)[0];
    assert.equal((await fetch(second.origin + '/admin/api/status', { headers: { Cookie: cookie } })).status, 200);
    const loggedOut = await fetch(second.origin + '/admin/api/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(loggedOut.status, 204);
    assert.equal((await fetch(second.origin + '/admin/api/status')).status, 401);
    assert.equal((await fetch(first.origin + '/admin/api/status', { headers: { Cookie: cookie } })).status, 200);
  } finally {
    await first.stop();
    await second.stop();
  }
});

test('登录限额阻止继续尝试，数据库故障返回未知而非假在线', async () => {
  const config = await adminConfig({ ADMIN_LOGIN_MAX_ATTEMPTS: '2' });
  const blessings = fakeBlessings({ error: new Error('isolated database failure'), hubState: 'unavailable', connections: 1 });
  await withServer({ admin: config, blessings }, async origin => {
    assert.equal((await login(origin, 'wrong-password')).status, 401);
    assert.equal((await login(origin, 'wrong-password')).status, 401);
    const limited = await login(origin, password);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);

    const freshConfig = await adminConfig();
    await withServer({ admin: freshConfig, blessings }, async secondOrigin => {
      const signedIn = await login(secondOrigin, password);
      const cookie = signedIn.headers.get('set-cookie').split(';', 1)[0];
      const response = await fetch(secondOrigin + '/admin/api/status', { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      const status = await response.json();
      assert.equal(status.database.connection, 'unavailable');
      assert.equal(status.database.read, 'unavailable');
      assert.equal(status.blessings.totalCount, null);
      assert.equal(status.blessings.lastSavedAt, null);
      assert.equal(status.notifications.sseListener, 'unavailable');
      assert.equal(status.instance.realtimeConnections, 1);
    });
  });
});

test('后台未配置时接口返回 503，页面本身仍不宣称服务在线', async () => {
  await withServer({}, async origin => {
    assert.equal((await fetch(origin + '/admin')).status, 200);
    const loginResponse = await login(origin, password);
    assert.equal(loginResponse.status, 503);
    assert.deepEqual(await loginResponse.json(), { error: 'ADMIN_NOT_CONFIGURED', message: '管理后台尚未配置' });
    const status = await fetch(origin + '/admin/api/status');
    assert.equal(status.status, 503);
  });
});

test('后台状态查询使用真实祝福 Store 的隔离 room', { skip: !databaseUrl && '需要 BLESSINGS_TEST_DATABASE_URL 指向隔离 PostgreSQL', timeout: 60000 }, async () => {
  const f = await fixture();
  const service = createBlessingsService(f.config);
  const config = await adminConfig();
  const server = createInvitationApp({ distDir: resolve('dist'), admin: config, blessings: service }).listen(0, '127.0.0.1');
  await new Promise(resolveListening => server.once('listening', resolveListening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await waitFor(() => service.hub.ready, 15000);
    const signedIn = await login(origin, password);
    const cookie = signedIn.headers.get('set-cookie').split(';', 1)[0];
    const response = await fetch(origin + '/admin/api/status', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.database.connection, 'connected');
    assert.equal(status.database.read, 'ready');
    assert.equal(status.blessings.totalCount, '0');
    assert.equal(status.blessings.lastSavedAt, null);
    assert.equal(status.notifications.sseListener, 'ready');
  } finally {
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
    await service.close();
    await f.close();
  }
});

async function adminConfig(overrides = {}) {
  return readAdminConfig({ ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 's'.repeat(32), ADMIN_COOKIE_SECURE: 'false', ...overrides });
}

function fakeBlessings({ totalCount = '0', lastSavedAt = null, error = null, hubState = 'ready', connections = 0 } = {}) {
  const streams = new Set(Array.from({ length: connections }, () => () => {}));
  return {
    streams,
    store: { async dashboardStats() { if (error) throw error; return { totalCount, lastSavedAt }; } },
    hub: { status: () => ({ state: hubState }) },
  };
}

async function withServer(options, callback) {
  const started = await startServer(options);
  try { return await callback(started.origin); } finally { await started.stop(); }
}

async function startServer(options) {
  const app = createInvitationApp({ distDir: resolve('.'), ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolveListening => server.once('listening', resolveListening));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      server.closeAllConnections();
      await new Promise(resolveClosed => server.close(resolveClosed));
    },
  };
}

function login(origin, suppliedPassword) {
  return fetch(origin + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'jaryn', password: suppliedPassword }) });
}
