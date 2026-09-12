import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { gameFixture, gameTestDatabase } from './game-fixture.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch { /* 测试结果标识缺失依赖。 */ }

test('手机后台与真实隔离数据库完成规则保存、复核、结算和兑奖', {
  skip: (!chromium || !gameTestDatabase) && '需要 Playwright 与隔离 PostgreSQL', timeout: 60000,
}, async () => {
  const f = await gameFixture();
  let browser;
  try {
    const person = await f.participant(82);
    for (const questionId of ['q1', 'q2']) {
      await f.store.submit(person.participantId, { requestId: randomUUID(), questionId, text: '隔离验收回答', configVersion: 2 });
    }
    const origin = await f.server();
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(origin + '/admin');
    await page.locator('#username').fill('test-admin');
    await page.locator('#password').fill('test-admin-password');
    await page.locator('#loginButton').click();
    await page.locator('#dashboardView:not([hidden])').waitFor();
    await page.locator('[data-admin-view="game"]').click();
    await page.locator('#gameContent:not([hidden])').waitFor();
    assert.equal(await page.locator('.question-card').count(), 6);
    const knowledge=page.locator('#gameKnowledgeEditor');await knowledge.locator('textarea[name=question]').fill('婚礼现场的小暗号');await knowledge.locator('textarea[name=answer]').fill('同心同行');await knowledge.locator('textarea[name=teaser]').fill('现场有一句同心的小暗号。');await knowledge.locator('[name=enabled]').check();await knowledge.locator('[type=submit]').click();await knowledge.locator('[role=status]').filter({hasText:'资料已保存并向宾客开放'}).waitFor();assert.equal((await f.service.knowledge.forHost())[0].answer,'同心同行');
    await page.locator('[data-question-field="answer"]').first().fill('隔离验收的新标准');
    await page.locator('#saveGameButton').click();
    await page.locator('#gameSaveMessage').filter({ hasText: '规则已保存' }).waitFor();
    assert.equal((await f.store.event()).config.questions[0].answer, '隔离验收的新标准');

    await page.locator('.participant-row').first().click();
    await page.locator('#participantDetailContent:not([hidden])').waitFor();
    for (const index of [0, 1]) {
      const card = page.locator('.answer-card').nth(index);
      await card.locator('.review-reason').fill('隔离验收人工核对');
      const saved = page.waitForResponse(response => response.url().includes('/admin/api/game/participants/') && response.request().method() === 'GET');
      await card.locator('.review-button.is-correct').click();
      await saved;
      await page.locator('#participantDetailMessage').filter({ hasText: '人工复核已保存' }).waitFor();
    }
    assert.equal((await f.store.participant(person.participantId)).participant.score, 2);
    // 只调整专属测试 room 的时钟条件，不等待真实活动截止。
    await f.pool.query("UPDATE wedding_games SET config=jsonb_set(config,'{closesAt}',to_jsonb(clock_timestamp()::text)) WHERE room_id=$1", [f.room]);
    await page.locator('#refreshButton').click();
    await page.locator('#gamePhase').filter({ hasText: '已结束' }).waitFor();
    await page.locator('#previewSettlementButton').click();
    await page.locator('#settlementReady').filter({ hasText: '可结算' }).waitFor();
    assert.equal(await page.locator('.settlement-row').count(), 1);
    await page.locator('#settlementConfirm').check();
    await page.locator('#settleButton').click();
    await page.locator('#settlementMessage').filter({ hasText: '已结算 1 人' }).waitFor();
    const claim = (await f.store.participant(person.participantId)).claim;
    assert.ok(claim.code);
    await page.locator('#redemptionCode').fill(claim.code);
    await page.locator('#checkRedemptionButton').click();
    await page.locator('#redemptionRecord:not([hidden])').waitFor();
    await page.locator('#redeemButton').click();
    await page.locator('#redemptionMessage').filter({ hasText: '核销完成' }).waitFor();
    assert.ok((await f.store.participant(person.participantId)).claim.redeemedAt);
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
  } finally {
    await browser?.close();
    await f.close();
  }
});
