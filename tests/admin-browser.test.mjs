import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { hashPassword } from '../server/admin/password.js';
import { readAdminConfig } from '../server/admin/config.js';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')); } catch { /* 缺少浏览器依赖时由测试状态标识。 */ }

test('手机尺寸后台登录后无横向溢出', { skip: !chromium && '需要 Playwright 浏览器依赖', timeout: 60000 }, async () => {
  const password = 'test-admin-password';
  const config = readAdminConfig({ ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 's'.repeat(32), ADMIN_COOKIE_SECURE: 'false' });
  const blessings = { streams: new Set(), store: { async dashboardStats() { return { totalCount: '3', lastSavedAt: '2026-09-12T03:04:05.000Z' }; } }, hub: { status: () => ({ state: 'ready' }) } };
  const server = createInvitationApp({ distDir: resolve('.'), admin: config, blessings, buildInfo: { version: '1.2.3', build: 'mobile-test' } }).listen(0, '127.0.0.1');
  await new Promise(resolveListening => server.once('listening', resolveListening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill('jaryn');
    await page.locator('#password').fill(password);
    await page.locator('#loginButton').click();
    await page.locator('#dashboardView:not([hidden])').waitFor();
    const layout = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth, cards: [...document.querySelectorAll('.metric-card')].map(card => [card.clientWidth, card.scrollWidth]), count: document.querySelector('#blessingCount').textContent }));
    assert.ok(layout.body <= layout.viewport + 1);
    assert.ok(layout.cards.every(([width, scroll]) => scroll <= width + 1));
    assert.equal(layout.count, '3 条');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
  }
});

test('默契游戏管理视图按契约加载、保存、复核、结算与核销', { skip: !chromium && '需要 Playwright 浏览器依赖', timeout: 60000 }, async () => {
  const password = 'test-admin-password';
  const config = readAdminConfig({ ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'jaryn', ADMIN_PASSWORD_HASH: await hashPassword(password), ADMIN_SESSION_SECRET: 's'.repeat(32), ADMIN_COOKIE_SECURE: 'false' });
  const blessings = { streams: new Set(), store: { async dashboardStats() { return { totalCount: '3', lastSavedAt: '2026-09-12T03:04:05.000Z' }; } }, hub: { status: () => ({ state: 'ready' }) } };
  const server = createInvitationApp({ distDir: resolve('.'), admin: config, blessings, buildInfo: { version: '1.2.3', build: 'game-test' } }).listen(0, '127.0.0.1');
  await new Promise(resolveListening => server.once('listening', resolveListening));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
  const page = await context.newPage();
  const stub = createGameApiStub(page);
  try {
    await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill('jaryn');
    await page.locator('#password').fill(password);
    await page.locator('#loginButton').click();
    await page.locator('#dashboardView:not([hidden])').waitFor();
    await page.locator('[data-admin-view="game"]').click();
    await page.locator('#gameError:not([hidden])').waitFor();
    assert.match(await page.locator('#gameError').innerText(), /游戏服务未配置/);
    assert.equal(await page.locator('#gameContent').isVisible(), false);

    await page.locator('#refreshButton').click();
    await page.locator('#gameContent:not([hidden])').waitFor();
    assert.equal(await page.locator('#gameClosesAt').inputValue(), '2026-10-17T00:00');
    assert.equal(await page.locator('#prizeComposition').innerText(), '前三大奖各 1 名，另有参与奖 20 名；每人只领取一个奖项。');
    assert.equal(await page.locator('#smsIntegration').innerText(), '未配置');
    assert.equal(await page.locator('#aiIntegration').innerText(), '未配置');
    assert.equal(await page.locator('#captchaIntegration').innerText(), '未知');
    assert.equal(await page.locator('.question-card').count(), 6);
    const gameLayout = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth, cards: [...document.querySelectorAll('.game-card')].map(card => [card.clientWidth, card.scrollWidth]) }));
    assert.ok(gameLayout.body <= gameLayout.viewport + 1);
    assert.ok(gameLayout.cards.every(([width, scroll]) => scroll <= width + 1));
    await page.setViewportSize({ width: 320, height: 568 });
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#gameMaxWinners').fill('23');
    assert.equal(await page.locator('#prizeComposition').innerText(), '前三大奖各 1 名，另有参与奖 23 名；每人只领取一个奖项。');
    await page.locator('#gameMaxWinners').fill('20');

    await page.locator('[data-question-field="title"]').first().fill('题目待填写后的标题');
    await page.locator('[data-question-field="answer"]').first().fill('标准答案');
    await page.locator('[data-question-field="aliases"]').first().fill('别称一\n别称二');
    await page.locator('[data-question-field="rubric"]').first().fill('按关键词评分');
    await page.locator('#judgeInstructions').fill('人工复核说明');
    await page.locator('#saveGameButton').click();
    await page.locator('#gameSaveMessage').filter({ hasText: '规则已保存' }).waitFor();
    assert.equal(stub.savedBody.expectedVersion, 4);
    assert.equal(stub.savedBody.config.version, undefined);
    assert.equal(stub.savedBody.config.closesAt, '2026-10-16T16:00:00.000Z');
    assert.deepEqual(stub.savedBody.config.questions[0], { id: 'q1', title: '题目待填写后的标题', answer: '标准答案', aliases: ['别称一', '别称二'], rubric: '按关键词评分' });
    assert.equal(await page.locator('#captchaIntegration').innerText(), '已配置');

    await page.locator('#publishGameButton').click();
    await page.locator('#gameImpactNote:not([hidden])').waitFor();
    assert.equal(await page.locator('#gamePhase').innerText(), '进行中');
    assert.equal(stub.publishBody.expectedVersion, 5);

    await page.locator('#previewSettlementButton').click();
    await page.locator('#settlementContent:not([hidden])').waitFor();
    assert.equal(await page.locator('.settlement-row').count(), 20);
    assert.equal(await page.locator('#settlementReady').innerText(), '可结算');
    await page.locator('#settlementConfirm').check();

    await page.locator('.participant-row').first().click();
    await page.locator('#participantDetailContent:not([hidden])').waitFor();
    assert.equal(await page.locator('.answer-text').innerText(), '回答文本 <b>原答复</b>');
    assert.equal(await page.locator('.answer-card b').count(), 0);
    assert.equal(await page.locator('.evaluation-details').count(), 1);
    await page.locator('.evaluation-details summary').click();
    const evaluationText = await page.locator('.evaluation-details').innerText();
    assert.match(evaluationText, /判题.*match-model|match-model/);
    assert.match(evaluationText, /review-model/);
    assert.match(evaluationText, /操作人：jaryn/);
    assert.match(evaluationText, /<b>模型理由<\/b>/);
    assert.equal(await page.locator('.evaluation-details b').count(), 0);
    assert.equal(await page.locator('.review-button').count(), 2);
    await page.locator('.review-reason').fill('人工核对通过');
    await page.locator('.review-button.is-correct').click();
    await page.locator('#participantDetailMessage').filter({ hasText: '人工复核已保存' }).waitFor();
    assert.deepEqual(stub.reviewBody, { expectedVersion: 3, verdict: 'correct', reason: '人工核对通过' });
    assert.equal(await page.locator('.review-button').count(), 2);
    assert.equal(await page.locator('#settlementContent').isVisible(), false);
    assert.equal(await page.locator('#settlementEmpty').isVisible(), true);
    assert.equal(await page.locator('#settlementConfirm').isChecked(), false);
    assert.equal(await page.locator('#settleButton').isDisabled(), true);

    await page.locator('#previewSettlementButton').click();
    await page.locator('#settlementContent:not([hidden])').waitFor();
    assert.equal(stub.previewCount, 2);
    await page.locator('#settlementConfirm').check();
    await page.locator('#settleButton').click();
    await page.locator('#settlementMessage').filter({ hasText: '已结算 20 人' }).waitFor();
    assert.deepEqual(stub.settleBody, { expectedVersion: 5, previewToken: 'preview-token-2', confirmed: true });
    await page.locator('#gamePhase').filter({ hasText: '已结算' }).waitFor();
    assert.equal(await page.locator('#gameConfigFields').evaluate(fieldset => fieldset.disabled), true);
    assert.equal(await page.locator('#settlementContent').isVisible(), false);
    assert.equal(await page.locator('#settlementEmpty').isVisible(), true);
    assert.equal(await page.locator('.settlement-row').count(), 0);
    assert.equal(await page.locator('#settlementConfirm').isChecked(), false);
    assert.equal(await page.locator('#settleButton').isDisabled(), true);

    await page.locator('#redemptionCode').fill('WINNER-001');
    await page.locator('#checkRedemptionButton').click();
    await page.locator('#redemptionRecord:not([hidden])').waitFor();
    assert.match(await page.locator('#redemptionSummary').innerText(), /138\*\*\*\*0000/);
    await page.locator('#redeemButton').click();
    await page.locator('#redemptionMessage').filter({ hasText: '核销完成' }).waitFor();
    assert.match(stub.redeemBody.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  } finally {
    await context.close();
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
  }
});

function createGameApiStub(page) {
  let gameGetCount = 0;
  let game = initialGame();
  let answer = { id: 'a1', questionId: 'q1', questionTitle: '', text: '回答文本 <b>原答复</b>', status: 'incorrect', reason: '<b>AI理由</b>', version: 3, receivedAt: '2026-10-15T10:00:00.000Z', evaluations: [
    { stage: '判题', model: 'match-model', verdict: 'incorrect', reason: '<b>模型理由</b>', evidence: '回答文本 <b>原答复</b>' },
    { stage: '复核', model: 'review-model', verdict: 'incorrect', reason: '复核理由', evidence: '原答复' },
  ], history: [{ actor: 'jaryn', createdAt: '2026-10-15T10:01:00.000Z', result: { status: 'incorrect', verdict: 'incorrect', reason: '<i>人工记录</i>' } }] };
  const participant = { id: 'p1', name: '来宾甲', phoneMasked: '138****0000', score: 2, answered: true, qualifiedAt: null, prize: null, redeemedAt: null };
  const stub = { savedBody: null, publishBody: null, reviewBody: null, settleBody: null, redeemBody: null, previewCount: 0 };
  page.route('**/admin/api/game**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    const body = () => JSON.parse(request.postData() || '{}');
    if (url.pathname === '/admin/api/game' && method === 'GET') {
      if (gameGetCount++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'GAME_UNAVAILABLE', message: '游戏服务未配置' }) });
      return json(game);
    }
    if (url.pathname === '/admin/api/game/knowledge') return json({version:0,enabled:false,entries:[]});
    if (url.pathname === '/admin/api/game/config' && method === 'PUT') {
      stub.savedBody = body();
      game = { ...game, config: { ...stub.savedBody.config, version: 5 }, integrations: { ...game.integrations, captcha: { configured: true } } };
      return json(game);
    }
    if (url.pathname === '/admin/api/game/publish' && method === 'POST') { stub.publishBody = body(); game = { ...game, phase: 'open' }; return json(game); }
    if (url.pathname === '/admin/api/game/participants' && method === 'GET') return json({ participants: [participant], next: null, hasMore: false });
    if (url.pathname === '/admin/api/game/participants/p1' && method === 'GET') return json({ participant, answers: [answer] });
    if (url.pathname === '/admin/api/game/review/a1' && method === 'POST') { stub.reviewBody = body(); answer = { ...answer, status: stub.reviewBody.verdict, reason: stub.reviewBody.reason, version: 4 }; return json({ ok: true }); }
    if (url.pathname === '/admin/api/game/settlement-preview' && method === 'GET') return json(settlementPreview(game.config.version, ++stub.previewCount));
    if (url.pathname === '/admin/api/game/settle' && method === 'POST') { stub.settleBody = body(); game = { ...game, phase: 'settled', stats: { ...game.stats, awarded: 20 } }; return json({ awarded: 20, alreadySettled: false }); }
    if (url.pathname === '/admin/api/game/redemption/check' && method === 'POST') return json({ name: '来宾甲', phoneMasked: '138****0000', prize: '一等奖', status: 'issued', redeemedAt: null });
    if (url.pathname === '/admin/api/game/redemption' && method === 'POST') { stub.redeemBody = body(); return json({ name: '来宾甲', phoneMasked: '138****0000', prize: '一等奖', status: 'redeemed', redeemedAt: '2026-10-16T10:00:00.000Z', alreadyRedeemed: false }); }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: '测试 stub 未覆盖此接口' }) });
  });
  return stub;
}

function initialGame() {
  return {
    config: {
      version: 4,
      closesAt: '2026-10-16T16:00:00.000Z',
      participationLimit: 20,
      requiredCorrect: 2,
      questions: Array.from({ length: 6 }, (_, index) => ({ id: `q${index + 1}`, title: '', answer: '', aliases: [], rubric: '' })),
      prizes: { first: '一等奖', second: '二等奖', third: '三等奖', participation: '小玩偶' },
      judgeInstructions: '',
    },
    phase: 'draft',
    integrations: { sms: { configured: false }, ai: { configured: false } },
    stats: { participants: 1, pending: 0, review: 1, qualified: 0, awarded: 0, redeemed: 0 },
  };
}

function settlementPreview(configVersion, previewNumber) {
  return {
    ready: true,
    reason: '名单已满足结算条件',
    candidates: Array.from({ length: 20 }, (_, index) => ({ participantId: `p${index + 1}`, name: `来宾${index + 1}`, phoneMasked: `138****${String(index + 1).padStart(4, '0')}`, score: 6, qualificationOrder: index + 1, rank: index + 1, prize: index === 0 ? '一等奖' : index === 1 ? '二等奖' : index === 2 ? '三等奖' : '小玩偶' })),
    configVersion,
    previewToken: `preview-token-${previewNumber}`,
  };
}
