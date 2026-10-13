import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const wechat = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0';

async function fixture() {
  const app = express();
  let gameRequests = 0;
  app.get('/api/game/config', (_req, res) => { gameRequests++; res.json({ enabled: true, phase: 'open' }); });
  app.get('/api/blessings/config', (_req, res) => res.json({ enabled: true, aiWritingEnabled: true }));
  app.get('/api/blessings/stream', (_req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('event: sync\ndata: {"cursor":"0","messages":[]}\n\n');
  });
  app.get('/api/blessings/history', (_req, res) => res.json({ messages: [], hasMore: false }));
  app.use(createInvitationApp());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`, gameRequests: () => gameRequests,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

async function enter(page, url) {
  await page.goto(url);
  await page.locator('#preloaderOverlay[data-state=ready]').waitFor();
  await page.locator('#btnEnterInvitation').click();
  await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
}

async function navigate(page, index) {
  await page.locator(`.nav-dot[data-index="${index}"]`).click();
  await page.waitForFunction(index => document.querySelector('.page.active').dataset.index === String(index)
    && document.getElementById('swiperWrapper').dataset.transition === 'idle', index);
}

async function assertBounds(page, selector) {
  const failures = await page.locator(selector).evaluateAll(elements => elements.flatMap(element => {
    const bounds = element.getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
    return bounds.left < app.left || bounds.right > app.right + 1 || bounds.top < app.top || bounds.bottom > app.bottom
      || (element.clientWidth && element.scrollWidth > element.clientWidth + 1) ? [element.className || element.id] : [];
  }));
  assert.deepEqual(failures, []);
}

test('回门宴两套主题、双场地导航、父母署名与祝福入口', { timeout: 120000 }, async suite => {
  const f = await fixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    await mkdir('.temp/huimen-qa', { recursive: true });
    for (const theme of ['classic', 'chinese']) for (const parents of ['', '赵先生、李女士暨全体家人敬邀各位亲朋好友']) {
      const size = parents ? { width: 320, height: 568 } : { width: 390, height: 844 };
      await suite.test(`${theme} ${size.width} ${parents ? '女方父母' : '新人'}`, async () => {
        const page = await browser.newPage({ viewport: size, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } }));
        try {
          const params = new URLSearchParams({ event: 'huimen', theme });
          if (parents) { params.set('side', 'bride'); params.set('parents', parents); }
          await enter(page, f.origin + '/?' + params);
          await page.locator('#blessingEntry').waitFor({ state: 'visible' });
          assert.match(await page.title(), /回门宴/);
          await navigate(page, 1);
          assert.match(await page.locator('.page-2').innerText(), /10\/25/);
          assert.match(await page.locator('.page-2').innerText(), /星期日 SUNDAY/);
          assert.doesNotMatch(await page.locator('.page-2').innerText(), /12:08|11:30|10\/17|婚礼仪式|待定/);
          assert.match(await page.locator('#eventCountdown').innerText(), /\d+ 天|^$/);
          await assertBounds(page, '#p2Agenda, #p2Agenda button');
          await page.screenshot({ path: `.temp/huimen-qa/${theme}-${size.width}-time.png` });
          await page.locator('.calendar-button').click();
          assert.equal(await page.locator('#calEventTime').innerText(), '2026年10月25日 · 星期日');
          assert.doesNotMatch(await page.locator('#calEventTime').innerText(), /待定/);
          assert.deepEqual(await page.locator('#calEventLoc dt').allTextContents(), ['午宴', '晚宴']);
          assert.deepEqual(await page.locator('#calEventLoc .calendar-venue-name').allTextContents(), ['鑫华酒店', '海德禧顺']);
          assert.deepEqual(await page.locator('#calEventLoc .calendar-venue-address').allTextContents(), [
            '扬州市邗江区杨寿镇回归路2号', '扬州市邗江区邗江北路83号',
          ]);
          assert.match(await page.locator('#calendarModal .calendar-footnote').innerText(), /全天日程/);
          const calendarLayout = await page.locator('.calendar-event-card').evaluate(card => {
            const box = card.getBoundingClientRect();
            const modal = card.closest('.modal-card');
            const time = card.querySelector('#calEventTime').getBoundingClientRect();
            const rows = [...card.querySelectorAll('.calendar-event-location')];
            return rows.every(row => {
              const label = row.querySelector('dt').getBoundingClientRect();
              const name = row.querySelector('.calendar-venue-name').getBoundingClientRect();
              const addressText = document.createRange();
              addressText.selectNodeContents(row.querySelector('.calendar-venue-address'));
              const address = addressText.getBoundingClientRect();
              const center = (box.left + box.right) / 2;
              return label.left >= box.left && label.right < name.left && name.right <= box.right
                && Math.abs((label.left + name.right) / 2 - center) < 1
                && Math.abs((address.left + address.right) / 2 - center) < 1
                && name.top >= time.bottom && address.top >= name.bottom && address.bottom <= box.bottom
                && row.scrollWidth <= row.clientWidth;
            }) && modal.querySelector('.calendar-footnote').getBoundingClientRect().bottom <= modal.getBoundingClientRect().bottom;
          });
          assert.equal(calendarLayout, true, '场次与酒店名居中，地址位于下方居中，内容不被截断');
          await page.screenshot({ path: `.temp/huimen-qa/${theme}-${size.width}-calendar.png` });
          await page.locator('[data-action=copy-calendar]').click();
          assert.match(await page.evaluate(() => window.copied), /回门宴日程/);
          assert.doesNotMatch(await page.evaluate(() => window.copied), /嘉臣|12:08|婚礼|待定/);
          await page.locator('[data-close-modal=calendarModal]').click();
          await navigate(page, 2);
          await assertBounds(page, '.p3-castle-img, .event-venues, .event-venue, .event-venue button');
          const venueLayout = await page.locator('.p3-content').evaluate(content => {
            const image = content.querySelector('.p3-castle-img');
            const art = image.getBoundingClientRect();
            const header = content.querySelector('.p3-header-pediment').getBoundingClientRect();
            const [lunch, dinner] = [...content.querySelectorAll('.event-venue')].map(venue => venue.getBoundingClientRect());
            const footer = document.querySelector('.blessing-hold-hint').getBoundingClientRect();
            return image.complete && image.naturalWidth > 0 && header.bottom <= art.top
              && art.bottom <= lunch.top && lunch.bottom < dinner.top && dinner.bottom < footer.top;
          });
          assert.equal(venueLayout, true, '标题、插画和两场宴席有序排列，导航按钮避开底部祝福提示');
          await page.locator('#copyToast.show').waitFor({ state: 'hidden' });
          await page.screenshot({ path: `.temp/huimen-qa/${theme}-${size.width}-venues.png` });
          for (const [id, name, link, address] of [
            ['lunch', '鑫华酒店', 'https://surl.amap.com/1j3Bc9pcbezn', '扬州市邗江区杨寿镇回归路2号'],
            ['dinner', '海德禧顺·精致淮扬菜·宴会厅', 'https://surl.amap.com/1j9hnBx4jdeE', '扬州市邗江区邗江北路83号'],
          ]) {
            await page.locator(`[data-venue=${id}]`).click();
            assert.equal(await page.locator('#mapHotelVal').innerText(), name);
            assert.equal(await page.locator('#mapAmapLink').getAttribute('href'), link);
            assert.ok(decodeURIComponent(await page.locator('#mapBaiduLink').getAttribute('href')).includes(address));
            await page.locator('[data-action=copy-address]').click();
            assert.ok((await page.evaluate(() => window.copied)).includes(address));
            await page.locator('[data-close-modal=mapModal]').click();
          }
          await navigate(page, 3);
          assert.equal(await page.locator('#gameEntry').isVisible(), false);
          assert.equal(await page.locator('#gameSeal').isVisible(), false);
          assert.equal(await page.locator('#p4Inviters').innerText(), parents || '徐旨越 & 赵荣蓉');
          if (parents) {
            assert.equal(await page.locator('#p4ChildRole').innerText(), '爱女');
            assert.equal(await page.locator('#p4PartnerRole').innerText(), '女婿');
            assert.equal(await page.locator('#p4FamilyOccasion').innerText(), '的回门宴');
          }
          assert.doesNotMatch(await page.locator('.p4-invitation').innerText(), /2026年10月17日|12:08|嘉臣|婚礼|待定/);
          await assertBounds(page, '.p4-invitation, .p4-invitation *');
          await page.locator('#copyToast.show').waitFor({ state: 'hidden' });
          await page.screenshot({ path: `.temp/huimen-qa/${theme}-${size.width}-invitation.png` });
          await page.locator('#blessingEntry').click();
          await page.locator('#blessingsModal.open').waitFor();
          assert.equal(await page.locator('#blessingMessage').isVisible(), true);
          assert.deepEqual(errors, []);
        } finally { await page.close(); }
      });
    }
    assert.equal(f.gameRequests(), 0, '回门宴不发起游戏入口配置请求');
  } finally { await browser?.close(); await f.close(); }
});

test('微信回门宴日历的直达链接、返回与场地信息', { timeout: 45000 }, async () => {
  const f = await fixture();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: wechat, reducedMotion: 'reduce' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } }));
    const params = new URLSearchParams({ event: 'huimen', theme: 'chinese', side: 'bride', parents: '赵先生、李女士' });
    await enter(page, f.origin + '/?' + params);
    await navigate(page, 1);
    await page.locator('.calendar-button').click();
    await page.locator('[data-action=system-calendar]').click();
    const frame = page.frameLocator('.invitation-calendar-layer iframe');
    await frame.locator('[data-calendar-script=ready]').waitFor();
    assert.equal(await frame.locator('h1').innerText(), '保存回门宴日程');
    assert.match(await frame.locator('#calendarDetails').innerText(), /鑫华酒店[\s\S]*海德禧顺/);
    assert.doesNotMatch(await frame.locator('#calendarDetails').innerText(), /嘉臣|11:30|12:08|待定/);
    assert.equal(await frame.locator('#calendarOpen').getAttribute('href'), './huimen.ics');
    assert.equal(new URL(await frame.locator('.back-link').getAttribute('href')).searchParams.get('event'), 'huimen');
    await frame.locator('#calendarCopyLink').click();
    const copied = await frame.locator('body').evaluate(() => window.copied);
    assert.deepEqual(Object.fromEntries(new URL(copied).searchParams), { theme: 'chinese', event: 'huimen', side: 'bride', parents: '赵先生、李女士', open: '1' });
    await frame.locator('.back-link').click();
    await page.locator('.invitation-calendar-layer').waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).searchParams.get('event'), 'huimen');
    assert.equal(await page.locator('.page-2.active').count(), 1);
    await page.close();
    const external = await browser.newPage();
    let calendarRequests = 0;
    await external.route('**/huimen.ics', route => { calendarRequests++; return route.fulfill({ status: 204 }); });
    const calendarResponse = external.waitForResponse(response => response.url().endsWith('/huimen.ics'));
    await external.goto(copied, { waitUntil: 'commit' });
    await external.locator('[data-calendar-script=ready]').waitFor();
    assert.equal(await external.locator('#calendarOpen').getAttribute('href'), './huimen.ics');
    await calendarResponse;
    assert.equal(calendarRequests, 1);
    await external.goto(f.origin + '/calendar.html?event=unknown');
    assert.equal(await external.locator('h1').innerText(), '日程链接无效');
    assert.equal(await external.locator('#calendarOpen').count(), 0);
    await external.close();
  } finally { await browser?.close(); await f.close(); }
});
