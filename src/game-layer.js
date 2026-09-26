import { refreshRegisteredGuest } from './guest-name.js';
import './game-layer.css';

/** 请柬拥有活动窗口和浏览器返回记录；子页面保留登录与聊天状态，音乐留在请柬内。 */
export class InvitationGame {
  constructor({ entry, sealEntry, app }) {
    this.entry = entry; this.app = app; this.events = new AbortController();
    const options = { signal: this.events.signal };
    const activate = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (this.dialog?.open) return;
      const url = new URL(location.href); url.hash = 'challenge';
      history.pushState({ ...history.state, invitationGame: true }, '', url);
      this.open();
    };
    for (const control of [entry, sealEntry].filter(Boolean)) control.addEventListener('click', activate, options);
    window.addEventListener('popstate', () => { this.closing = false; if (history.state?.invitationGame) this.open(); else this.hide(); }, options);
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== this.frame?.contentWindow) return;
      if (event.data?.type === 'wedding-game-ready') {
        this.pending.hidden = true; this.frame.hidden = false; clearTimeout(this.timeout); this.notify();
      }
      if (event.data?.type === 'wedding-game-back') this.back();
    }, options);
    const fit = () => this.fit();
    window.addEventListener('resize', fit, options);
    window.visualViewport?.addEventListener('resize', fit, options);
    window.visualViewport?.addEventListener('scroll', fit, options);
  }
  create() {
    this.dialog = document.createElement('dialog'); this.dialog.className = 'invitation-game-layer'; this.dialog.setAttribute('aria-label', '默契挑战');
    this.pending = document.createElement('div'); this.pending.className = 'game-layer-pending';
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回请柬'; back.onclick = () => this.back();
    this.status = document.createElement('p'); this.status.textContent = '喜宴司仪正在过来…';
    this.retry = document.createElement('button'); this.retry.type = 'button'; this.retry.textContent = '再试一次'; this.retry.hidden = true; this.retry.onclick = () => this.load();
    this.pending.append(back, this.status, this.retry);
    this.frame = document.createElement('iframe'); this.frame.title = '默契挑战'; this.frame.hidden = true;
    this.dialog.append(this.pending, this.frame); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.back(); }, { signal: this.events.signal });
    this.load();
  }
  load() {
    this.retry.hidden = true; this.status.textContent = '喜宴司仪正在过来…';
    const url = new URL(this.entry.href); url.searchParams.set('embedded', '1'); this.frame.src = url.href;
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => { this.status.textContent = '这场小聚还没打开'; this.retry.hidden = false; }, 15000);
  }
  open() {
    if (!this.dialog) this.create();
    if (!this.dialog.open) this.dialog.showModal();
    this.fit(); this.notify();
  }
  back() {
    if (this.closing) return;
    if (history.state?.invitationGame) { this.closing = true; history.back(); }
    else this.hide();
  }
  hide() { this.dialog?.close(); this.notify(); this.entry.focus({ preventScroll: true }); refreshRegisteredGuest(); }
  notify() { this.frame?.contentWindow?.postMessage({ type: 'wedding-game-visibility', visible: Boolean(this.dialog?.open) }, location.origin); }
  fit() {
    if (!this.dialog?.open) return;
    const rect = this.app.getBoundingClientRect(), viewport = window.visualViewport;
    // 手机键盘可能滚动外层文档，活动窗口仍占据整个可见区域，不与已偏移的请柬求交集。
    if (document.documentElement.clientWidth < 500) {
      Object.assign(this.dialog.style, { left:(viewport?.offsetLeft || 0)+'px', top:(viewport?.offsetTop || 0)+'px', width:(viewport?.width || innerWidth)+'px', height:(viewport?.height || innerHeight)+'px' });
      return;
    }
    const top = Math.max(rect.top, viewport?.offsetTop || 0);
    const bottom = Math.min(rect.bottom, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight));
    Object.assign(this.dialog.style, { left: rect.left + 'px', top: top + 'px', width: rect.width + 'px', height: Math.max(180, bottom - top) + 'px' });
  }
  destroy() { this.events.abort(); clearTimeout(this.timeout); this.dialog?.remove(); }
}
