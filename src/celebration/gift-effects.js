import { haptic } from '../haptics.js';
import { ThemeFireworks } from './fireworks.js';
import { findGift } from './catalog.js';
import { rosePetalsUrl } from '../petals.js';
const atlasUrl = new URL('../assets/celebration-gifts.webp', import.meta.url).href;

/** 每次播放加入一个礼物实例；共用画布逐帧绘制，实例上限限制绘制成本。 */
export class GiftEffects {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.theme = theme;
    this.fireworks = this.context ? new ThemeFireworks(theme) : null;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.atlas = new Image();
    this.atlas.src = atlasUrl;
    this.atlas.decode().catch(() => { this.canvas.dataset.assets = 'unavailable'; });
    this.petals = new Image(); this.petals.src = rosePetalsUrl;
    this.rings = new Image(); this.rings.src = new URL('../assets/gift-rings.webp', import.meta.url).href;
    this.frame = null;
    this.active = [];
    this.effectSequence = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    this.resize();
  }
  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas.parentElement;
    if (width === this.width && height === this.height) return;
    this.clear();
    this.width = width;
    this.height = height;
    const messageWidth = Math.min(180, this.width * .48);
    this.canvas.parentElement.style.setProperty('--blessing-message-width', `${messageWidth}px`);
    this.effectsLeft = 16 + messageWidth + 16;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  play(id,{local=false}={}) {
    const gift = findGift(id);
    if (!gift || !this.context || this.motion.matches || document.hidden) return;
    if(local)haptic('tap');
    const seed = Math.random() * Math.PI;
    const sparks = Array.from({ length: gift.effect === 'fireworks' ? (this.active.length ? 28 : 60) : (this.active.length ? 12 : 28) }, (_, i) => ({
      angle: i * 2.39996 + seed, speed: gift.effect==='fireworks'?44+Math.random()*62:18+Math.random()*50,
      life: 1.3 + Math.random() * 0.9, radius: 1.3 + Math.random(), side: i % 2,
    }));
    this.canvas.dataset.gift = id;
    this.canvas.dataset.state = 'playing';
    this.active.push({ gift, sparks, local, started: performance.now(), variant: this.effectSequence++ % 3 });
    // 每次新操作均入场；密集点击时释放最早的一批，避免无界叠加和长队列。
    if (this.active.length > 10) this.active.shift();
    this.canvas.dataset.activeCount = String(this.active.length);
    if (this.frame == null) this.frame = requestAnimationFrame(now => this.tick(now));
  }
  tick(now) {
    if (document.hidden || this.motion.matches) return this.clear();
    this.active = this.active.filter(effect => now - effect.started < 3400);
    if (!this.active.length) return this.clear();
    this.context.clearRect(0, 0, this.width, this.height);
    for (const effect of this.active) {const elapsed=Math.max(0,now-effect.started)/1000;if(effect.local&&effect.gift.effect==='fireworks'&&elapsed>=.55&&!effect.burstFelt){effect.burstFelt=true;haptic('fireworks');}this.draw(effect,elapsed);}
    this.canvas.dataset.activeCount = String(this.active.length);
    this.frame = requestAnimationFrame(time => this.tick(time));
  }
  draw({ gift, sparks, variant }, t) {
    const c = this.context;
    // 气泡在左侧最多移动 4px；礼物的全部可见像素保留在右侧，含光晕和火花。
    c.save(); c.beginPath(); c.rect(this.effectsLeft, 0, this.width - this.effectsLeft, this.height); c.clip();
    if(gift.effect!=='fireworks')c.translate(variant === 1 ? -8 : variant === 2 ? 6 : 0, variant * -18);
    const opacity = Math.min(t / 0.35, 1) * Math.min((3.4 - t) / 0.8, 1);
    if (gift.effect === 'fireworks') {
      this.fireworks.draw(c,{sparks,variant},t,{width:this.width,height:this.height,left:this.effectsLeft});
    } else {
      const rise = gift.effect === 'lantern' ? t * 70 : gift.effect === 'petals' ? t * 32 : t * 15;
      const y = this.height - 230 - rise;
      const x = this.width - 57;
      const size = gift.effect === 'knot' ? 86 : 76;
      if (gift.effect === 'lantern') {
        const glow = c.createRadialGradient(x, y, 3, x, y, 57);
        glow.addColorStop(0, '#f6bc5066'); glow.addColorStop(1, '#f6bc5000');
        c.globalAlpha = opacity; c.fillStyle = glow; c.fillRect(x - 57, y - 57, 114, 114);
      }
      if (gift.effect === 'seal' && t < 1.3) {
        c.globalAlpha = (1 - t / 1.3) * .5; c.strokeStyle = '#bb9353'; c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, 32 + t * 22, 0, Math.PI * 2); c.stroke();
      }
      c.save();
      c.globalAlpha = opacity;
      c.translate(x + Math.sin(t * 1.6) * 8, y);
      c.rotate(Math.sin(t * 2) * (gift.effect === 'seal' ? 0.015 : 0.07));
      const scale = gift.effect === 'seal' ? 1 + Math.exp(-t * 8) * 0.3 : 1;
      c.scale(scale, scale);
      if(gift.effect==='rings'){if(this.rings.complete&&this.rings.naturalWidth)c.drawImage(this.rings,-size/2,-size/2,size,size);}
      else if (this.atlas.complete && this.atlas.naturalWidth) c.drawImage(this.atlas, gift.sprite % 3 * 256, Math.floor(gift.sprite / 3) * 256, 256, 256, -size / 2, -size / 2, size, size);
      c.restore();
      if (gift.effect === 'petals' && this.petals.complete && this.petals.naturalWidth) {
        const w = this.petals.naturalWidth / 3, h = this.petals.naturalHeight / 2;
        sparks.slice(0, 7).forEach((p, i) => {
          c.save(); c.globalAlpha = opacity * .9;
          c.translate(x + Math.sin(p.angle + t) * (23 + t * 10), y - 40 + i * 15 - t * 19);
          c.rotate(p.angle + t * .5);
          c.drawImage(this.petals, (i % 3) * w, (i % 2) * h, w, h, -7, -10, 14, 21); c.restore();
        });
      }
      for (const p of sparks) {
        c.globalAlpha = opacity * (0.2 + 0.4 * Math.sin(t * 3 + p.angle) ** 2);
        c.fillStyle = this.theme === 'chinese' ? '#d5a553' : '#d5b880';
        c.beginPath();
        const lift = gift.effect === 'toast' ? (t * 30 + p.angle * 8) % 70 : 0;
        c.arc(x + Math.cos(p.angle) * p.speed * 0.6, y + Math.sin(p.angle) * p.speed - lift, p.radius, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore(); c.globalAlpha = 1;
  }
  clear() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    this.context?.clearRect(0, 0, this.width || 0, this.height || 0);
    this.active = [];
    this.canvas.dataset.activeCount = '0';
    this.canvas.dataset.state = 'idle';
  }
  destroy() { this.clear(); this.observer.disconnect(); }
}
