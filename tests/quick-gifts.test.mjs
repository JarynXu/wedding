import test from 'node:test';
import assert from 'node:assert/strict';
import { QuickGifts } from '../src/celebration/quick-gifts.js';

function fixture(send) {
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  const button = Object.assign(new EventTarget(), {
    dataset: { quickGift: 'rose' }, classList: { add() {}, remove() {} },
    setPointerCapture() {}, hasPointerCapture() { return false; },
  });
  const played = [], requests = [], recorded = [];
  let persisted, sequence = 0;
  const controller = new QuickGifts({
    buttons: [button], play: id => played.push(id),
    createMessage: (gift, giftCount) => ({ requestId: String(++sequence), gift, giftCount }),
    client: { giftRecordIntervalMs: 5000, async send(message) { requests.push(structuredClone(message)); return send ? send(message) : { message }; } },
    persist: value => { persisted = value; }, recorded: value => recorded.push(value),
  });
  const event = type => button.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { button: 0, isPrimary: true, pointerId: 1 }));
  return { controller, button, played, requests, recorded, event, get pending() { return persisted; },
    tap() { event('pointerdown'); event('pointerup'); },
    close() { controller.destroy(); globalThis.window = previous.window; globalThis.document = previous.document; } };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('长按按播放次数计数，只在松手提交；丢失指针也停止连续播放', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const f = fixture();
  try {
    f.event('pointerdown'); assert.equal(f.played.length, 1); assert.equal(f.requests.length, 0);
    t.mock.timers.tick(350);
    for (let i = 0; i < 3; i++) t.mock.timers.tick(450);
    assert.equal(f.played.length, 5); assert.equal(f.requests.length, 0);
    f.event('pointerup'); await settle();
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].giftCount, 5);
    t.mock.timers.tick(5000); assert.equal(f.played.length, 5);
    f.event('pointerdown'); t.mock.timers.tick(350); f.event('pointercancel'); await settle();
    assert.equal(f.requests[1].giftCount, 2);
    t.mock.timers.tick(5000); assert.equal(f.played.length, 7);
  } finally { f.close(); }
});

test('点按连续播放，前端限频与后端 429 只影响记录，遵守 Retry-After', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let limited = false;
  const f = fixture(async message => { if (limited) throw Object.assign(new Error('限频'), { status: 429, retryAfter: 30 }); return { message }; });
  try {
    for (let i = 0; i < 6; i++) f.tap();
    await settle(); assert.equal(f.played.length, 6); assert.equal(f.requests.length, 1);
    limited = true; t.mock.timers.tick(5000); f.tap(); await settle();
    assert.equal(f.played.length, 7); assert.equal(f.requests.length, 2); assert.equal(f.pending, null);
    limited = false; t.mock.timers.tick(5000); f.tap(); await settle();
    assert.equal(f.played.length, 8); assert.equal(f.requests.length, 2);
    t.mock.timers.tick(25000); f.tap(); await settle(); assert.equal(f.requests.length, 3);
    assert.equal(f.recorded.length, 2); assert.equal(f.controller.hasPlayed(f.requests[0].requestId), true);
  } finally { f.close(); }
});

test('记录响应未知时保留原请求，下一次播放仍发生，重试不改变原数量', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let failed = true;
  const f = fixture(async message => { if (failed) throw new Error('响应中断'); return { message }; });
  try {
    f.tap(); await settle(); assert.ok(f.pending);
    failed = false; t.mock.timers.tick(5000); f.tap(); await settle();
    assert.equal(f.played.length, 2); assert.deepEqual(f.requests[0], f.requests[1]); assert.equal(f.pending, null);
    f.event('pointerdown'); f.controller.destroy(); t.mock.timers.tick(10000);
    assert.equal(f.played.length, 3); assert.equal(f.requests.length, 2);
  } finally { f.close(); }
});
