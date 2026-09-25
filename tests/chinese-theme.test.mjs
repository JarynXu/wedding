import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createInvitationApp } from '../server/app.js';
import { getShareMetadata } from '../src/share-metadata.js';
import { resolveInvitationTheme } from '../src/invitation-theme.js';
import { WEDDING_CONFIG } from '../src/config.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const shareImage = await readFile(new URL('../public/share/chinese-wedding-portrait.jpg', import.meta.url));
const shareVersion = createHash('sha256').update(shareImage).digest('hex').slice(0, 16);
const expectedShareImage = `https://wedding.jaryn.com.cn/share/chinese-wedding-portrait.jpg?v=${shareVersion}`;
const capture = async (page, name) => {
  if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, `theme-${name}.png`), animations: 'disabled' });
};

test('主题选择与家长分享链接共存，未知值回到法式版', () => {
  for (const search of ['', '?theme=classic', '?theme=unknown', '?theme=chinese&theme=classic']) assert.equal(resolveInvitationTheme(search), 'classic');
  const share = getShareMetadata(WEDDING_CONFIG, '?theme=chinese&side=bride&parents=陈女士&revision=qa');
  const url = new URL(share.url);
  assert.equal(share.theme, 'chinese');
  assert.equal(url.searchParams.get('theme'), 'chinese');
  assert.equal(url.searchParams.get('parents'), '陈女士');
  assert.equal(url.searchParams.has('revision'), false);
  assert.equal(share.image, expectedShareImage);
  assert.match(share.description, /爱女与女婿/);
});

test('中式主题首帧、四页、弹窗和日历往返', { timeout: 90000 }, async suite => {
  const server = createInvitationApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    await suite.test('外部资源失败仍保留中式开场与重试入口', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.route('**/*', route => route.request().resourceType() === 'document' ? route.continue() : route.abort());
        await page.goto(origin + '/?theme=chinese');
        await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'chinese');
        const background = await page.locator('.welcome-background').evaluate(element => getComputedStyle(element).backgroundImage);
        assert.ok(background.startsWith('url("data:image/webp'));
        assert.equal(await page.locator('#preloaderRetry').isVisible(), true);
        assert.doesNotMatch(await page.locator('#preloaderOverlay').innerText(), /徐旨越|赵荣蓉|2026|东海/);
        await capture(page, 'chinese-first-frame');
      } finally { await page.close(); }
    });

    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 752 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 1000 }]) {
      const viewportName = `${viewport.width}x${viewport.height}`;
      await suite.test(`${viewport.width}×${viewport.height} 的主题内容与点击区域`, async () => {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        const errors = [];
        const requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => requests.push(request.url()));
        try {
          const response = await page.goto(origin + '/?theme=chinese&side=groom&parents=张先生、李女士');
          assert.equal(response.status(), 200);
          assert.equal(await page.locator('[property="og:image"]').getAttribute('content'), expectedShareImage);
          await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
          await capture(page, `chinese-loading-${viewportName}`);
          await page.locator('#btnEnterInvitation').click();
          await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
          const portrait = await page.locator('#coverBgPhoto').evaluate(image => ({
            path: new URL(image.currentSrc).pathname,
            width: image.naturalWidth,
            height: image.naturalHeight,
          }));
          assert.deepEqual(portrait, { path: '/assets/chinese/portrait.webp', width: 1024, height: 1536 });
          const composition = await page.evaluate(() => {
            const image = document.querySelector('#coverBgPhoto');
            const photo = image.getBoundingClientRect();
            const frame = document.querySelector('.chinese-cover-frame');
            const app = document.querySelector('#app').getBoundingClientRect();
            const title = document.querySelector('.chinese-cover-title').getBoundingClientRect();
            const decoration = frame.getBoundingClientRect();
            // 原图中的双人面部中点与最高发顶；验收对象是画面主体，不是 img 外框。
            const faceCenter = photo.left + photo.width * ((449 + 627) / 2) / image.naturalWidth;
            const hairTop = photo.top + photo.height * 130 / image.naturalHeight;
            return {
              centered: Math.abs(faceCenter - (app.left + app.width / 2)) <= app.width * 0.02,
              proportional: Math.abs(photo.width / photo.height - image.naturalWidth / image.naturalHeight) < 0.001,
              titleClear: title.bottom + 4 < hairTop,
              frameVisible: getComputedStyle(frame).backgroundImage.includes('/assets/chinese/portrait-frame.png') && getComputedStyle(frame).visibility === 'visible',
              frameFits: Math.abs(decoration.left - app.left) < 1 && Math.abs(decoration.right - app.right) < 1 && Math.abs(decoration.top - app.top) < 1 && Math.abs(decoration.bottom - app.bottom) < 1,
              framePassesInput: getComputedStyle(frame).pointerEvents === 'none',
            };
          });
          assert.deepEqual(composition, { centered: true, proportional: true, titleClear: true, frameVisible: true, frameFits: true, framePassesInput: true });
          assert.ok(requests.some(url => url.endsWith('/assets/chinese/portrait-frame.png')), '原版装饰须作为独立资源加载');
          for (let index = 0; index < 4; index++) {
            if (index) await page.locator(`.page-${index} [data-action="next-page"]`).click();
            await page.locator(`.page-${index + 1}.active`).waitFor();
            const layout = await page.evaluate(index => {
              const rect = selector => document.querySelector(selector).getBoundingClientRect();
              const app = rect('#app');
              const inside = selector => { const box = rect(selector); return box.left >= app.left - 1 && box.right <= app.right + 1 && box.top >= app.top && box.bottom <= app.bottom; };
              return {
                overflow: document.documentElement.scrollWidth > innerWidth,
                content: inside(['#p1CouplesNames', '.p2-agenda', '.p3-hotel-name', '.p4-invitation'][index]),
                ordered: index === 1 ? rect('.p2-header-pediment').bottom < rect('.p2-date-box').top && rect('.p2-date-box').bottom < rect('.p2-agenda').top : true,
                button: index < 3 ? inside(`.page-${index + 1} .scroll-hint`) : true,
              };
            }, index);
            assert.deepEqual(layout, { overflow: false, content: true, ordered: true, button: true });
            await capture(page, `chinese-page-${index + 1}-${viewportName}`);
          }
          assert.equal(await page.locator('#p4Inviters').textContent(), '张先生、李女士');
          assert.equal(await page.locator('#p4ChildRole').textContent(), '爱子');
          assert.equal(await page.locator('#p4PartnerRole').textContent(), '儿媳');
          assert.doesNotMatch(await page.locator('.page-4').innerText(), /INVITATION|添加到日历/);
          await page.locator('.nav-dot[data-index="1"]').click();
          await page.locator('.calendar-button').click();
          await page.locator('#calendarModal.open').waitFor();
          await capture(page, `chinese-calendar-modal-${viewportName}`);
          await page.locator('#calendarModal [data-close-modal]').click();
          await page.locator('.nav-dot[data-index="2"]').click();
          await page.locator('.p3-map-btn').click();
          await page.locator('#mapModal.open').waitFor();
          await capture(page, `chinese-map-modal-${viewportName}`);
          assert.deepEqual(errors, []);
          assert.ok(requests.every(url => !/card_0[234]_hd|cover-welcome-art|welcome-silk-roses/.test(url)), '中式版不下载法式背景');
        } finally { await page.close(); }
      });
    }

    await suite.test('中式图层下的安卓触摸可前进返回，动态花瓣保持运行', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      try {
        await page.goto(origin + '/?theme=chinese');
        await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        await page.locator('#btnEnterInvitation').tap();
        await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        const canvas = () => page.locator('#petalsCanvas').evaluate(element => element.toDataURL());
        const before = await canvas();
        await page.waitForTimeout(200);
        assert.notEqual(await canvas(), before);
        const session = await page.context().newCDPSession(page);
        const swipe = async (from, to) => {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: from }] });
          for (let step = 1; step <= 5; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: from + (to - from) * step / 5 }] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
        };
        await swipe(560, 260);
        await page.locator('.page-2.active').waitFor();
        await swipe(260, 560);
        await page.locator('.page-1.active').waitFor();
        assert.equal(await page.evaluate(() => window.scrollY), 0);
        await capture(page, 'chinese-motion');
      } finally { await page.close(); }
    });

    await suite.test('微信日历链接与返回请柬保留主题及署名', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', userAgent: 'Mozilla/5.0 Android MicroMessenger/8.0' });
      try {
        await page.goto(origin + '/?theme=chinese&side=bride&parents=陈女士');
        await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        await page.locator('#btnEnterInvitation').click();
        await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        await page.locator('.nav-dot[data-index="1"]').click();
        await page.locator('.calendar-button').click();
        await page.locator('[data-action="system-calendar"]').click();
        await page.waitForURL('**/calendar.html?**');
        const url = new URL(page.url());
        assert.equal(url.searchParams.get('theme'), 'chinese');
        assert.equal(url.searchParams.get('side'), 'bride');
        assert.equal(url.searchParams.get('open'), '1');
        const back = new URL(await page.locator('.back-link').getAttribute('href'));
        assert.equal(back.searchParams.get('theme'), 'chinese');
        assert.equal(back.searchParams.get('parents'), '陈女士');
        assert.equal(back.searchParams.has('open'), false);
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'chinese');
      } finally { await page.close(); }
    });
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
