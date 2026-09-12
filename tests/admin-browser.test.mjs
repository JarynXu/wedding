import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch { /* 缺少浏览器依赖时由测试状态标识。 */ }

test('手机尺寸后台登录后无横向溢出', { skip: !chromium && '需要 Playwright 浏览器依赖', timeout: 60000 }, async () => {
  const password = 'test-admin-password';
  const config = readAdminConfig({ ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 's'.repeat(32), ADMIN_COOKIE_SECURE: 'false' });
  const blessings = { streams: new Set(), store: { async dashboardStats() { return { totalCount: '3', lastSavedAt: '2026-09-12T03:04:05.000Z' }; } }, hub: { status: () => ({ state: 'ready' }) } };
  const server = createInvitationApp({ distDir: resolve('.'), admin: config, blessings, buildInfo: { version: '1.2.3', build: 'mobile-test' } }).listen(0, '127.0.0.1');
  await new Promise(resolveListening => server.once('listening', resolveListening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill('jaryn');
    await page.locator('#password').fill(password);
    await page.locator('#loginButton').click();
    await page.locator('#dashboardView:not([hidden])').waitFor();
    const layout = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth, cards: [...document.querySelectorAll('.metric-card')].map(card => [card.clientWidth, card.scrollWidth]), count: document.querySelector('#blessingCount').textContent }));
    assert.ok(layout.body <= layout.viewport + 1);
    assert.ok(layout.cards.every(([width, scroll]) => scroll <= width + 1));
    assert.equal(layout.count, '3 条');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
  }
});
