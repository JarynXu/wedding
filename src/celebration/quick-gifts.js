import { BLESSING_LIMITS } from './catalog.js';

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 450;

/** 本机播放不等待记录；每个手势在松手时提交一份数量，记录请求受独立限频约束。 */
export class QuickGifts {
  constructor({ buttons, play, createMessage, client, pending, persist, recorded }) {
    Object.assign(this, { play, createMessage, client, pending, persist, recorded });
    this.events = new AbortController();
    this.playedRequests = new Set();
    this.nextRecordAt = 0;
    if (pending) this.remember(pending.requestId);
    const options = { signal: this.events.signal };
    buttons.forEach(button => {
      const gift = button.dataset.quickGift;
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        this.start(button, gift, event.pointerId);
        button.setPointerCapture(event.pointerId);
      }, options);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(event, e => { if (this.hold?.pointerId === e.pointerId) this.finish(); }, options);
      }
      button.addEventListener('contextmenu', event => event.preventDefault(), options);
      button.addEventListener('keydown', event => {
        if (![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) this.start(button, gift, null);
      }, options);
      button.addEventListener('keyup', event => {
        if (![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        if (this.hold?.button === button) this.finish();
      }, options);
      button.addEventListener('blur', () => { if (this.hold?.button === button) this.finish(); }, options);
      // 辅助技术触发的 click 没有指针手势；普通指针 click 已由 down/up 处理。
      button.addEventListener('click', event => {
        if (event.detail !== 0) return;
        this.play(gift); this.record(gift, 1);
      }, options);
    });
    window.addEventListener('blur', () => this.finish(), options);
    window.addEventListener('pagehide', () => this.finish(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.finish(); }, options);
  }
  start(button, gift, pointerId) {
    this.finish();
    this.hold = { button, gift, pointerId, count: 0 };
    button.classList.add('is-holding');
    this.pulse();
    this.timer = setTimeout(() => this.repeat(), HOLD_DELAY_MS);
  }
  pulse() {
    if (!this.hold || this.hold.count >= BLESSING_LIMITS.giftCount) return;
    this.play(this.hold.gift);
    this.hold.count++;
  }
  repeat() {
    if (!this.hold || document.hidden) return this.finish();
    this.pulse();
    if (this.hold.count < BLESSING_LIMITS.giftCount) this.timer = setTimeout(() => this.repeat(), HOLD_REPEAT_MS);
  }
  finish() {
    clearTimeout(this.timer);
    const hold = this.hold;
    this.hold = null;
    if (!hold) return;
    hold.button.classList.remove('is-holding');
    if (hold.pointerId != null && hold.button.hasPointerCapture(hold.pointerId)) hold.button.releasePointerCapture(hold.pointerId);
    this.record(hold.gift, hold.count);
  }
  remember(requestId) {
    this.playedRequests.add(requestId);
    if (this.playedRequests.size > 200) this.playedRequests.delete(this.playedRequests.values().next().value);
  }
  hasPlayed(requestId) { return this.playedRequests.has(requestId); }
  async record(gift, count) {
    if (this.destroyed || this.recording || Date.now() < this.nextRecordAt) return;
    this.pending ||= this.createMessage(gift, count);
    if (!this.pending) return;
    this.persist(this.pending);
    this.remember(this.pending.requestId);
    this.recording = true;
    this.nextRecordAt = Date.now() + (this.client.giftRecordIntervalMs || 5000);
    try {
      const result = await this.client.send(this.pending);
      this.pending = null; this.persist(null);
      if (!this.destroyed) this.recorded(result.message);
    } catch (error) {
      if (error.status && error.status < 500) { this.pending = null; this.persist(null); }
      if (error.status === 429) this.nextRecordAt = Math.max(this.nextRecordAt, Date.now() + (error.retryAfter || 60) * 1000);
      // 记录受限不撤销本机播放；未知结果保留原请求，下次允许记录时核对，避免重复入簿。
    } finally { this.recording = false; }
  }
  destroy() {
    this.destroyed = true; this.finish(); this.events.abort(); this.playedRequests.clear();
  }
}
