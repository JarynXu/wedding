/** 祝福簿按新到旧阅读；滚轮、触摸或键盘接管后停止自动翻阅。 */
export class BlessingHistory {
  constructor({ list, freshButton, client, renderItem }) {
    Object.assign(this, { list, freshButton, client, renderItem });
    this.events = new AbortController();
    this.items = new Map();
    this.generation = 0;
    const options = { passive: true, signal: this.events.signal };
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) list.addEventListener(type, () => { this.manual = true; }, options);
    list.addEventListener('scroll', () => this.loadNearEnd(), options);
    freshButton.onclick = () => this.open();
    this.frame = requestAnimationFrame(time => this.tick(time));
  }
  async open() {
    this.manual = false; this.next = null; this.failed = false;
    this.initialized = false; this.arrivals = [];
    this.resumeAt = performance.now() + 2200;
    this.freshButton.hidden = true;
    const generation = ++this.generation;
    this.items.clear(); this.list.replaceChildren(); this.list.scrollTop = 0; this.position = 0;
    await this.load(null, generation);
  }
  async load(before, generation = this.generation) {
    this.loading = true;
    this.list.setAttribute('aria-busy', 'true');
    try {
      const result = await this.client.history(before);
      if (generation !== this.generation) return;
      for (const message of result.messages) this.append(message);
      this.next = result.hasMore ? result.next : null;
      if (!this.items.size) this.note('祝福簿正等着第一份心意。');
      if (!before) {
        this.initialized = true;
        for (const message of this.arrivals) this.receive(message);
        this.arrivals = [];
      }
    } catch {
      if (generation !== this.generation) return;
      this.failed = true;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'blessing-history-retry';
      retry.textContent = '没能展开，点此重试';
      retry.onclick = () => { retry.remove(); this.failed = false; this.load(before); };
      this.list.append(retry);
    } finally {
      if (generation === this.generation) { this.loading = false; this.list.removeAttribute('aria-busy'); }
    }
  }
  append(message) {
    if (this.items.has(message.id)) return;
    this.list.querySelector('.blessing-empty')?.remove();
    const item = this.renderItem(message); this.items.set(message.id, item); this.list.append(item);
  }
  receive(message) {
    if (!this.initialized) { if (this.arrivals) this.arrivals.push(message); return; }
    if (this.items.has(message.id)) return;
    const firstId = this.list.querySelector('[data-message-id]')?.dataset.messageId;
    if (firstId && BigInt(message.id) < BigInt(firstId)) return;
    this.list.querySelector('.blessing-empty')?.remove();
    const previousHeight = this.list.scrollHeight, previousTop = this.list.scrollTop;
    const item = this.renderItem(message); this.items.set(message.id, item); this.list.prepend(item);
    if (previousTop > 2) {
      this.list.scrollTop = previousTop + this.list.scrollHeight - previousHeight;
      this.position = this.list.scrollTop;
      this.freshButton.hidden = false;
    } else {
      this.list.scrollTop = 0; this.position = 0; this.resumeAt = performance.now() + 2200;
    }
  }
  note(text) { const node = document.createElement('p'); node.className = 'blessing-empty'; node.textContent = text; this.list.append(node); }
  loadNearEnd() {
    if (this.next && !this.loading && !this.failed && this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 90) this.load(this.next);
  }
  tick(time) {
    const elapsed = Math.min(50, time - (this.lastTime || time)); this.lastTime = time;
    if (!this.manual && !document.hidden && this.list.closest('.modal-backdrop.open') && this.list.getClientRects().length && time > this.resumeAt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const end = Math.max(0, this.list.scrollHeight - this.list.clientHeight);
      this.position = Math.min(end, (this.position || 0) + elapsed * .018);
      this.list.scrollTop = this.position; this.loadNearEnd();
    }
    this.frame = requestAnimationFrame(next => this.tick(next));
  }
  destroy() { this.generation++; this.events.abort(); cancelAnimationFrame(this.frame); }
}
