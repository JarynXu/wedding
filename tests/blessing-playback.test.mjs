import test from 'node:test';
import assert from 'node:assert/strict';
import { BlessingPlayback } from '../src/celebration/playback.js';

const messages = count => Array.from({ length: count }, (_, i) => ({ id: String(i + 1), name: `来宾${i + 1}`, text: '愿你们岁岁相伴。' }));

test('无人发送新祝福时，已有祝福仍持续轮播，每轮覆盖全部内容', () => {
  const playback = new BlessingPlayback(() => .25);
  playback.seed(messages(6));
  const played = Array.from({ length: 30 }, (_, i) => playback.take(i * 10000));
  assert.ok(played.every(item => item?.historical));
  for (let i = 0; i < played.length; i += 6) assert.equal(new Set(played.slice(i, i + 6).map(item => item.message.id)).size, 6);
  assert.ok(played.every((item, i) => !i || item.message.id !== played[i - 1].message.id));
});

test('播放间隔有界且随机，新祝福提前到下一次出场并且只播放一次实时特效', () => {
  for (const random of [0, .5, .999]) {
    const playback = new BlessingPlayback(() => random);
    playback.seed(messages(4));
    assert.ok(playback.take(0));
    assert.equal(playback.take(3999), null);
    assert.ok(playback.take(6000));
    const fresh = { id: '5', gift: 'fireworks' };
    playback.enqueue(fresh, true);
    playback.enqueue(fresh, true);
    assert.equal(playback.take(9199), null);
    assert.deepEqual(playback.take(9200), { message: fresh, historical: false, own: true });
    const rest = Array.from({ length: 15 }, (_, i) => playback.take(20000 + i * 10000));
    assert.ok(rest.every(item => item?.historical));
    assert.ok(rest.some(item => item.message.id === fresh.id));
  }
});

test('补读的历史直接加入当前轮次，最初几条不会提前重复', () => {
  const playback = new BlessingPlayback(() => .25);
  playback.seed(messages(30).slice(-6));
  const first = playback.take(0);
  playback.seed(messages(30));
  const rest = Array.from({ length: 29 }, (_, i) => playback.take(10000 + i * 10000));
  assert.equal(new Set([first, ...rest].map(item => item.message.id)).size, 30);
});

test('单条祝福可以循环，但不会在前一条仍可见时重叠', () => {
  const playback = new BlessingPlayback(() => .5);
  assert.equal(playback.take(0), null);
  playback.seed(messages(1));
  assert.equal(playback.take(0).message.id, '1');
  assert.equal(playback.take(6000, ['1']), null);
  assert.equal(playback.take(8000).message.id, '1');
});

test('后台返回后立即恢复历史轮播，不补播离开前排队的礼物特效', () => {
  const playback = new BlessingPlayback(() => .5);
  playback.seed(messages(3));
  const prior = playback.take(0);
  playback.enqueue({ id: '4', gift: 'fireworks' });
  playback.pause();
  const resumed = playback.take(1000);
  assert.ok(resumed.historical);
  assert.notEqual(resumed.message.id, prior.message.id);
  assert.ok(Array.from({ length: 12 }, (_, i) => playback.take(10000 + i * 10000)).every(item => item?.historical));
});

test('断线同步和重复历史不重启播放，播放池只保留最新的有限记录', () => {
  const playback = new BlessingPlayback(() => .5);
  playback.seed(messages(100));
  playback.take(0);
  playback.seed(messages(30));
  assert.equal(playback.take(1000), null);
  const played = Array.from({ length: 150 }, (_, i) => playback.take(10000 + i * 10000));
  assert.ok(played.every(item => Number(item.message.id) >= 41));
  assert.equal(new Set(played.map(item => item.message.id)).size, 60);
});
