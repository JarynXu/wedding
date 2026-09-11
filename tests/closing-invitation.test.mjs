import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

test('最后一页的邀请者、称谓和手机排版', { timeout: 60000 }, async suite => {
  const server = createInvitationApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const cases = [
      { name: 'couple', params: {}, inviter: '徐旨越 & 赵荣蓉', viewport: { width: 390, height: 844 } },
      { name: 'groom', params: { side: 'groom', parents: '张先生、李女士' }, inviter: '张先生、李女士', child: ['爱子', '徐旨越'], partner: ['儿媳', '赵荣蓉'], viewport: { width: 390, height: 844 } },
      { name: 'bride', params: { side: 'bride', parents: '陈女士' }, inviter: '陈女士', child: ['爱女', '赵荣蓉'], partner: ['女婿', '徐旨越'], viewport: { width: 360, height: 640 } },
      { name: 'small', params: { side: 'groom', parents: '张"先生 & 李女士' }, inviter: '张"先生 & 李女士', child: ['爱子', '徐旨越'], partner: ['儿媳', '赵荣蓉'], viewport: { width: 320, height: 568 } },
      { name: 'long', params: { side: 'bride', parents: '姓名'.repeat(30) }, inviter: '姓名'.repeat(30), child: ['爱女', '赵荣蓉'], partner: ['女婿', '徐旨越'], viewport: { width: 320, height: 568 } },
    ];
    for (const entry of cases) {
      await suite.test(entry.name, async () => {
        const page = await browser.newPage({ viewport: entry.viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${origin}/?${new URLSearchParams(entry.params)}`, { waitUntil: 'domcontentloaded' });
          await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
          assert.equal(await page.locator('#p4Inviters').textContent(), entry.inviter);
          assert.equal(await page.locator('#p4Inviters > *').count(), 0, 'URL 署名作为文字显示');
          assert.doesNotMatch(await page.locator('.page-4').textContent(), /INVITATION/);
          if (entry.child) {
            assert.equal(await page.locator('#p4ChildRole').textContent(), entry.child[0]);
            assert.equal(await page.locator('#p4ChildName').textContent(), entry.child[1]);
            assert.equal(await page.locator('#p4PartnerRole').textContent(), entry.partner[0]);
            assert.equal(await page.locator('#p4PartnerName').textContent(), entry.partner[1]);
            assert.equal(await page.locator('#p4InvitationIntro').getAttribute('hidden'), '');
            assert.equal(await page.locator('#p4InvitationBadge').textContent(), '诚邀您参加');
            assert.equal(await page.locator('#p4FamilyOccasion').textContent(), '的婚礼暨喜宴');
            assert.doesNotMatch(await page.locator('.page-4').textContent(), /我们的婚礼|与我们共享/);
            const preceding = await page.locator('#preloaderOverlay, .page-1, .page-2, .page-3').allTextContents();
            assert.ok(preceding.every(text => !text.includes(entry.inviter)), '父母署名只出现在最后一页');
          } else {
            assert.equal(await page.locator('#p4FamilyWedding').getAttribute('hidden'), '');
            assert.equal(await page.locator('#p4InvitationIntro').textContent(), '参加我们的婚礼与喜宴');
          }
          await page.locator('#btnEnterInvitation').click();
          await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
          await page.locator('.nav-dot[data-index="3"]').click();
          await page.locator('.page-4.active').waitFor();
          await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
          const layout = await page.evaluate(() => {
            const inviters = document.getElementById('p4Inviters');
            const badge = document.getElementById('p4InvitationBadge');
            const invitation = document.querySelector('.p4-invitation');
            const page = document.querySelector('.page-4');
            const inviterRect = inviters.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();
            const rect = invitation.getBoundingClientRect();
            const pageRect = page.getBoundingClientRect();
            return {
              inviterBeforeBadge: Boolean(inviters.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING),
              inviterAboveBadge: inviterRect.bottom <= badgeRect.top,
              inviterRevealsFirst: parseFloat(getComputedStyle(inviters).animationDelay) < parseFloat(getComputedStyle(badge).animationDelay),
              insidePage: rect.top >= pageRect.top && rect.bottom <= pageRect.bottom && rect.left >= pageRect.left && rect.right <= pageRect.right,
              overflow: [invitation, ...invitation.querySelectorAll('*')].filter(element => element.clientWidth && element.scrollWidth > element.clientWidth + 1).map(element => element.id || element.className),
            };
          });
          assert.equal(layout.inviterBeforeBadge, true);
          assert.equal(layout.inviterAboveBadge, true);
          assert.equal(layout.inviterRevealsFirst, true);
          assert.equal(layout.insidePage, true);
          assert.deepEqual(layout.overflow, []);
          assert.deepEqual(errors, []);
          if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, `closing-${entry.name}.png`), animations: 'disabled' });
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
