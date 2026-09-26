import './foil.css';

const lettering = [
  '.cover-kicker', '.cover-names', '.cover-dedication', '.cover-together',
  '.cover-welcome-script', '.cover-welcome-subtitle', '.cover-welcome-message',
  '.chinese-cover-title > div', '.chinese-cover-title > p', '.chinese-cover-blessing', '.chinese-caption',
  '.p2-title-en', '.p2-title-cn', '.p2-year', '.p2-day', '.p2-week', '.p2-agenda-time', '.p2-agenda-event',
  '.p3-title-en', '.p3-title-cn', '.p3-hotel-name', '.p3-hotel-en', '.p3-address',
  '.p4-inviters', '.p4-header-badge', '.p4-intro', '.p4-relation', '.p4-newlywed strong',
  '.p4-family-and', '#p4FamilyOccasion', '.p4-poem strong', '.p4-poem > p:not(:has(strong))', '.p4-footnote',
  '.btn-line-main', '.btn-line-sub', '.game-entry span', '.game-entry small',
].join(',');
const clamp = value => Math.max(-.08, Math.min(1.08, value));
const difference = (value, base) => ((value - base + 540) % 360) - 180;

/** 同一束斜光投到当前页文字上；只改变字面反射，不挪动文字或复制可访问内容。 */
export class InvitationFoil {
  constructor(app, { feedback = () => {} } = {}) {
    this.app = app;
    this.feedback = feedback;
    this.events = new AbortController();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.mode = 'ambient';
    this.position = -.08;
    this.target = .5;
    this.elements = [...app.querySelectorAll(lettering)];
    if (!CSS.supports('background-clip', 'text') || !CSS.supports('color', 'color-mix(in srgb, black, white)')) return;
    for (const element of this.elements) {
      const style = getComputedStyle(element);
      element.style.setProperty('--foil-ink', style.color);
      element.style.setProperty('--foil-band', `${Math.max(7, Math.min(22, parseFloat(style.fontSize) * .5))}px`);
      element.classList.add('foil-text');
    }
    this.supported = true;
    const options = { signal: this.events.signal };
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'foil-permission glass-surface glass-action';
    this.button.textContent = '✧ 启用倾斜流光';
    this.button.hidden = true;
    app.append(this.button);
    this.button.addEventListener('click', () => this.requestOrientation(), options);
    this.needsPermission = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
    this.motion.addEventListener('change', () => this.refresh(), options);
    document.addEventListener('visibilitychange', () => this.refresh(), options);
    window.addEventListener('pageshow', () => this.refresh(), options);
    window.addEventListener('pagehide', () => this.stop(), options);
    window.addEventListener('orientationchange', () => { this.baseline = null; this.refresh(); }, options);
    app.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || !this.running || this.mode === 'orientation') return;
      const bounds = app.getBoundingClientRect();
      this.mode = 'pointer';
      this.target = clamp(((event.clientX - bounds.left) * .9063 + (event.clientY - bounds.top) * .4226) / (bounds.width * .9063 + bounds.height * .4226));
      this.wake();
    }, options);
    app.addEventListener('pointerleave', () => {
      if (this.mode === 'pointer') { this.mode = 'ambient'; this.refresh(); }
    }, options);
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(app.querySelector('.swiper-wrapper'), { subtree:true, attributes:true, attributeFilter:['class','hidden'] });
    this.resize = new ResizeObserver(() => { if (this.running) this.wake(); });
    this.resize.observe(app);
  }

  enter() { this.entered = true; this.refresh(); }

  refresh() {
    if (!this.supported || this.destroyed) return;
    this.stop();
    this.running = this.entered && !this.motion.matches && !document.hidden;
    this.app.classList.toggle('foil-enabled', this.running);
    this.button.hidden = !this.running || !this.needsPermission || this.permissionResolved || !window.isSecureContext;
    if (!this.running) return;
    if (!this.needsPermission || this.permissionGranted) this.listenOrientation();
    this.visible = this.elements.filter(element => !element.closest('[hidden]') && element.closest('.page.active, .cover-footer[data-state="active"]'));
    if (this.mode === 'ambient') { this.position = -.08; this.sweepStart = performance.now() + 1200; }
    this.wake();
  }

  listenOrientation() {
    if (!this.running || this.sensorEvents) return;
    this.sensorEvents = new AbortController();
    window.addEventListener('deviceorientation', event => {
      if (!this.running || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      this.baseline ??= { beta:event.beta, gamma:event.gamma };
      const x = difference(event.gamma, this.baseline.gamma), y = difference(event.beta, this.baseline.beta);
      const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
      const horizontal = x * Math.cos(angle) + y * Math.sin(angle);
      const vertical = y * Math.cos(angle) - x * Math.sin(angle);
      this.mode = 'orientation';
      this.target = clamp(.5 + horizontal / 55 + vertical / 85);
      this.wake();
    }, { signal:this.sensorEvents.signal, passive:true });
  }

  async requestOrientation() {
    if (this.button.disabled || this.destroyed) return;
    this.button.disabled = true;
    try {
      const granted = await window.DeviceOrientationEvent.requestPermission();
      if (this.destroyed) return;
      if (granted === 'granted') { this.permissionGranted = true; this.listenOrientation(); this.feedback('轻轻倾斜手机，看看字上的流光'); }
      else this.feedback('未开启倾斜感应，文字仍会自动流光');
    } catch { if (!this.destroyed) this.feedback('当前浏览器使用自动流光'); }
    finally { this.permissionResolved = true; this.button.hidden = true; }
  }

  wake() {
    if (!this.running) return;
    clearTimeout(this.timer);
    if (!this.frame) { this.lastFrame = performance.now(); this.frame = requestAnimationFrame(time => this.draw(time)); }
  }

  draw(time) {
    this.frame = 0;
    if (!this.running) return;
    if (this.mode === 'ambient') this.position = clamp(-.08 + (time - this.sweepStart) / 2800 * 1.16);
    else this.position += (this.target - this.position) * (1 - Math.exp(-Math.min(time - this.lastFrame, 64) / 90));
    this.lastFrame = time;
    const bounds = this.app.getBoundingClientRect();
    const light = this.position * (bounds.width * .9063 + bounds.height * .4226);
    const geometry = this.visible.map(element => ({ element, rect:element.getBoundingClientRect() }));
    for (const { element, rect } of geometry) {
      const offset = light - (rect.left - bounds.left) * .9063 - (rect.top - bounds.top) * .4226;
      element.style.setProperty('--foil-position', `${offset.toFixed(2)}px`);
    }
    if (this.mode === 'ambient' && time < this.sweepStart) this.timer = setTimeout(() => this.wake(), this.sweepStart - time);
    else if (this.mode === 'ambient' && this.position >= 1.08) {
      this.sweepStart = time + 8500;
      this.timer = setTimeout(() => this.wake(), 8500);
    } else if (this.mode === 'ambient' || Math.abs(this.target - this.position) > .0005) this.frame = requestAnimationFrame(next => this.draw(next));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame); this.frame = 0; clearTimeout(this.timer);
    this.sensorEvents?.abort(); this.sensorEvents = null;
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.events.abort();
    this.observer?.disconnect();
    this.resize?.disconnect();
    this.button?.remove();
    this.app.classList.remove('foil-enabled');
    for (const element of this.elements) {
      element.classList.remove('foil-text');
      for (const name of ['--foil-ink','--foil-band','--foil-position']) element.style.removeProperty(name);
    }
  }
}
