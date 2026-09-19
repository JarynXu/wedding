import { publicAssetUrl } from './static-assets.js';
const atlasUrl = publicAssetUrl('./assets/shared/rose-petals.webp');

/** 花瓣图集为三列两行；每列对应白、粉、红，每行对应一种卷曲姿态。 */
export class RosePetals {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.image = new Image();
    this.frame = null;
    this.lastTime = null;
    this.elapsed = 0;
    this.held = false;
    this.ready = false;
    this.disposed = false;
    this.width = 0;
    this.height = 0;
    this.petals = [];
    this.onVisibility = () => this.syncPlayback();
    this.onFrame = (time) => this.tick(time);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.motionPreference.addEventListener('change', this.onVisibility);
  }

  async start() {
    if (!this.context) return;
    this.image.src = atlasUrl;
    try {
      await this.image.decode();
      if (this.disposed) return;
      this.ready = true;
      this.canvas.dataset.state = 'ready';
      this.resize();
      this.syncPlayback();
    } catch (error) {
      this.canvas.dataset.state = 'unavailable';
      console.error('玫瑰花瓣图集加载失败', error);
      throw error;
    }
  }

  resize() {
    if (!this.context) return;
    const { clientWidth: width, clientHeight: height } = this.canvas.parentElement;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 固定种子使同一时刻的画面可复核；轨迹按秒计算，不依赖屏幕刷新率。
    let seed = 171026;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = width < 360 ? 19 : 25;
    this.petals = Array.from({ length: count }, (_, index) => {
      const depth = random();
      const isLightPetal = index % 3 !== 2;
      return {
        sprite: index % 6,
        x: random() * (width + 60),
        y: random() * (height + 100),
        size: 19 + depth * 26,
        speed: 23 + depth * 36,
        drift: 5 + random() * 10,
        sway: 10 + random() * 19,
        phase: random() * Math.PI * 2,
        turn: (random() - 0.5) * 0.9,
        flutter: 0.7 + random() * 0.9,
        opacity: isLightPetal ? 0.94 + depth * 0.06 : 0.52 + depth * 0.4,
        readingFade: isLightPetal ? 0.12 : 0.62,
      };
    }).sort((a, b) => a.size - b.size);
    this.render(this.elapsed);
  }

  render(seconds) {
    const ctx = this.context;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.ready || this.motionPreference.matches) return;
    const cellWidth = this.image.naturalWidth / 3;
    const cellHeight = this.image.naturalHeight / 2;
    for (const petal of this.petals) {
      const phase = petal.phase + seconds * petal.flutter;
      const x = (petal.x + seconds * petal.drift) % (this.width + 100) - 50
        + Math.sin(phase * 0.67) * petal.sway;
      const y = (petal.y + seconds * petal.speed) % (this.height + 120) - 60;
      // 浅色花瓣保留纹理；酒红花瓣在阅读区淡化，避免遮挡文字。
      const center = Math.max(0, 1 - Math.abs(x - this.width / 2) / (this.width * 0.34));
      const edgeFade = Math.min(1, Math.max(0, (y + 30) / 60), Math.max(0, (this.height + 40 - y) / 65));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(petal.phase + seconds * petal.turn + Math.sin(phase) * 0.25);
      ctx.scale(0.38 + Math.abs(Math.cos(phase * 0.7)) * 0.62, 0.84 + Math.sin(phase) * 0.16);
      ctx.globalAlpha = petal.opacity * (1 - center * petal.readingFade) * edgeFade;
      ctx.drawImage(this.image, (petal.sprite % 3) * cellWidth, Math.floor(petal.sprite / 3) * cellHeight,
        cellWidth, cellHeight, -petal.size / 2, -petal.size * 0.75, petal.size, petal.size * 1.5);
      ctx.restore();
    }
  }

  tick(time) {
    this.frame = null;
    if (this.lastTime !== null) this.elapsed += Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    this.render(this.elapsed);
    this.frame = requestAnimationFrame(this.onFrame);
  }

  syncPlayback() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lastTime = null;
    this.render(this.elapsed);
    if (this.ready && !this.disposed && !this.held && !document.hidden && !this.motionPreference.matches) {
      this.frame = requestAnimationFrame(this.onFrame);
    }
  }

  /** 验证端可固定花瓣时钟；传入 null 恢复播放。 */
  hold(seconds) {
    this.held = seconds !== null;
    if (seconds !== null) this.elapsed = seconds;
    this.syncPlayback();
  }

  destroy() {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motionPreference.removeEventListener('change', this.onVisibility);
    this.context?.clearRect(0, 0, this.width, this.height);
  }
}

export { atlasUrl as rosePetalsUrl };
