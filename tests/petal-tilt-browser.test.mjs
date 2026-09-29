import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const options = { headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) };

// 记录实际画布上的花瓣中心，不读取或替换运动实现。
function recordPetals(permission) {
  window.permissionCalls = 0;
  DeviceOrientationEvent.requestPermission = async () => { window.permissionCalls++; return permission; };
  window.petalFrames = [];
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  const translate = CanvasRenderingContext2D.prototype.translate;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.id === 'petalsCanvas' || this.canvas.parentElement?.classList.contains('game-atmosphere')) {
      this.petalFrame = { time: performance.now(), points: [] };
      window.petalFrames.push(this.petalFrame);
      if (window.petalFrames.length > 240) window.petalFrames.shift();
    }
    return clear.apply(this, args);
  };
  CanvasRenderingContext2D.prototype.translate = function (x, y) {
    this.petalFrame?.points.push({ x, y });
    return translate.call(this, x, y);
  };
}

const velocity = frame => frame.evaluate(() => {
  const frames = window.petalFrames.filter(frame => frame.points.length > 10);
  const last = frames.at(-1), first = frames.find(frame => frame.time >= last.time - 350);
  const elapsed = (last.time - first.time) / 1000;
  const deltas = last.points.map((point, index) => ({ x: point.x - first.points[index].x, y: point.y - first.points[index].y }))
    .filter(delta => Math.abs(delta.x) < 80 && Math.abs(delta.y) < 80);
  return { x: deltas.reduce((sum, delta) => sum + delta.x, 0) / deltas.length / elapsed,
    y: deltas.reduce((sum, delta) => sum + delta.y, 0) / deltas.length / elapsed };
});

const orient = (page, beta, gamma) => page.evaluate(({ beta, gamma }) => {
  window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma }));
}, { beta, gamma });

test('倾斜连续改变实际花瓣方向，活动沿用授权，拒绝授权仍能飘落', { timeout: 60000 }, async suite => {
  const app = express();
  app.get('/api/game/config', (_req, res) => res.json({ enabled: true, phase: 'open', version: 1,
    questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}`, title: '', opening: '' })),
    requiredCorrect: 6, participationLimit: 200, closesAt: '2026-10-17T03:00:00.000Z',
    prizes: { first: '大玩偶', second: '玩偶', third: '小玩偶', participation: '小红包' } }));
  app.get('/api/blessings/config', (_req, res) => res.json({ enabled: false }));
  app.use('/api', (_req, res) => res.status(503).json({ error: { message: '测试服务未启用' } }));
  app.use(express.static('dist'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch(options);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir('.temp/tilt-qa', { recursive: true });
  try {
    for (const permission of ['granted', 'denied']) await suite.test(permission, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(recordPetals, permission);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(origin + '/?theme=chinese');
        await page.locator('#preloaderOverlay[data-state=ready]').waitFor();
        assert.equal(await page.evaluate(() => window.permissionCalls), 0);
        await page.locator('#btnEnterInvitation').click();
        await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.permissionCalls), 1);
        if (permission === 'denied') {
          await orient(page, -90, 0);
          await page.waitForTimeout(1800);
          assert.ok((await velocity(page)).y > 15, '拒绝授权后不会接受倾斜输入或停止飘落');
        } else {
          await orient(page, 25, 65);
          await page.waitForTimeout(1800);
          assert.ok((await velocity(page)).x > 20, '花瓣逐渐向右下方飘落');
          await page.screenshot({ path: '.temp/tilt-qa/right.png' });
          await orient(page, 25, -65);
          await page.waitForTimeout(90);
          assert.ok((await velocity(page)).x > 0, '突然左倾时，正在移动的花瓣保留向右的惯性');
          await page.waitForTimeout(1800);
          assert.ok((await velocity(page)).x < -10, '随后转向左侧，不能固守出生时的方向');
          await page.screenshot({ path: '.temp/tilt-qa/left.png' });
          await page.locator('.nav-dot[data-index="3"]').click();
          await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
          await page.locator('#gameEntry:not([hidden])').click();
          const child = await page.locator('.invitation-game-layer iframe').elementHandle().then(handle => handle.contentFrame());
          await child.locator('.game-atmosphere canvas[data-state=ready]').waitFor({ state: 'attached' });
          await orient(page, 25, 65);
          await page.waitForTimeout(1800);
          assert.ok((await velocity(child)).x > 20, '请柬将倾斜读数传入活动页面');
          assert.equal(await child.evaluate(() => window.permissionCalls), 0, '内嵌活动不重复请求授权');
          await page.goBack();
          await page.locator('.invitation-game-layer[open]').waitFor({ state: 'hidden' });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForFunction(() => {
          const canvas = document.getElementById('petalsCanvas');
          return !canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value);
        });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
