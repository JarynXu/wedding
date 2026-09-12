import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gameFixture, gameTestDatabase } from './game-fixture.mjs';
const require = createRequire(import.meta.url);

test('请柬内聊天保留音乐、页面与草稿，手机只滚动聊天区', { skip: !gameTestDatabase && '需要隔离数据库', timeout: 60000 }, async () => {
  const f = await gameFixture(), { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const origin = await f.server(), person = await f.participant(42);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: 'wedding_game', value: person.token, url: origin, httpOnly: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const theme of ['classic', 'chinese']) {
      await page.goto(origin + '/?theme=' + theme + '&side=groom&parents=家长');
      await page.locator('#preloaderOverlay[data-state=ready]').waitFor(); await page.locator('#btnEnterInvitation').click();
      await page.locator('.nav-dot[data-index="3"]').click();
      await page.waitForFunction(() => document.querySelector('.page-4.active') && document.querySelector('#swiperWrapper').dataset.transition === 'idle');
      await page.locator('#gameEntry:not([hidden])').waitFor();
      const before = await page.evaluate(() => { window.invitationDocumentProof = crypto.randomUUID(); return { proof: window.invitationDocumentProof, time: document.querySelector('#bgm').currentTime }; });
      await page.locator('#gameEntry').click();
      const frame = page.frameLocator('.invitation-game-layer iframe');
      await frame.locator('.conversation-host').first().waitFor();
      await frame.locator('#gameAnswer').fill('还没发送的心意');
      for (const [width, height] of [[320, 568], [390, 844], [390, 420]]) {
        await page.setViewportSize({ width, height });
        const layout = await frame.locator('body').evaluate(() => {
          const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; };
          return { bodyHeight: document.body.scrollHeight, height: innerHeight, width: innerWidth, bodyWidth: document.body.scrollWidth, input: bounds('.conversation-composer'), back: bounds('#backToInvitation') };
        });
        assert.ok(layout.bodyHeight <= layout.height && layout.bodyWidth <= layout.width, JSON.stringify(layout));
        assert.ok(layout.input.bottom <= layout.height && layout.input.top >= 0); assert.ok(layout.back.top >= 0);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await frame.locator('#gameMenuToggle').click(); await frame.locator('#showGameRules').click();
      await frame.locator('dialog[open]').waitFor(); await frame.locator('.dialog-primary').click();
      await frame.locator('#gameMenuToggle').click(); await frame.locator('[data-game-tab=board]').click();
      await frame.locator('.game-board-note').waitFor();
      await frame.locator('#gameMenuToggle').click(); await frame.locator('[data-game-tab=play]').click();
      assert.equal(await frame.locator('#gameAnswer').inputValue(), '还没发送的心意');
      if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, `integrated-game-${theme}.png`) });
      await frame.locator('#backToInvitation').click(); await page.locator('.invitation-game-layer[open]').waitFor({ state: 'hidden' });
      const after = await page.evaluate(() => ({ proof: window.invitationDocumentProof, time: document.querySelector('#bgm').currentTime, paused: document.querySelector('#bgm').paused, current: document.querySelector('.page.active').dataset.index }));
      assert.equal(after.proof, before.proof); assert.ok(after.time > before.time); assert.equal(after.paused, false); assert.equal(after.current, '3');
      await page.locator('#gameEntry').click(); assert.equal(await frame.locator('#gameAnswer').inputValue(), '还没发送的心意');
      await page.goBack(); await page.locator('.invitation-game-layer[open]').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => window.invitationDocumentProof), before.proof);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await f.close(); }
});
