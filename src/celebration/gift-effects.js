import { findGift } from './catalog.js';
import { rosePetalsUrl } from '../petals.js';
const atlasUrl = new URL('../assets/celebration-gifts.webp', import.meta.url).href;

/** 礼物效果只在一次确认发送后播放；画布与动画由此对象释放。 */
export class GiftEffects {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.theme = theme;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.atlas = new Image();
    this.atlas.src = atlasUrl;
    this.atlas.decode().catch(() => { this.canvas.dataset.assets = 'unavailable'; });
    this.petals = new Image(); this.petals.src = rosePetalsUrl;
    this.frame = null;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
  }
  resize() {
    this.clear();
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  play(id) {
    const gift = findGift(id);
    if (!gift || !this.context || this.motion.matches || document.hidden || this.frame != null) return;
    const seed = Math.random() * Math.PI;
    const sparks = Array.from({ length: gift.effect === 'fireworks' ? 96 : 28 }, (_, i) => ({
      angle: i * 2.39996 + seed, speed: 18 + Math.random() * 50,
      life: 1.1 + Math.random() * 0.9, radius: 0.6 + Math.random(), side: i % 2,
    }));
    this.canvas.dataset.gift = id;
    this.canvas.dataset.state = 'playing';
    let started;
    const tick = now => {
      started ??= now;
      const t = (now - started) / 1000;
      if (t >= 3.4 || document.hidden || this.motion.matches) { this.clear(); return; }
      const c = this.context;
      c.clearRect(0, 0, this.width, this.height);
      const opacity = Math.min(t / 0.35, 1) * Math.min((3.4 - t) / 0.8, 1);
      if (gift.effect === 'fireworks') {
        for (let side = 0; side < 2; side++) {
          const launch = t - side * .35;
          if (launch < 0 || launch > .35) continue;
          const x = this.width * (side ? .87 : .13), target = this.height * (side ? .24 : .17);
          const y = target + (1 - launch / .35) * 95;
          c.globalAlpha = Math.sin(launch / .35 * Math.PI); c.strokeStyle = '#e7bc70'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, y + 24); c.lineTo(x, y); c.stroke();
        }
        for (const p of sparks) {
          const age = t - 0.35 - p.side * 0.35;
          if (age < 0 || age > p.life) continue;
          const x = this.width * (p.side ? 0.87 : 0.13);
          const y = this.height * (p.side ? 0.24 : 0.17);
          const distance = p.speed * (1 - Math.exp(-age * 1.5));
          c.globalAlpha = (1 - age / p.life) * 0.95;
          c.strokeStyle = this.theme === 'chinese' && p.side ? '#b63823' : '#e9be72';
          c.lineWidth = p.radius;
          c.beginPath();
          c.moveTo(x + Math.cos(p.angle) * distance * 0.82, y + Math.sin(p.angle) * distance * 0.82 + age * age * 10);
          c.lineTo(x + Math.cos(p.angle) * distance, y + Math.sin(p.angle) * distance + age * age * 10);
          c.stroke();
        }
      } else {
        const rise = gift.effect === 'lantern' ? t * 70 : gift.effect === 'petals' ? t * 32 : t * 15;
        const y = this.height - 230 - rise;
        const size = gift.effect === 'knot' ? 86 : 76;
        if (gift.effect === 'lantern') {
          const glow = c.createRadialGradient(57, y, 3, 57, y, 57);
          glow.addColorStop(0, '#f6bc5066'); glow.addColorStop(1, '#f6bc5000');
          c.globalAlpha = opacity; c.fillStyle = glow; c.fillRect(0, y - 57, 114, 114);
        }
        if (gift.effect === 'seal' && t < 1.3) {
          c.globalAlpha = (1 - t / 1.3) * .5; c.strokeStyle = '#bb9353'; c.lineWidth = 1;
          c.beginPath(); c.arc(57, y, 32 + t * 22, 0, Math.PI * 2); c.stroke();
        }
        c.save();
        c.globalAlpha = opacity;
        c.translate(57 + Math.sin(t * 1.6) * 8, y);
        c.rotate(Math.sin(t * 2) * (gift.effect === 'seal' ? 0.015 : 0.07));
        const scale = gift.effect === 'seal' ? 1 + Math.exp(-t * 8) * 0.3 : 1;
        c.scale(scale, scale);
        if (this.atlas.complete && this.atlas.naturalWidth) c.drawImage(this.atlas, gift.sprite % 3 * 256, Math.floor(gift.sprite / 3) * 256, 256, 256, -size / 2, -size / 2, size, size);
        c.restore();
        if (gift.effect === 'petals' && this.petals.complete && this.petals.naturalWidth) {
          const w = this.petals.naturalWidth / 3, h = this.petals.naturalHeight / 2;
          sparks.slice(0, 7).forEach((p, i) => {
            c.save(); c.globalAlpha = opacity * .9;
            c.translate(53 + Math.sin(p.angle + t) * (23 + t * 10), y - 40 + i * 15 - t * 19);
            c.rotate(p.angle + t * .5);
            c.drawImage(this.petals, (i % 3) * w, (i % 2) * h, w, h, -7, -10, 14, 21); c.restore();
          });
        }
        for (const p of sparks) {
          c.globalAlpha = opacity * (0.2 + 0.4 * Math.sin(t * 3 + p.angle) ** 2);
          c.fillStyle = this.theme === 'chinese' ? '#d5a553' : '#d5b880';
          c.beginPath();
          const lift = gift.effect === 'toast' ? (t * 30 + p.angle * 8) % 70 : 0;
          c.arc(57 + Math.cos(p.angle) * p.speed * 0.6, y + Math.sin(p.angle) * p.speed - lift, p.radius, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  clear() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.context?.clearRect(0, 0, this.width || 0, this.height || 0);
    this.canvas.dataset.state = 'idle';
  }
  destroy() { this.clear(); this.observer.disconnect(); }
}
