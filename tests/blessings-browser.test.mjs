import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { databaseUrl, fixture, payload, post } from './blessings-fixture.mjs';
const require = createRequire(import.meta.url);
const enter = async (page, origin, query = '') => {
  await page.goto(origin + '/' + query, { waitUntil: 'domcontentloaded' });
  await page.locator('#preloaderOverlay[data-state="ready"]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('#blessingEntry').isVisible(), false);
  await page.locator('#btnEnterInvitation').click();
  await page.locator('#blessingEntry[data-connection="connected"]').waitFor({ timeout: 15000 });
};
test('手机双主题：送出、实时收取、祝福簿、重试与动态效果', { skip: !databaseUrl && '需要隔离 PostgreSQL', timeout: 100000 }, async suite => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const f = await fixture();
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  try {
    const a = await f.instance(); const b = await f.instance();
    const classic = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const chinese = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let rejectedStream = false;
    await chinese.route('**/api/blessings/stream*', async route => {
      if (!rejectedStream) { rejectedStream = true; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"UNAVAILABLE"}' }); }
      else await route.continue();
    });
    for (const page of [classic, chinese]) page.on('pageerror', error => errors.push(error.message));
    await Promise.all([enter(classic, a.origin), enter(chinese, b.origin, '?theme=chinese&side=groom&parents=测试父母')]);
    assert.equal(rejectedStream, true, '首次 SSE 503 后可恢复连接');
    await suite.test('两套主题展示各自礼物，弹窗保持毛玻璃，手机尺寸不溢出', async () => {
      for (const [page, theme, expected] of [[classic, 'classic', ['rose', 'champagne', 'fireworks']], [chinese, 'chinese', ['fireworks', 'lantern', 'knot', 'double-happiness']]]) {
        await page.locator('#blessingEntry').click();
        assert.deepEqual(await page.locator('.blessing-gift-options button').evaluateAll(nodes => nodes.map(node => node.dataset.gift)), expected);
        for (const [width, height] of [[320, 568], [375, 667], [390, 844], [414, 896], [768, 1024]]) {
          await page.setViewportSize({ width, height });
          const layout = await page.locator('.blessings-card').evaluate(card => ({ width: card.clientWidth, scroll: card.scrollWidth, blur: getComputedStyle(card).backdropFilter, body: document.body.scrollWidth, viewport: innerWidth, inputSize: getComputedStyle(card.querySelector('input')).fontSize }));
          assert.ok(layout.scroll <= layout.width + 1); assert.ok(layout.body <= layout.viewport); assert.match(layout.blur, /blur/); assert.equal(layout.inputSize, '16px');
          const send = page.locator('.blessing-send'); await send.scrollIntoViewIfNeeded(); assert.equal(await send.isVisible(), true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.blessings-card').evaluate(card => { card.scrollTop = 0; });
        if (process.env.WEDDING_QA_DIR) { await page.waitForTimeout(350); await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, `blessings-${theme}.png`) }); }
        await page.locator('#blessingsModal .modal-close').click();
      }
    });
    await suite.test('一端送出礼物，另一端收到气泡和画布效果；正文按纯文本保存', async () => {
      await classic.locator('#blessingEntry').click();
      await classic.locator('#blessingName').fill('测试亲友');
      await classic.locator('#blessingMessage').fill('幸福长久 <b>愿岁岁欢喜</b>');
      await classic.locator('[data-gift="fireworks"]').click();
      await classic.locator('.blessing-send').click();
      await classic.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      await chinese.locator('.blessing-bubble').filter({ hasText: '幸福长久' }).waitFor();
      await chinese.locator('.gift-effects[data-state="playing"][data-gift="fireworks"]').waitFor();
      assert.equal(await chinese.locator('.blessing-bubble b').count(), 0);
      const draw = await chinese.locator('.gift-effects').evaluate(async canvas => {
        const sums = [];
        for (let i = 0; i < 12; i++) { await new Promise(resolve => setTimeout(resolve, 75)); const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let sum = 0; for (let a = 3; a < pixels.length; a += 4) sum += pixels[a]; sums.push(sum); }
        return sums;
      });
      assert.ok(Math.max(...draw) > 0); assert.ok(new Set(draw).size > 3, '礼物画布有实际变化');
      if (process.env.WEDDING_QA_DIR) await chinese.screenshot({ path: join(process.env.WEDDING_QA_DIR, 'blessings-live.png') });
      await chinese.locator('#blessingEntry').click(); await chinese.locator('[data-tab="history"]').click();
      await chinese.locator('.blessing-history-item').filter({ hasText: '幸福长久' }).waitFor();
      assert.equal(await chinese.locator('.blessing-history-item b').count(), 0);
      assert.match(await chinese.locator('.blessing-history-item').innerText(), /送来烟花/);
      if (process.env.WEDDING_QA_DIR) { await chinese.waitForTimeout(450); await chinese.screenshot({ path: join(process.env.WEDDING_QA_DIR, 'blessings-history.png') }); }
      await chinese.locator('#blessingsModal .modal-close').click();
    });
    await suite.test('翻页保持同一个祝福入口与连接；返回首屏不被遮住', async () => {
      const connectionCount = await chinese.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/stream')).length);
      for (let index = 1; index < 4; index++) {
        await chinese.locator(`.nav-dot[data-index="${index}"]`).click();
        await chinese.locator(`.nav-dot[data-index="${index}"][aria-current="page"]`).waitFor();
        await chinese.waitForTimeout(900);
        assert.equal(await chinese.locator('#blessingEntry').count(), 1);
        assert.equal(await chinese.locator('#blessingEntry').isVisible(), true);
      }
      assert.equal(await chinese.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/stream')).length), connectionCount);
      await chinese.locator('.nav-dot[data-index="0"]').click(); await chinese.waitForTimeout(900);
      const layout = await chinese.locator('#blessingEntry').evaluate(entry => {
        const e = entry.getBoundingClientRect(); const next = document.querySelector('.page-1 .scroll-arrow').getBoundingClientRect();
        return { overlap: e.right > next.left && e.left < next.right && e.top < next.bottom && e.bottom > next.top, hit: document.elementFromPoint(e.x + e.width / 2, e.y + e.height / 2)?.closest('#blessingEntry') !== null };
      });
      assert.equal(layout.overlap, false); assert.equal(layout.hit, true);
    });
    await suite.test('保存后丢失响应：保留请求，重试只产生一条记录', async () => {
      let intercept = true;
      await classic.route('**/api/blessings', async route => { if (intercept && route.request().method() === 'POST') { intercept = false; await route.fetch(); await route.abort(); } else await route.continue(); });
      await classic.locator('#blessingEntry').click(); await classic.locator('#blessingMessage').fill('响应中断测试');
      await classic.locator('.blessing-send').click();
      await classic.locator('.blessing-result').filter({ hasText: '暂未确认送达' }).waitFor();
      assert.equal(await classic.locator('#blessingMessage').inputValue(), '响应中断测试');
      await classic.locator('.blessing-send').click(); await classic.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      const rows = await f.db.query('SELECT count(*)::int AS count FROM wedding_blessings WHERE room_id=$1 AND message=$2', [f.config.room, '响应中断测试']); assert.equal(rows.rows[0].count, 1);
      await classic.unroute('**/api/blessings');
    });
    await suite.test('暂停飘屏、礼物单独发送、减少动态效果和历史重载', async () => {
      await chinese.locator('#blessingEntry').click(); await chinese.locator('#blessingFloat').uncheck(); await chinese.locator('#blessingsModal .modal-close').click();
      await post(a.origin, payload({ text: '静音显示测试', gift: 'rose' }));
      await chinese.waitForTimeout(500);
      assert.equal(await chinese.locator('.blessing-bubble').count(), 0);
      await chinese.locator('#blessingEntry').click(); await chinese.locator('#blessingFloat').check(); await chinese.locator('[data-gift="lantern"]').click(); await chinese.locator('.blessing-send').click();
      await chinese.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      await chinese.emulateMedia({ reducedMotion: 'reduce' });
      await chinese.reload(); await chinese.locator('#preloaderOverlay[data-state="ready"]').waitFor(); await chinese.locator('#btnEnterInvitation').click();
      await chinese.locator('#blessingEntry[data-connection="connected"]').waitFor();
      assert.equal(await chinese.locator('.gift-effects[data-state="playing"]').count(), 0);
      await chinese.locator('#blessingEntry').click(); await chinese.locator('[data-tab="history"]').click(); await chinese.locator('.blessing-history-item').filter({ hasText: '送来喜灯' }).waitFor();
      await chinese.keyboard.press('Escape'); assert.equal(await chinese.locator('#blessingsModal').getAttribute('inert'), '');
      assert.equal(await chinese.evaluate(() => document.activeElement.id), 'blessingEntry');
    });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await f.close(); }
});
