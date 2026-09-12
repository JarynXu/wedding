import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { join } from 'node:path';

test('六种礼物画布产生可见变化，结束后释放动画；减少动态效果不播放', { timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'silent' }); await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const [theme, gifts] of [['classic', ['rose', 'champagne', 'fireworks']], ['chinese', ['lantern', 'knot', 'double-happiness']]]) {
      await page.setViewportSize({width: theme==='chinese'?320:390,height:844});
      await page.goto(`${origin}/?theme=${theme}`);
      await page.locator('#preloaderOverlay[data-state="ready"]').waitFor(); await page.locator('#btnEnterInvitation').click();
      await page.evaluate(async theme => {
        const { GiftEffects } = await import('/src/celebration/gift-effects.js');
        const canvas = document.createElement('canvas'); canvas.id = 'qaGiftCanvas'; canvas.className = 'gift-effects'; document.querySelector('#app').append(canvas);
        window.qaGiftEffects = new GiftEffects(canvas, theme);
        await window.qaGiftEffects.atlas.decode(); await window.qaGiftEffects.petals.decode();
      }, theme);
      for (const gift of gifts) {
        await page.evaluate(gift => window.qaGiftEffects.play(gift), gift);
        const sums = await page.locator('#qaGiftCanvas').evaluate(async canvas => {
          const values = [];
          for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 180));
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let sum = 0, left = 0;
            const boundary=window.qaGiftEffects.effectsLeft*canvas.width/canvas.getBoundingClientRect().width;
            for (let a = 3; a < data.length; a += 4) { sum += data[a]; if(((a-3)/4)%canvas.width<Math.floor(boundary))left+=data[a]; }
            values.push({sum,left});
          }
          return values;
        });
        assert.ok(Math.max(...sums.map(value=>value.sum)) > 500, `${gift} 有可见像素`); assert.ok(new Set(sums.map(value=>value.sum)).size > 2, `${gift} 有变化`);
        assert.ok(sums.every(value=>value.left===0),`${gift} 的火花、光晕和主体都不进入气泡轨迹`);
        if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, `gift-${gift}.png`) });
        await page.locator('#qaGiftCanvas[data-state="idle"]').waitFor({ timeout: 5000 });
        assert.equal(await page.evaluate(() => window.qaGiftEffects.frame), null);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.qaGiftEffects.play('fireworks'));
      assert.equal(await page.evaluate(() => window.qaGiftEffects.frame), null);
      await page.evaluate(() => window.qaGiftEffects.destroy());
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await vite.close(); }
});
