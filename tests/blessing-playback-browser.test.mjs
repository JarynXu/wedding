import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const blessing = id => ({ id: String(id), requestId: `fixture-${id}`, name: `亲友 ${id}`, text: '愿你们岁岁相伴，年年欢喜。',
  gift: 'fireworks', giftName: '烟花', giftCount: 1, theme: 'chinese', createdAt: '2026-09-28T00:00:00.000Z' });

test('手机双主题持续轮播、实时优先、弹窗与后台恢复、减少动态效果', { timeout: 180000 }, async suite => {
  const history = Array.from({ length: 12 }, (_, i) => blessing(i + 1));
  const streams = new Set();
  let historyRequests = 0;
  const app = express();
  app.get('/api/game/config', (_req, res) => res.json({ enabled: false }));
  app.get('/api/game/me', (_req, res) => res.status(401).json({ error: 'AUTH_REQUIRED' }));
  app.get('/api/blessings/config', (_req, res) => res.json({ enabled: true, generation: 0 }));
  app.get('/api/blessings/history', (_req, res) => { historyRequests++; res.json({ messages: [...history].reverse(), hasMore: false }); });
  app.get('/api/blessings/stream', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(`event: sync\ndata: ${JSON.stringify({ messages: req.query.after ? [] : history.slice(-6), cursor: '12', generation: 0 })}\n\n`);
    streams.add(res);
    res.on('close', () => streams.delete(res));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use(express.static('dist'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir('.temp/blessing-playback-qa', { recursive: true });
  try {
    for (const [theme, reducedMotion] of [['classic', 'no-preference'], ['chinese', 'no-preference'], ['chinese', 'reduce']]) {
      await suite.test(`${theme} / ${reducedMotion}`, async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const initialRequests = historyRequests;
        try {
          await page.clock.install();
          await page.addInitScript(() => {
            window.bubbleLog = []; window.giftStarts = 0; window.maximumBubbles = 0;
            new MutationObserver(records => {
              for (const record of records) {
                for (const node of record.addedNodes || []) if (node.matches?.('.blessing-bubble')) {
                  window.bubbleLog.push({ id: node.dataset.messageId, time: Date.now() });
                  window.maximumBubbles = Math.max(window.maximumBubbles, node.parentElement?.children.length || 0);
                }
                if (record.type === 'attributes' && record.target.matches('.gift-effects') && record.target.dataset.state === 'playing') window.giftStarts++;
              }
            }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
          });
          await page.goto(`${origin}/?theme=${theme}`);
          await page.locator('#preloaderOverlay[data-state=ready]').waitFor();
          await page.locator('#btnEnterInvitation').click();
          await page.locator('#blessingEntry[data-connection=connected]').waitFor();
          await page.locator('.blessing-bubble').first().waitFor();
          assert.equal(await page.evaluate(() => window.giftStarts), 0, '历史祝福不触发烟花');
          if (reducedMotion === 'no-preference') await page.waitForFunction(() => window.bubbleLog.length >= 2);
          await page.waitForTimeout(900);
          await page.screenshot({ path: `.temp/blessing-playback-qa/${theme}-${reducedMotion}.png` });
          const layout = await page.locator('.blessing-bubble').evaluateAll(nodes => nodes.map(node => {
            const box = node.getBoundingClientRect();
            return { x: box.x, right: box.right, bottom: box.bottom, transform: getComputedStyle(node).transform };
          }));
          assert.ok(layout.every(box => box.x >= 0 && box.right <= 390 && box.bottom <= 844));
          if (reducedMotion === 'reduce') assert.ok(layout.every(box => box.transform === 'none'));
          await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 20);
          const startedAt = await page.evaluate(() => Date.now());
          await page.clock.runFor(35000);
          const activity = await page.evaluate(() => ({ log: window.bubbleLog, maximum: window.maximumBubbles, gifts: window.giftStarts }));
          assert.ok(activity.log.filter(item => item.time > startedAt + 20000).length >= 2, '首次三条播放完以后仍继续出场');
          assert.ok(new Set(activity.log.map(item => item.id)).size >= 6, '轮播持续展示不同的历史祝福');
          assert.ok(activity.log.some(item => Number(item.id) <= 6), '播放范围包含最初快照以外的历史祝福');
          assert.ok(activity.maximum <= (reducedMotion === 'reduce' ? 1 : 2));
          assert.equal(activity.gifts, 0);
          assert.equal(historyRequests - initialRequests, 1, '轮播复用本机记录，不反复请求历史');

          const fresh = blessing(99);
          for (const stream of streams) stream.write(`event: blessing\ndata: ${JSON.stringify(fresh)}\n\n`);
          await page.waitForTimeout(100);
          await page.clock.runFor(4200);
          assert.ok(await page.evaluate(() => window.bubbleLog.some(item => item.id === '99')), '新祝福优先出场');
          for (const stream of streams) stream.write(`event: blessing\ndata: ${JSON.stringify(fresh)}\n\n`);
          await page.waitForTimeout(100);
          await page.clock.fastForward(16000);
          assert.equal(await page.evaluate(() => window.giftStarts), reducedMotion === 'reduce' ? 0 : 1, '重复事件和后续轮播都不重播礼物特效');

          await page.locator('#blessingEntry').dispatchEvent('click');
          assert.equal(await page.locator('#blessingsModal.open').count(), 1);
          const beforeModal = await page.evaluate(() => window.bubbleLog.length);
          await page.clock.fastForward(14000);
          assert.equal(await page.evaluate(() => window.bubbleLog.length), beforeModal, '填写祝福时暂停出场');
          await page.locator('#blessingsModal .modal-close').dispatchEvent('click');
          assert.equal(await page.locator('#blessingsModal.open').count(), 0);
          await page.clock.runFor(1600);
          assert.ok(await page.evaluate(() => window.bubbleLog.length) > beforeModal);

          await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
          const beforeHidden = await page.evaluate(() => window.bubbleLog.length);
          await page.clock.fastForward(16000);
          assert.equal(await page.locator('.blessing-bubble').count(), 0);
          assert.equal(await page.evaluate(() => window.bubbleLog.length), beforeHidden);
          await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
          await page.clock.runFor(700);
          assert.ok(await page.evaluate(() => window.bubbleLog.length) > beforeHidden, '页面返回后无需新消息即可恢复轮播');
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    await suite.test('实时连接暂不可用时，仍能从历史记录开始展示', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      try {
        await page.route('**/api/blessings/stream*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
        await page.goto(origin);
        await page.locator('#preloaderOverlay[data-state=ready]').waitFor();
        await page.locator('#btnEnterInvitation').click();
        await page.locator('.blessing-bubble').first().waitFor({ timeout: 5000 });
        assert.equal(await page.locator('.gift-effects').getAttribute('data-state'), 'idle');
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
    for (const stream of streams) stream.end();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
