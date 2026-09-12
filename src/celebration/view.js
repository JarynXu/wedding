import { giftsForTheme, findGift, BLESSING_LIMITS } from './catalog.js';
import { BlessingsClient } from './client.js';
import { GiftEffects } from './gift-effects.js';
import { QuickGifts } from './quick-gifts.js';
import './celebration.css';

const noteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 5h16v12H9l-5 3V5Z"/><path d="M8 9h8M8 13h5"/></svg>';
const textNode = (tag, className, text) => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
const giftLabel = message => `送来${message.giftName}${message.giftCount > 1 ? ` × ${message.giftCount}` : ''}`;
const memory = {
  read(key) { try { return JSON.parse(localStorage.getItem(`wedding.blessings.${key}`)); } catch { return null; } },
  write(key, value) { try { localStorage.setItem(`wedding.blessings.${key}`, JSON.stringify(value)); } catch { /* 浏览器禁用存储时，当前页面仍可发送。 */ } },
};
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function giftIcon(id) {
  const gift = findGift(id);
  const icon = document.createElement('span');
  icon.className = 'blessing-gift-art';
  icon.setAttribute('aria-hidden', 'true');
  if (gift) { icon.style.setProperty('--gift-x', `${gift.sprite % 3 * 50}%`); icon.style.setProperty('--gift-y', `${Math.floor(gift.sprite / 3) * 100}%`); }
  return icon;
}

/** 页面只拥有一个祝福入口；翻页不创建连接，也不重播队列。 */
export class Celebration {
  constructor({ app, theme, openModal, closeModal }) {
    this.app = app; this.theme = theme; this.openModal = openModal; this.closeModal = closeModal;
    this.events = new AbortController();
    this.messageVersion = 0;
    this.seen = new Set();
    this.queue = [];
    this.lastBubble = 0;
    this.bubbleTimers = new Set();
    this.clientId = memory.read('clientId') || uuid();
    memory.write('clientId', this.clientId);
    this.pending = memory.read('pending');
    this.pendingGift = memory.read('pendingGift');
    if (this.pendingGift?.clientId !== this.clientId || this.pendingGift?.theme !== theme || this.pendingGift?.text !== '' || !findGift(this.pendingGift?.gift)) this.pendingGift = null;
    this.entered = false;
    this.enabled = false;
    this.destroyed = false;
    this.createView();
    this.effects = new GiftEffects(this.canvas, theme);
    this.client = new BlessingsClient({ onSync: snapshot => this.sync(snapshot), onMessage: message => this.receive(message), onState: state => this.connectionState(state) });
    this.quick = new QuickGifts({
      buttons: this.dock.querySelectorAll('[data-quick-gift]'), client: this.client, pending: this.pendingGift,
      play: id => this.effects.play(id), persist: message => memory.write('pendingGift', message), recorded: message => this.receive(message, true),
      createMessage: (gift, giftCount) => {
        const name = this.nameInput.value.trim().normalize('NFC');
        if ([...name].length > BLESSING_LIMITS.name) return null;
        memory.write('name', name);
        return { requestId: uuid(), clientId: this.clientId, name, text: '', gift, giftCount, theme: this.theme };
      },
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.client.pause(); this.clearVisuals(); }
      else if (this.enabled && this.entered) this.client.connect();
    }, { signal: this.events.signal });
    this.timer = setInterval(() => this.flushBubble(), 650);
  }
  createView() {
    this.entry = document.createElement('button');
    this.entry.type = 'button'; this.entry.className = 'blessing-entry'; this.entry.id = 'blessingEntry'; this.entry.hidden = true;
    this.entry.innerHTML = `${noteIcon}<span>送祝福</span>`;
    this.entry.setAttribute('aria-haspopup', 'dialog');
    this.entry.addEventListener('click', () => { this.openModal('blessingsModal'); this.selectTab('compose'); }, { signal: this.events.signal });
    this.lane = document.createElement('div'); this.lane.className = 'blessing-lane'; this.lane.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas'); this.canvas.className = 'gift-effects'; this.canvas.setAttribute('aria-hidden', 'true');
    this.dock = textNode('div', 'blessing-dock', ''); this.dock.hidden = true;
    const gifts = textNode('div', 'blessing-quick-gifts', ''); gifts.setAttribute('role', 'group'); gifts.setAttribute('aria-label', '点按送出礼物');
    giftsForTheme(this.theme).forEach(gift => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.quickGift = gift.id;
      button.setAttribute('aria-label', `送${gift.name}`); button.title = `送${gift.name}`;
      button.append(giftIcon(gift.id), textNode('span', 'blessing-quick-label', gift.name));
      gifts.append(button);
    });
    this.dock.append(this.entry, gifts);
    this.app.append(this.canvas, this.lane, this.dock);
    this.announcement = textNode('span', 'blessing-announcement', ''); this.announcement.setAttribute('role', 'status'); this.app.append(this.announcement);
    this.modal = document.createElement('div'); this.modal.className = 'modal-backdrop'; this.modal.id = 'blessingsModal'; this.modal.inert = true;
    this.modal.innerHTML = `<section class="modal-card glass-surface blessings-card" role="dialog" aria-modal="true" aria-label="祝福与祝福簿">
      <button class="modal-close" type="button" data-close-modal="blessingsModal" aria-label="关闭祝福面板">×</button>
      <div class="blessings-tabs" role="tablist" aria-label="祝福面板"><button type="button" role="tab" id="blessingComposeTab" aria-controls="blessingCompose" aria-selected="true" data-tab="compose">送祝福</button><button type="button" role="tab" id="blessingHistoryTab" aria-controls="blessingHistory" aria-selected="false" data-tab="history" tabindex="-1">祝福簿</button></div>
      <form id="blessingCompose" role="tabpanel" aria-labelledby="blessingComposeTab">
        <label class="blessing-label" for="blessingName">您的称呼 <span>选填</span></label><input id="blessingName" name="name" autocomplete="nickname" placeholder="让新人知道是谁的心意" maxlength="48">
        <label class="blessing-label" for="blessingMessage">写下祝福 <span id="blessingCount">0 / 120</span></label><textarea id="blessingMessage" name="text" rows="3" maxlength="240" placeholder="愿你们岁岁相伴，年年欢喜。"></textarea>
        <fieldset class="blessing-gifts"><legend>捎上一份心意 <span>选填</span></legend><div class="blessing-gift-options"></div></fieldset>
        <p class="blessing-audience">祝福将收录于祝福簿，来宾均可看见。</p>
        <button type="submit" class="blessing-send">送出祝福 <span aria-hidden="true">✧</span></button>
        <p class="blessing-result" role="status" aria-live="polite"></p>
      </form>
      <div id="blessingHistory" role="tabpanel" aria-labelledby="blessingHistoryTab" hidden><button type="button" class="blessing-new" hidden>有新的祝福 · 查看</button><div class="blessing-history-list"></div><div class="blessing-history-nav"><button type="button" data-history="latest">最近祝福</button><button type="button" data-history="older">更早祝福</button></div></div>
    </section>`;
    document.body.append(this.modal);
    const fitKeyboard = () => {
      this.modal.style.setProperty('--blessing-viewport-height', `${window.visualViewport?.height || innerHeight}px`);
      this.modal.style.setProperty('--blessing-viewport-top', `${window.visualViewport?.offsetTop || 0}px`);
    };
    fitKeyboard();
    window.visualViewport?.addEventListener('resize', fitKeyboard, { signal: this.events.signal });
    window.visualViewport?.addEventListener('scroll', fitKeyboard, { signal: this.events.signal });
    window.addEventListener('resize', fitKeyboard, { signal: this.events.signal });
    this.form = this.modal.querySelector('form');
    this.nameInput = this.form.elements.name;
    this.textInput = this.form.elements.text;
    this.result = this.modal.querySelector('.blessing-result');
    this.submit = this.modal.querySelector('.blessing-send');
    this.nameInput.value = memory.read('name') || '';
    this.selectedGift = '';
    const availableGifts = giftsForTheme(this.theme);
    if (this.pending?.clientId === this.clientId && typeof this.pending.text === 'string' && typeof this.pending.name === 'string') {
      this.nameInput.value = this.pending.name;
      this.textInput.value = this.pending.text;
      this.selectedGift = findGift(this.pending.gift)?.id || '';
      if (this.selectedGift && !availableGifts.some(gift => gift.id === this.selectedGift)) availableGifts.push(findGift(this.selectedGift));
      this.result.textContent = '上次发送的结果待确认。点击送出可确认或重试。';
    } else this.pending = null;
    const options = this.modal.querySelector('.blessing-gift-options');
    availableGifts.forEach(gift => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.gift = gift.id;
      button.setAttribute('aria-pressed', String(this.selectedGift === gift.id));
      button.append(giftIcon(gift.id), textNode('span', '', gift.name));
      button.addEventListener('click', () => {
        this.selectedGift = this.selectedGift === gift.id ? '' : gift.id;
        options.querySelectorAll('button').forEach(option => option.setAttribute('aria-pressed', String(option.dataset.gift === this.selectedGift)));
      }, { signal: this.events.signal });
      options.append(button);
    });
    const updateCount = () => { this.modal.querySelector('#blessingCount').textContent = `${[...this.textInput.value].length} / ${BLESSING_LIMITS.text}`; };
    this.textInput.addEventListener('input', updateCount, { signal: this.events.signal }); updateCount();
    this.form.addEventListener('submit', event => { event.preventDefault(); this.send(); }, { signal: this.events.signal });
    this.modal.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => this.selectTab(tab.dataset.tab), { signal: this.events.signal });
      tab.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const target = event.key === 'Home' ? 'compose' : event.key === 'End' ? 'history' : tab.dataset.tab === 'compose' ? 'history' : 'compose';
          this.selectTab(target); this.modal.querySelector(`[data-tab="${target}"]`).focus();
        }
      }, { signal: this.events.signal });
    });
    this.modal.querySelector('[data-history="latest"]').onclick = () => this.loadHistory();
    this.modal.querySelector('[data-history="older"]').onclick = () => this.loadHistory(this.historyNext);
    this.modal.querySelector('.blessing-new').onclick = () => this.loadHistory();
    this.modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...this.modal.querySelectorAll('button:not(:disabled),input,textarea,[tabindex="0"]')].filter(node => node.getClientRects().length && node.tabIndex >= 0);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }, { signal: this.events.signal });
  }
  async enter() {
    this.entered = true;
    try {
      this.enabled = await this.client.available();
      if (this.destroyed || !this.enabled) return;
      this.entry.hidden = false;
      this.dock.hidden = false; this.app.dataset.celebration = 'enabled';
      this.client.connect();
    } catch {
      if (this.destroyed) return;
      this.entry.hidden = false;
      this.dock.hidden = false; this.app.dataset.celebration = 'enabled';
      this.connectionState('unavailable');
      // 配置请求失败不等于未开放；保留发送与重试入口。
      this.enabled = true;
      this.client.connect();
    }
  }
  connectionState(state) {
    this.entry.dataset.connection = state;
  }
  sync(snapshot) {
    this.messageVersion++;
    snapshot.messages.forEach(message => this.remember(message.id));
    if (!this.hadSnapshot) this.queue.push(...snapshot.messages.slice(-3).map(message => ({ message, historical: true })));
    this.hadSnapshot = true;
    if (snapshot.messages.length) this.modal.querySelector('.blessing-new').hidden = false;
  }
  remember(id) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
    return true;
  }
  receive(message, own = false) {
    this.messageVersion++;
    const fresh = this.remember(message.id);
    this.modal.querySelector('.blessing-new').hidden = false;
    if (!fresh || document.hidden || this.quick.hasPlayed(message.requestId)) return;
    this.queue.push({ message, historical: false, own });
    if (this.queue.length > 12) this.queue.splice(0, this.queue.length - 12);
    this.flushBubble();
  }
  flushBubble() {
    if (!this.enabled || !this.entered || document.hidden || !this.queue.length || this.lane.children.length >= 2 || Date.now() - this.lastBubble < 3200 || document.querySelector('.modal-backdrop.open')) return;
    const { message, historical } = this.queue.shift();
    this.lastBubble = Date.now();
    const bubble = document.createElement('div'); bubble.className = 'blessing-bubble'; bubble.dataset.messageId = message.id;
    if (message.gift) bubble.append(giftIcon(message.gift));
    const content = document.createElement('div');
    content.append(textNode('span', 'blessing-bubble-name', message.name), textNode('span', 'blessing-bubble-text', message.text || giftLabel(message)));
    bubble.classList.toggle('has-gift', Boolean(message.gift));
    bubble.append(content); this.lane.append(bubble);
    const timeout = setTimeout(() => { bubble.remove(); this.bubbleTimers.delete(timeout); }, 7200);
    this.bubbleTimers.add(timeout);
    if (!historical && message.gift) this.effects.play(message.gift);
  }
  clearVisuals() { this.queue = []; this.lane.replaceChildren(); this.effects.clear(); for (const timer of this.bubbleTimers) clearTimeout(timer); this.bubbleTimers.clear(); }
  selectTab(tab) {
    const changed = this.selectedTab && this.selectedTab !== tab;
    this.selectedTab = tab;
    this.modal.querySelector('.blessings-tabs').dataset.active = tab;
    this.modal.querySelectorAll('[data-tab]').forEach(button => { const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    this.form.hidden = tab !== 'compose'; this.modal.querySelector('#blessingHistory').hidden = tab !== 'history';
    this.tabAnimation?.cancel();
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const panel = tab === 'compose' ? this.form : this.modal.querySelector('#blessingHistory');
      this.tabAnimation = panel.animate([{ opacity: .6, transform: `translateX(${tab === 'history' ? 6 : -6}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 160, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    if (tab === 'history') this.loadHistory();
  }
  async loadHistory(before = null) {
    const generation = this.historyGeneration = (this.historyGeneration || 0) + 1;
    const version = this.messageVersion;
    const list = this.modal.querySelector('.blessing-history-list');
    const buttons = this.modal.querySelectorAll('[data-history]'); buttons.forEach(button => { button.disabled = true; });
    list.replaceChildren(textNode('p', 'blessing-empty', '正在展开祝福簿…'));
    try {
      const result = await this.client.history(before);
      if (this.destroyed || this.historyGeneration !== generation) return;
      list.replaceChildren();
      this.historyNext = result.next;
      result.messages.forEach(message => {
        const item = textNode('article', 'blessing-history-item', '');
        const header = textNode('header', '', ''); header.append(textNode('strong', '', message.name), textNode('time', '', new Date(message.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
        item.append(header);
        if (message.text) item.append(textNode('p', '', message.text));
        if (message.gift) { const gift = textNode('div', 'blessing-history-gift', ''); gift.append(giftIcon(message.gift), textNode('span', '', giftLabel(message))); item.append(gift); }
        list.append(item);
      });
      if (!result.messages.length) list.append(textNode('p', 'blessing-empty', '祝福簿正等着第一份心意。'));
      this.modal.querySelector('.blessing-new').hidden = version === this.messageVersion;
      this.modal.querySelector('[data-history="older"]').disabled = !result.hasMore;
      this.modal.querySelector('[data-history="latest"]').disabled = !before;
    } catch (error) {
      if (this.historyGeneration !== generation || this.destroyed) return;
      list.replaceChildren(textNode('p', 'blessing-empty', error.message || '祝福簿暂时无法打开'));
      this.modal.querySelector('[data-history="latest"]').disabled = false;
    }
  }
  async send() {
    if (this.sending) return;
    const name = this.nameInput.value.trim().normalize('NFC');
    const text = this.textInput.value.trim().normalize('NFC');
    if ([...name].length > BLESSING_LIMITS.name || [...text].length > BLESSING_LIMITS.text) { this.result.textContent = '称呼请在 24 字内，祝福请在 120 字内。'; return; }
    if (!text && !this.selectedGift) { this.result.textContent = '写一句祝福，或选一份心意。'; this.textInput.focus(); return; }
    const samePending = this.pending && this.pending.name === name && this.pending.text === text && this.pending.gift === this.selectedGift;
    if (!samePending) this.pending = { requestId: uuid(), clientId: this.clientId, name, text, gift: this.selectedGift, theme: this.theme };
    memory.write('pending', this.pending); memory.write('name', name);
    this.sending = true; this.submit.disabled = true; this.form.setAttribute('aria-busy', 'true');
    this.form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
    this.result.textContent = '正在送出心意…';
    try {
      const result = await this.client.send(this.pending);
      if (this.destroyed) return;
      this.pending = null; memory.write('pending', null);
      this.receive(result.message, true);
      this.result.textContent = '祝福已送达，收录于祝福簿。';
      this.announcement.textContent = this.result.textContent;
      this.entry.querySelector('span').textContent = '已送达';
      clearTimeout(this.confirmationTimer);
      this.confirmationTimer = setTimeout(() => { this.entry.querySelector('span').textContent = '送祝福'; }, 4000);
      this.textInput.value = ''; this.selectedGift = '';
      this.modal.querySelector('#blessingCount').textContent = '0 / 120';
      this.modal.querySelectorAll('[data-gift]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      this.closeModal('blessingsModal'); this.flushBubble();
    } catch (error) {
      if (this.destroyed) return;
      this.result.textContent = error.status && error.status < 500 ? error.message : '暂未确认送达。内容已保留，点击送出可确认或重试。';
    } finally { this.sending = false; this.form.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = false; }); this.form.removeAttribute('aria-busy'); }
  }
  destroy() {
    this.destroyed = true; this.events.abort(); clearInterval(this.timer); clearTimeout(this.confirmationTimer); this.quick.destroy(); this.tabAnimation?.cancel(); this.clearVisuals(); this.client.destroy(); this.effects.destroy();
    this.dock.remove(); this.lane.remove(); this.canvas.remove(); this.modal.remove(); this.announcement.remove(); delete this.app.dataset.celebration;
  }
}
