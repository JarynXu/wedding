import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createInvitationApp } from '../server/app.js';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';
import { visitFixture, visitsTestAvailable } from './visits-fixture.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch { /* 缺少浏览器依赖时由测试状态标识。 */ }
const wechat = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.60';
async function until(condition) {
  const limit = Date.now() + 10000;
  while (!await condition()) { if (Date.now() > limit) throw Error('等待统计更新超时'); await new Promise(resolve => setTimeout(resolve, 50)); }
}

test('微信匿名访问去重、存储降级、重试与手机后台', { skip: !visitsTestAvailable ? '需要 PGLITE_MODULE_PATH' : !chromium && '需要 Playwright 浏览器依赖', timeout: 120000 }, async suite => {
  const f = await visitFixture(), password = 'isolated-visit-admin';
  const admin = readAdminConfig({ ADMIN_USERNAME: 'test', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 'browser-test-'.repeat(4), ADMIN_COOKIE_SECURE: 'false' });
  const server = createInvitationApp({ visits: f, admin }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = f.config.origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  const makeContext = async init => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: wechat });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    if (init) await context.addInitScript(init);
    return context;
  };
  await mkdir('.temp/visits-qa', { recursive: true });
  try {
    await suite.test('刷新、多标签页、相同浏览器信息与清除存储', async () => {
      const context = await makeContext(), other = await makeContext();
      try {
        const page = await context.newPage(); await page.goto(origin + '/?theme=chinese');
        await until(async () => (await f.store.snapshot()).opens === 1);
        await page.reload(); await until(async () => (await f.store.snapshot()).opens === 2);
        assert.equal((await f.store.snapshot()).visitors, 1);
        const tabs = await Promise.all([context.newPage(), context.newPage()]);
        await Promise.all(tabs.map(tab => tab.goto(origin + '/')));
        await until(async () => (await f.store.snapshot()).opens === 4);
        assert.equal((await f.store.snapshot()).visitors, 1);
        const another = await other.newPage(); await another.goto(origin + '/');
        await until(async () => (await f.store.snapshot()).opens === 5);
        assert.equal((await f.store.snapshot()).visitors, 2, '同型号同微信版本也不能合并成一个人');
        await page.evaluate(() => localStorage.removeItem('wedding.visitor.v1'));
        await page.reload(); await until(async () => (await f.store.snapshot()).opens === 6);
        assert.equal((await f.store.snapshot()).visitors, 3, 'Cookie 不恢复已经清除的长期编号');
        const raw = await f.pool.query('SELECT visitor_hash FROM wedding_visitors');
        const stored = await page.evaluate(() => localStorage.getItem('wedding.visitor.v1'));
        assert.ok(raw.rows.every(row => row.visitor_hash !== stored));
      } finally { await context.close(); await other.close(); }
    });

    await suite.test('新浏览器同时打开多个标签页只创建一个访客', async () => {
      const before = await f.store.snapshot(), context = await makeContext();
      try {
        const pages = await Promise.all([context.newPage(), context.newPage()]);
        await Promise.all(pages.map(page => page.goto(origin + '/')));
        await until(async () => (await f.store.snapshot()).opens === before.opens + 2);
        assert.equal((await f.store.snapshot()).visitors, before.visitors + 1);
      } finally { await context.close(); }
    });

    await suite.test('浏览器拒绝跟踪时不写入编号或上报访问', async () => {
      const before = await f.store.snapshot();
      for (const key of ['globalPrivacyControl', 'doNotTrack']) {
        const context = await makeContext();
        await context.addInitScript(key => Object.defineProperty(navigator, key, { get: () => key === 'globalPrivacyControl' ? true : '1' }), key);
        const page = await context.newPage(), requests = [];
        page.on('request', request => { if (request.url().endsWith('/api/visits')) requests.push(request.url()); });
        try {
          await page.clock.install();
          await page.goto(origin + '/');
          await page.locator('#btnEnterInvitation').waitFor({ state: 'attached' });
          await page.clock.fastForward(60000);
          assert.deepEqual(requests, []);
          assert.equal(await page.evaluate(() => localStorage.getItem('wedding.visitor.v1')), null);
        } finally { await context.close(); }
      }
      assert.equal((await f.store.snapshot()).opens, before.opens);
    });

    await suite.test('长期和会话存储都不可用时使用本站 Cookie', async () => {
      const before = await f.store.snapshot();
      const context = await makeContext(() => {
        for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Disabled', 'SecurityError'); } });
      });
      try {
        const page = await context.newPage(); await page.goto(origin + '/');
        await until(async () => (await f.store.snapshot()).opens === before.opens + 1);
        await page.reload(); await until(async () => (await f.store.snapshot()).opens === before.opens + 2);
        assert.equal((await f.store.snapshot()).visitors, before.visitors + 1);
        assert.equal((await context.cookies(origin + '/api/visits')).find(cookie => cookie.name === 'wedding_visit')?.httpOnly, true);
      } finally { await context.close(); }
    });

    await suite.test('响应丢失后重试不加次数，后台暂停上报，返回继续心跳', async () => {
      const before = await f.store.snapshot(), context = await makeContext();
      try {
        const page = await context.newPage(); await page.clock.install();
        let dropped = false; const sent = [];
        await page.route('**/api/visits', async route => {
          sent.push(route.request().postDataJSON());
          if (!dropped) { dropped = true; await route.fetch(); await route.abort(); }
          else await route.continue();
        });
        await page.goto(origin + '/'); await until(async () => (await f.store.snapshot()).opens === before.opens + 1);
        await until(() => dropped); await page.waitForTimeout(100);
        await page.clock.fastForward(12000); await until(() => sent.length >= 2);
        assert.equal(sent[0].visitId, sent[1].visitId);
        assert.equal((await f.store.snapshot()).opens, before.opens + 1);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        const hiddenCount = sent.length; await page.clock.fastForward(90000); assert.equal(sent.length, hiddenCount);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
        await until(() => sent.length > hiddenCount); assert.equal(sent.at(-1).event, 'ping');
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
        const paused = sent.length; await page.clock.fastForward(60000); assert.equal(sent.length, paused);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
        await until(() => sent.length > paused);
        assert.equal((await f.store.snapshot()).opens, before.opens + 1);
      } finally { await context.close(); }
    });

    await suite.test('后台显示汇总，手机不溢出，统计失败显示未知而非零', async () => {
      const before = await f.store.snapshot(), context = await makeContext(), page = await context.newPage();
      try {
        await page.goto(origin + '/admin');
        await page.locator('#username').fill('test'); await page.locator('#password').fill(password); await page.locator('#loginButton').click();
        await page.locator('#visitsPanel[data-state=ready]').waitFor();
        assert.equal(await page.locator('[data-visit-stat=visitors]').innerText(), String(before.visitors));
        assert.equal(await page.locator('[data-visit-stat=opens]').innerText(), String(before.opens));
        assert.match(await page.locator('[data-visit-browsers]').innerText(), /微信.*100%/s);
        assert.equal(await page.locator('.visit-day-button').count(), 7);
        await page.locator('.visit-day-button').last().click(); assert.match(await page.locator('[data-visit-day-summary]').innerText(), /位访客.*次打开/);
        for (const [width, height] of [[390, 844], [320, 568], [1280, 900]]) {
          await page.setViewportSize({ width, height });
          assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
          await page.screenshot({ path: `.temp/visits-qa/admin-${width}.png`, animations: 'disabled' });
        }
        assert.equal((await f.store.snapshot()).opens, before.opens, '后台本身不记为请柬访问');
        await page.route('**/admin/api/visits', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '隔离统计失败' }) }));
        await page.locator('#refreshButton').click(); await page.locator('#visitsPanel[data-state=unavailable]').waitFor();
        assert.equal(await page.locator('[data-visit-stat=visitors]').innerText(), '—');
        assert.equal(await page.locator('[data-visits-details]').isVisible(), false);
        await page.unroute('**/admin/api/visits'); await page.locator('#refreshButton').click(); await page.locator('#visitsPanel[data-state=ready]').waitFor();
      } finally { await context.close(); }
    });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await f.close(); }
});
