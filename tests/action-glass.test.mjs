import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import express from 'express';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

test('两套主题的播放器、日历、地图和活动按钮透光并模糊背景，文字和焦点保持清晰', { timeout: 60000 }, async () => {
  const app = express();
  // 本用例只检查材质；活动流程由 invitation-journeys 使用真实测试服务验证。
  app.get('/api/game/config', (_request, response) => response.json({ enabled: true, phase: 'open' }));
  app.use(createInvitationApp());
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const theme of ['classic', 'chinese']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 752 }, reducedMotion: 'reduce' });
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`);
        await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        await page.locator('#btnEnterInvitation').click();
        await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        for (const [index, selector] of [[0, '#musicBtn'], [1, '.calendar-button'], [2, '.p3-map-btn'], [3, '#gameEntry']]) {
          await page.locator(`.nav-dot[data-index="${index}"]`).click();
          await page.locator(selector).waitFor();
          await assertGlass(page, selector);
          await page.keyboard.press('Tab');
          await page.locator(selector).focus();
          const focus = await page.locator(selector).evaluate(element => {
            const style = getComputedStyle(element);
            return { visible: element.matches(':focus-visible'), width: parseFloat(style.outlineWidth) };
          });
          assert.ok(focus.visible && focus.width >= 2, `${theme} ${selector} 的键盘焦点须可见`);
        }
      } finally { await page.close(); }
    }
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

async function assertGlass(page, selector) {
  const probe = await page.locator(selector).evaluate(button => {
    const rect = button.getBoundingClientRect(), scene = button.closest('.page'), parent = scene || document.getElementById('app'), bounds = parent.getBoundingClientRect();
    const width = Math.min(72, Math.floor(rect.width - 20));
    const pattern = document.createElement('div'); pattern.id = 'glassPattern';
    pattern.style.cssText = `position:absolute;pointer-events:none;z-index:${scene ? 1 : 84};left:${rect.left - bounds.left + 8}px;top:${rect.bottom - bounds.top - 15}px;width:${width + 8}px;height:35px;background:repeating-linear-gradient(90deg,#650d29 0 4px,#f9edda 4px 8px)`;
    parent.append(pattern);
    const style = getComputedStyle(button);
    return { x: Math.round(rect.left + 10), y: Math.round(rect.bottom - 10), width, filter: style.backdropFilter, textFilter: getComputedStyle(button.querySelector('span, svg')).filter };
  });
  assert.match(probe.filter, /blur\(/);
  assert.equal(probe.textFilter, 'none');
  const blurred = await page.screenshot();
  await page.locator(selector).evaluate(button => { button.style.backdropFilter = 'none'; button.style.webkitBackdropFilter = 'none'; });
  const clear = await page.screenshot();
  const contrast = await page.evaluate(async ({ blurred, clear, x, y, width }) => {
    const energy = async encoded => {
      const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const values = context.getImageData(x, y, width, 1).data;
      let edges = 0;
      for (let index = 4; index < values.length; index += 4) for (let channel = 0; channel < 3; channel++) edges += Math.abs(values[index + channel] - values[index - 4 + channel]);
      return edges;
    };
    return { blurred: await energy(blurred), clear: await energy(clear) };
  }, { blurred: blurred.toString('base64'), clear: clear.toString('base64'), x: probe.x, y: probe.y, width: probe.width });
  assert.ok(contrast.clear > 1000, `${selector} 须透出背景条纹，不能以不透明底色覆盖：${JSON.stringify(contrast)}`);
  assert.ok(contrast.blurred < contrast.clear * 0.6, `${selector} 须模糊背景边缘：${JSON.stringify(contrast)}`);
  await page.locator(selector).evaluate(button => { button.style.removeProperty('backdrop-filter'); button.style.removeProperty('-webkit-backdrop-filter'); });
  await page.locator('#glassPattern').evaluate(element => element.remove());
}
