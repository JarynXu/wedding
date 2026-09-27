import './calendar-layer.css';

/** 日历指南拥有返回记录，播放器继续留在请柬文档；地址仍可直接在外部浏览器打开。 */
export class InvitationCalendar {
  constructor(app) {
    this.app = app;
    this.events = new AbortController();
    const options = { signal:this.events.signal };
    window.addEventListener('popstate', () => {
      this.closing = false;
      const url = history.state?.invitationCalendar;
      if (url) this.show(url); else this.hide();
    }, options);
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== this.frame?.contentWindow) return;
      if (event.data?.type === 'wedding-calendar-ready') {
        clearTimeout(this.timeout);
        this.pending.hidden = true;
        this.frame.hidden = false;
      }
      if (event.data?.type === 'wedding-calendar-back') this.back();
    }, options);
    for (const host of [window, window.visualViewport].filter(Boolean)) host.addEventListener('resize', () => this.fit(), options);
    window.visualViewport?.addEventListener('scroll', () => this.fit(), options);
  }

  open(url) {
    if (this.dialog?.open) return;
    this.returnFocus = document.querySelector('.calendar-button');
    history.pushState({ ...history.state, invitationCalendar:url.href }, '', url);
    this.show(url.href);
  }

  show(url) {
    if (!this.dialog) this.create();
    if (this.url !== url) { this.url = url; this.load(); }
    if (!this.dialog.open) this.dialog.showModal();
    this.fit();
  }

  create() {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'invitation-calendar-layer';
    this.dialog.setAttribute('aria-label', '保存婚礼日程');
    this.pending = document.createElement('div'); this.pending.className = 'calendar-layer-pending';
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回请柬'; back.onclick = () => this.back();
    this.status = document.createElement('p'); this.status.textContent = '正在打开婚礼日程…';
    this.retry = document.createElement('button'); this.retry.type = 'button'; this.retry.textContent = '重新打开'; this.retry.hidden = true; this.retry.onclick = () => this.load();
    this.pending.append(back, this.status, this.retry);
    this.frame = document.createElement('iframe'); this.frame.title = '保存婚礼日程'; this.frame.hidden = true;
    this.dialog.append(this.pending, this.frame); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.back(); }, { signal:this.events.signal });
  }

  load() {
    const url = new URL(this.url); url.searchParams.set('embedded', '1');
    this.pending.hidden = false; this.frame.hidden = true; this.retry.hidden = true;
    this.status.textContent = '正在打开婚礼日程…';
    if (this.frame.hasAttribute('src')) this.frame.contentWindow.location.replace(url.href);
    else this.frame.src = url.href;
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => { this.status.textContent = '婚礼日程暂时未能打开'; this.retry.hidden = false; }, 12000);
  }

  back() {
    if (this.closing) return;
    if (history.state?.invitationCalendar) { this.closing = true; history.back(); }
    else this.hide();
  }

  hide() {
    if (!this.dialog?.open) return;
    this.dialog.close();
    this.returnFocus?.focus({ preventScroll:true });
  }

  fit() {
    if (!this.dialog?.open) return;
    const rect = this.app.getBoundingClientRect(), viewport = window.visualViewport;
    const mobile = document.documentElement.clientWidth < 500;
    Object.assign(this.dialog.style, {
      left:(mobile ? viewport?.offsetLeft || 0 : rect.left)+'px',
      top:(viewport?.offsetTop || 0)+'px',
      width:(mobile ? viewport?.width || innerWidth : rect.width)+'px',
      height:(viewport?.height || innerHeight)+'px',
    });
  }

  destroy() { this.events.abort(); clearTimeout(this.timeout); this.dialog?.remove(); }
}
