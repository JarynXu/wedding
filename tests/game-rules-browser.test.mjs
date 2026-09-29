import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import express from 'express';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const initialConfig = () => ({ enabled: true, version: 1, phase: 'open',
  questions: Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}`, title: '', opening: '' })),
  requiredCorrect: 3, participationLimit: 20, closesAt: '2026-10-15T16:00:00.000Z',
  prizes: { first: '双人旅行券', second: '鲜花礼盒', third: '纪念相册', participation: '小红包' } });

test('规则入口、手机双主题、配置更新与活动结束状态', { timeout: 90000 }, async suite => {
  let config = initialConfig();
  const app = express();
  app.get('/api/game/config', (_req, res) => res.json(config));
  app.get('/api/game/me', (_req, res) => res.status(401).json({ error: 'AUTH_REQUIRED' }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use(express.static('dist'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  await mkdir('.temp/game-rules-qa', { recursive: true });
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    for (const [theme, width, height] of [['classic', 390, 844], ['chinese', 320, 568]]) {
      await suite.test(theme, async () => {
        config = initialConfig();
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`${origin}/game.html?theme=${theme}`);
          await page.locator('dialog[data-kind=game-intro][open]').waitFor();
          const introduction = await page.locator('.game-introduction').innerText();
          for (const prize of Object.values(config.prizes)) assert.ok(introduction.includes(prize), prize);
          assert.match(introduction, /20 份小红包.*答对 3 题/s);
          assert.doesNotMatch(introduction, /玩偶|参与说明/);
          await page.evaluate(() => document.fonts.ready);
          const bounds = await page.locator('dialog[open]').evaluate(dialog => {
            const r = dialog.getBoundingClientRect(), action = dialog.querySelector('.dialog-primary').getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, actionBottom: action.bottom, height: innerHeight, fits: document.body.scrollWidth <= innerWidth };
          });
          assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height && bounds.actionBottom <= bounds.height && bounds.fits);
          await page.screenshot({ path: `.temp/game-rules-qa/intro-${theme}.png`, animations: 'disabled' });
          await page.locator('.game-introduction-note').scrollIntoViewIfNeeded();
          const noteFits = await page.locator('.game-introduction-note').evaluate(note => {
            const r = note.getBoundingClientRect(), content = note.closest('.dialog-content').getBoundingClientRect();
            return r.top >= content.top - 1 && r.bottom <= content.bottom + 1;
          });
          assert.ok(noteFits, '小屏上可以滚动读完领奖时间和手机号用途');
          await page.screenshot({ path: `.temp/game-rules-qa/intro-details-${theme}.png`, animations: 'disabled' });
          await page.getByRole('button', { name: '我来试试', exact: true }).click();
          await page.locator('#gameLogin').waitFor();
          await page.locator('[name=name]').fill('测试来宾');
          await page.locator('[name=phone]').fill('13900000000');
          assert.match(await page.locator('.game-consent').innerText(), /我已阅读并同意\s*游戏规则/);
          await page.locator('.game-consent').getByRole('button', { name: '游戏规则', exact: true }).click();
          await page.locator('.game-rules-page').waitFor();
          assert.equal(await page.locator('#gameViewTitle').innerText(), '游戏规则');
          const rules = await page.locator('.game-rules-page').innerText();
          for (const prize of Object.values(config.prizes)) assert.ok(rules.includes(prize), prize);
          assert.doesNotMatch(rules, /玩偶|参与说明/);
          assert.equal(await page.locator('.game-rules-page a').count(), 0);
          assert.match(rules, /每题只能答一次/);
          assert.match(rules, /这题不计分/);
          await page.screenshot({ path: `.temp/game-rules-qa/rules-${theme}.png`, animations: 'disabled' });

          const scrollTop = await page.locator('.game-rules-page').evaluate(node => { node.scrollTop = 40; return node.scrollTop; });
          config = { ...config, version: 2, requiredCorrect: 5, participationLimit: 7,
            closesAt: '2026-10-16T04:08:00.000Z', prizes: { ...config.prizes, participation: '纪念徽章' } };
          await page.waitForFunction(() => document.querySelector('.game-rules-page')?.textContent.includes('7 份纪念徽章'), null, { timeout: 9000 });
          const updated = await page.locator('.game-rules-page').innerText();
          assert.match(updated, /答对 5 题/);
          assert.match(updated, /2026年10月16日 12:08/);
          assert.doesNotMatch(updated, /小红包|答对 3 题|10月15日/);
          assert.equal(await page.locator('.game-rules-page').evaluate(node => node.scrollTop), scrollTop);

          config.phase = 'closed';
          await page.waitForFunction(() => document.querySelector('.game-rules-page')?.textContent.includes('获奖名单确认后会显示在默契榜'), null, { timeout: 9000 });
          config.phase = 'settled';
          await page.waitForFunction(() => document.querySelector('.game-rules-page')?.textContent.includes('获奖名单已经公布'), null, { timeout: 9000 });
          await page.locator('#backToInvitation').click();
          await page.locator('#gameLogin').waitFor();
          assert.equal(await page.locator('[name=phone]').inputValue(), '13900000000');
          await page.locator('#gameMenuToggle').click();
          assert.equal(await page.locator('#showGameRules').innerText(), '游戏规则');
          await page.locator('#showGameRules').click();
          await page.locator('.game-rules-page').waitFor();
          assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      });
    }
    await suite.test('无参与奖与已结束的首次介绍', async () => {
      config = { ...initialConfig(), participationLimit: 0 };
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      try {
        await page.goto(`${origin}/game.html`);
        await page.locator('dialog[open]').waitFor();
        assert.match(await page.locator('.game-introduction').innerText(), /只设这三个奖位/);
        assert.doesNotMatch(await page.locator('.game-introduction').innerText(), /小红包|0 份/);
        config.phase = 'closed';
        await page.reload();
        await page.getByRole('button', { name: '去看看', exact: true }).waitFor();
        assert.match(await page.locator('.game-introduction').innerText(), /答题已经结束/);
        assert.match(await page.locator('.game-introduction').innerText(), /获奖名单确认后会显示在默契榜/);
      } finally { await page.close(); }
    });
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
