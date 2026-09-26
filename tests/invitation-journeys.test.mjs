import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fixture, databaseUrl, post, payload } from './blessings-fixture.mjs';
import { gameFixture } from './game-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browserOptions = { headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) };
const phone = { viewport: { width: 390, height: 752 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
const wechat = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0';
const capture = async (page, name) => {
  if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, `${name}.png`), animations: 'disabled' });
};
const enter = async (page, url) => {
  await page.goto(url);
  await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
  await page.locator('#btnEnterInvitation').click();
  await page.locator('#blessingEntry[data-connection="connected"]').waitFor();
};
const calendar = async page => {
  await page.locator('.nav-dot[data-index="1"]').click();
  await page.locator('.calendar-button').click();
  await page.locator('[data-action="system-calendar"]').click();
  await page.waitForURL('**/calendar.html?**');
};

test('活动、日历与祝福之间的往返', { skip: !databaseUrl && '需要隔离 PostgreSQL', timeout: 120000 }, async suite => {
  const blessings = await fixture();
  const service = (await blessings.instance()).service;
  const game = await gameFixture();
  const origin = await game.server({ blessings: service });
  const browser = await chromium.launch(browserOptions);
  try {
    for (const theme of ['classic', 'chinese']) await suite.test(`${theme} 活动退出后显示排队祝福和本人发送的祝福`, async () => {
      const page = await browser.newPage(phone);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await enter(page, `${origin}/?theme=${theme}`);
        await page.locator('#blessingEntry').click();
        await page.locator('[data-tab="history"]').click();
        await page.locator('.blessing-history-list:not([aria-busy])').waitFor();
        await page.locator('#blessingsModal [data-close-modal]').click();
        await page.locator('.nav-dot[data-index="3"]').click();
        await page.locator('#gameEntry').click();
        const frame = page.frameLocator('.invitation-game-layer iframe');
        await frame.getByRole('button', { name: '先逛逛', exact: true }).waitFor();
        const remoteText = `${theme} 活动期间的心意`;
        const sent = await post(origin, payload({ text: remoteText, theme }));
        assert.equal(sent.status, 201);
        await page.locator('.blessing-history-item').filter({ hasText: remoteText }).waitFor({ state: 'attached' });
        assert.equal(await page.locator('.blessing-bubble').filter({ hasText: remoteText }).count(), 0);
        await frame.getByRole('button', { name: '先逛逛', exact: true }).click();
        await page.locator('.invitation-game-layer[open]').waitFor({ state: 'hidden' });
        await page.locator('.blessing-bubble').filter({ hasText: remoteText }).waitFor();
        const ownText = `${theme} 返回活动后送出的祝福`;
        await page.locator('#blessingEntry').click();
        await page.locator('#blessingMessage').fill(ownText);
        await page.locator('.blessing-send').click();
        await page.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
        await page.locator('.blessing-bubble').filter({ hasText: ownText }).waitFor();
        assert.equal(await page.locator('.invitation-game-layer:not([open])').count(), 1);
        await page.locator('#gameSeal').click();
        await frame.getByRole('button', { name: '先逛逛', exact: true }).waitFor();
        await frame.getByRole('button', { name: '先逛逛', exact: true }).click();
        await page.locator('.invitation-game-layer[open]').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.activeElement.id), 'gameEntry');
        assert.deepEqual(errors, []);
        await capture(page, `journey-blessing-${theme}`);
      } finally { await page.close(); }
    });

    await suite.test('活动标签避开火漆，火漆热区跟随底图裁切，中式导航紧随地址', async () => {
      for (const theme of ['classic', 'chinese']) for (const [width, height, parents] of [[320, 568, '姓名'.repeat(30)], [390, 752, '张先生、李女士'], [430, 932, '陈女士'], [1440, 1000, '张先生、李女士']]) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
        try {
          await enter(page, `${origin}/?${new URLSearchParams({ theme, side: 'groom', parents })}`);
          await page.locator('.nav-dot[data-index="3"]').click();
          await page.locator('#gameEntry:not([hidden])').waitFor();
          const activity = await page.locator('#gameEntry').evaluate(entry => {
            const box = entry.getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
            const footnote = document.getElementById('p4Footnote'), dock = document.querySelector('.blessing-dock').getBoundingClientRect();
            const copy = (footnote.getClientRects().length ? footnote : document.querySelector('.p4-poem')).getBoundingClientRect();
            const seal = document.getElementById('gameSeal'), sealBox = seal.getBoundingClientRect(), sealStyle = getComputedStyle(seal);
            // 火漆坐标由原始底图量取；独立于 CSS 热区的实现值。
            const art = document.documentElement.dataset.theme === 'chinese'
              ? { width: 887, height: 1774, sealX: 676, sealY: 1280, sealLeft: 568 }
              : { width: 1536, height: 2752, sealX: 1205, sealY: 1910, sealLeft: 1020 };
            const scale = Math.max(app.width / art.width, app.height / art.height);
            const offsetX = app.left + (app.width - art.width * scale) / 2, offsetY = app.top + (app.height - art.height * scale) / 2;
            const center = { x: offsetX + art.sealX * scale, y: offsetY + art.sealY * scale };
            const hit = [entry.querySelector('span'), entry.querySelector('small')].every(label => {
              const rect = label.getBoundingClientRect();
              return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('#gameEntry') === entry;
            });
            return {
              width: box.width, height: box.height, aboveDock: box.bottom + 10 <= dock.top, belowCopy: box.top >= copy.bottom + 10,
              inside: box.left >= app.left && box.right <= app.right && box.top >= app.top && box.bottom <= app.bottom,
              sealClear: box.right + 4 < offsetX + art.sealLeft * scale,
              sealAligned: Math.abs(sealBox.x + sealBox.width / 2 - center.x) < 3 && Math.abs(sealBox.y + sealBox.height / 2 - center.y) < 3,
              sealTransparent: sealStyle.backgroundColor === 'rgba(0, 0, 0, 0)' && sealStyle.backgroundImage === 'none' && sealStyle.backdropFilter === 'none',
              sealHit: document.elementFromPoint(center.x, center.y)?.closest('#gameSeal') === seal,
              hit,
            };
          });
          assert.ok(activity.width >= 135 && activity.width <= 180 && activity.height >= 44, JSON.stringify({ theme, width, activity }));
          await capture(page, `journey-activity-${theme}-${width}`);
          assert.deepEqual({ ...activity, width: undefined, height: undefined }, { width: undefined, height: undefined, aboveDock: true, belowCopy: true, inside: true, sealClear: true, sealAligned: true, sealTransparent: true, sealHit: true, hit: true }, JSON.stringify({ theme, width, height, activity }));
          if (theme === 'chinese') {
            await page.locator('.nav-dot[data-index="2"]').click();
            const map = await page.locator('.p3-map-btn').evaluate(button => {
              const box = button.getBoundingClientRect(), address = document.querySelector('.p3-address').getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
              return { gap: box.top - address.bottom, belowAddress: box.top >= address.bottom + 12, inside: box.bottom <= app.bottom - 100, height: box.height, hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.p3-map-btn') === button };
            });
            assert.ok(map.gap <= 75 && map.belowAddress && map.inside && map.height >= 44 && map.hit, JSON.stringify({ width, map }));
            await capture(page, `journey-map-${width}`);
          }
        } finally { await page.close(); }
      }
    });

    await suite.test('页面未保留在内存时，日历返回重建资源后恢复所在页与祝福', async () => {
      const page = await browser.newPage({ ...phone, userAgent: wechat });
      try {
        await enter(page, `${origin}/?theme=chinese&side=bride&parents=陈女士`);
        await page.evaluate(() => { window.invitationProof = 'original-document'; });
        await calendar(page);
        await page.locator('.back-link').click();
        await page.locator('#preloaderOverlay[data-state="entered"]').waitFor({ state: 'attached' });
        assert.equal(await page.evaluate(() => window.invitationProof), undefined, '本用例关闭浏览器的页面快照缓存');
        assert.equal(await page.locator('.page.active').getAttribute('data-index'), '1');
        assert.equal(await page.locator('.modal-backdrop.open').count(), 0);
        assert.equal(await page.locator('#p4Inviters').textContent(), '陈女士');
        await page.locator('#blessingEntry[data-connection="connected"]').waitFor();
        await page.locator('#blessingEntry').click();
        await page.locator('#blessingMessage').fill('日历返回后的祝福');
        await page.locator('.blessing-send').click();
        await page.locator('.blessing-bubble').filter({ hasText: '日历返回后的祝福' }).waitFor();
      } finally { await page.close(); }
    });

    await suite.test('返回记录不能跳过失败资源，全新浏览器仍显示普通开启入口', async () => {
      const page = await browser.newPage({ ...phone, userAgent: wechat });
      try {
        await enter(page, `${origin}/?theme=chinese`);
        await calendar(page);
        await page.route('**/assets/chinese/portrait.webp', route => route.fulfill({ status: 503, body: 'isolated image failure' }));
        await page.locator('.back-link').click();
        await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
        assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), false);
        assert.equal(await page.locator('body.invitation-open').count(), 0);
        assert.equal(await page.locator('#preloaderRetry').isVisible(), true);
      } finally { await page.close(); }

      const fresh = await browser.newPage(phone);
      try {
        await fresh.goto(`${origin}/calendar.html?theme=chinese&side=bride&parents=陈女士`);
        await fresh.locator('.back-link').click();
        await fresh.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        assert.equal(await fresh.locator('#btnEnterInvitation').isEnabled(), true);
        assert.equal(await fresh.locator('body.invitation-open').count(), 0);
        assert.equal(await fresh.locator('#p4Inviters').textContent(), '陈女士');
      } finally { await fresh.close(); }
    });
  } finally { await browser.close(); await game.close(); await blessings.close(); }
});

test('日历返回复用浏览器页面快照', { skip: !databaseUrl && '需要隔离 PostgreSQL', timeout: 60000 }, async () => {
  const f = await fixture();
  const { origin } = await f.instance();
  const browser = await chromium.launch({ ...browserOptions, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  try {
    const page = await browser.newPage({ ...phone, userAgent: wechat });
    await enter(page, `${origin}/?theme=chinese`);
    const proof = await page.evaluate(() => {
      window.invitationProof = crypto.randomUUID();
      window.addEventListener('pageshow', event => { window.restoredFromMemory = event.persisted; });
      return window.invitationProof;
    });
    await calendar(page);
    const requests = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    await page.locator('.back-link').click();
    await page.locator('.page-2.active').waitFor();
    assert.equal(await page.evaluate(() => window.invitationProof), proof);
    assert.equal(await page.evaluate(() => window.restoredFromMemory), true);
    // 浏览器恢复页签图标时可请求 monogram；请柬照片、字体、音乐和脚本不应重载。
    assert.ok(requests.every(path => path === '/assets/shared/monogram.png' || !/^\/(assets|music|app)\//.test(path)), JSON.stringify(requests));
    await page.locator('#blessingEntry[data-connection="connected"]').waitFor();
    const text = '页面快照返回后的实时祝福';
    assert.equal((await post(origin, payload({ text }))).status, 201);
    await page.locator('.blessing-bubble').filter({ hasText: text }).waitFor();
    await page.close();
  } finally { await browser.close(); await f.close(); }
});
