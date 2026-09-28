import './foil.css';
import { screenVector } from './device-tilt.js';

const lettering = [
  '.cover-kicker', '.cover-names', '.cover-dedication', '.cover-together',
  '.cover-welcome-script', '.cover-welcome-subtitle', '.cover-welcome-message',
  '.chinese-cover-title > div', '.chinese-cover-title > p', '.chinese-cover-blessing', '.chinese-caption',
  '.p2-title-en', '.p2-title-cn', '.p2-year', '.p2-day', '.p2-week', '.p2-agenda-time', '.p2-agenda-event',
  '.p3-title-en', '.p3-title-cn', '.p3-hotel-name', '.p3-hotel-en', '.p3-address',
  '.p4-inviters', '.p4-header-badge', '.p4-intro', '.p4-relation', '.p4-newlywed strong',
  '.p4-family-and', '#p4FamilyOccasion', '.p4-poem strong', '.p4-poem > p:not(:has(strong))', '.p4-footnote',
  '.btn-line-main', '.btn-line-sub',
].join(',');
const clamp = value => Math.max(-.25, Math.min(1.25, value));
const difference = (value, base) => ((value - base + 540) % 360) - 180;

/** 同一束斜光投到当前页文字上；只改变字面反射，不挪动文字或复制可访问内容。 */
export class InvitationFoil {
  constructor(app, { tilt } = {}) {
    this.app = app;
    this.events = new AbortController();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.mode = 'ambient';
    this.position = -.25;
    this.target = .5;
    this.elements = [...app.querySelectorAll(lettering)];
    if (!CSS.supports('background-clip', 'text') || !CSS.supports('color', 'color-mix(in srgb, black, white)')) return;
    for (const element of this.elements) {
      const style = getComputedStyle(element);
      element.style.setProperty('--foil-ink', style.color);
      element.classList.add('foil-text');
    }
    this.supported = true;
    const options = { signal: this.events.signal };
    this.unsubscribeTilt = tilt?.subscribe(sample => {
      if (!this.running) return;
      if (!sample) {
        this.baseline = null;
        if (this.mode === 'orientation') { this.mode = 'ambient'; this.refresh(); }
        return;
      }
      if (this.baseline?.angle !== sample.angle) this.baseline = sample;
      const vector = screenVector(difference(sample.gamma, this.baseline.gamma), difference(sample.beta, this.baseline.beta), sample.angle);
      this.mode = 'orientation';
      this.target = clamp(.5 + vector.x / 55 + vector.y / 85);
      this.wake();
    });
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

  enter() {
    this.entered = true;
    this.refresh();
  }

  refresh() {
    if (!this.supported || this.destroyed) return;
    this.stop();
    this.running = this.entered && !this.motion.matches && !document.hidden;
    this.app.classList.toggle('foil-enabled', this.running);
    if (!this.running) return;
    this.visible = this.elements.filter(element => !element.closest('[hidden]') && element.closest('.page.active, .cover-footer[data-state="active"]'));
    if (this.mode === 'ambient') { this.position = -.25; this.sweepStart = performance.now() + 1800; }
    this.wake();
  }

  wake() {
    if (!this.running) return;
    clearTimeout(this.timer);
    if (!this.frame) { this.lastFrame = performance.now(); this.frame = requestAnimationFrame(time => this.draw(time)); }
  }

  draw(time) {
    this.frame = 0;
    if (!this.running) return;
    if (this.mode === 'ambient') this.position = clamp(-.25 + (time - this.sweepStart) / 8500 * 1.5);
    else this.position += (this.target - this.position) * (1 - Math.exp(-Math.min(time - this.lastFrame, 64) / 90));
    this.lastFrame = time;
    const bounds = this.app.getBoundingClientRect();
    this.app.style.setProperty('--foil-band', `${Math.max(72, Math.min(132, bounds.width * .26))}px`);
    const light = this.position * (bounds.width * .9063 + bounds.height * .4226);
    const geometry = this.visible.map(element => ({ element, rect:element.getBoundingClientRect() }));
    for (const { element, rect } of geometry) {
      const offset = light - (rect.left - bounds.left) * .9063 - (rect.top - bounds.top) * .4226;
      element.style.setProperty('--foil-position', `${offset.toFixed(2)}px`);
    }
    if (this.mode === 'ambient' && time < this.sweepStart) this.timer = setTimeout(() => this.wake(), this.sweepStart - time);
    else if (this.mode === 'ambient' && this.position >= 1.25) {
      this.sweepStart = time + 8500;
      this.timer = setTimeout(() => this.wake(), 8500);
    } else if (this.mode === 'ambient' || Math.abs(this.target - this.position) > .0005) this.frame = requestAnimationFrame(next => this.draw(next));
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame); this.frame = 0; clearTimeout(this.timer);
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.events.abort();
    this.unsubscribeTilt?.();
    this.observer?.disconnect();
    this.resize?.disconnect();
    this.app.classList.remove('foil-enabled');
    this.app.style.removeProperty('--foil-band');
    for (const element of this.elements) {
      element.classList.remove('foil-text');
      for (const name of ['--foil-ink','--foil-band','--foil-position']) element.style.removeProperty(name);
    }
  }
}
