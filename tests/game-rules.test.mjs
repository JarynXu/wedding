import test from 'node:test';
import assert from 'node:assert/strict';
import { publicGameRules, gameOpeningInvitation, gameDeadline } from '../src/game-rules.js';
import { initialGameConfig } from '../server/game/model.js';
import { followUpChoices, suggestedReplies, suggestionIntent } from '../server/game/suggestions.js';

const textOf = config => publicGameRules(config).flatMap(section => section.paragraphs).join('\n');

test('规则和开场按当前题数、门槛、名额与奖品生成，不补写奖品种类', () => {
  const config = { ...initialGameConfig(), requiredCorrect: 3, participationLimit: 17,
    questions: Array.from({ length: 4 }, () => ({ answer: '私有答案', rubric: '私有评分依据' })),
    prizes: { first: '双人旅行券', second: '晚餐券', third: '鲜花', participation: '小红包' },
    closesAt: '2026-10-15T04:08:00.000Z' };
  for (const text of [textOf(config), gameOpeningInvitation(config)]) {
    for (const prize of Object.values(config.prizes)) assert.ok(text.includes(prize), prize);
    assert.match(text, /全部 4 题/);
    assert.match(text, /17 份小红包/);
    assert.match(text, /答对 3 题/);
    assert.match(text, /前三名不占这些名额/);
    assert.doesNotMatch(text, /六题|全部 6 题|玩偶|私有答案|私有评分依据/);
  }
  assert.match(textOf(config), /2026年10月15日 12:08/);
  config.requiredCorrect = 4; config.participationLimit = 8; config.prizes.participation = '纪念相册';
  assert.match(textOf(config), /8 份纪念相册.*答对 4 题/);
  assert.doesNotMatch(textOf(config), /17 份|小红包|答对 3 题/);
});

test('参与奖名额为零时不邀请宾客争取未设置的奖品', () => {
  const config = { ...initialGameConfig(), participationLimit: 0,
    prizes: { first: '甲奖', second: '乙奖', third: '丙奖', participation: '不发放的礼物' } };
  for (const text of [textOf(config), gameOpeningInvitation(config)]) {
    assert.match(text, /只设这三个奖位/);
    assert.doesNotMatch(text, /不发放的礼物|0 份|答对 2 题/);
  }
});

test('规则对应活动状态，午夜截止按前一天的 24 点显示', () => {
  const config = initialGameConfig();
  assert.equal(gameDeadline(config.closesAt), '2026年10月16日 24:00');
  assert.match(textOf({ ...config, phase: 'open' }), /答题截止到/);
  const closed = textOf({ ...config, phase: 'closed' });
  assert.match(closed, /答题已于.*结束，获奖名单确认后会显示在默契榜/);
  assert.doesNotMatch(closed, /答题期间的排名还会变化/);
  const settled = textOf({ ...config, phase: 'settled' });
  assert.match(settled, /获奖名单已经公布/);
  assert.doesNotMatch(settled, /确认后会|截止后会公布/);
});

test('规则建议统一名称，仍接受已经显示在旧聊天里的入口', () => {
  const context = { scene: 'pause', deck: { hints: [], choices: [] } };
  assert.deepEqual(followUpChoices(context), ['继续答题', '游戏规则']);
  assert.deepEqual(suggestedReplies(context, ['看看游戏规则', '规则说明', '了解玩法']), ['游戏规则', '继续答题']);
  assert.equal(suggestionIntent('游戏规则'), 'rules');
  assert.equal(suggestionIntent('看看游戏规则'), 'rules');
});
