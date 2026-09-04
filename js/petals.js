/**
 * 婚礼请柬 - 照片级“风吹花瓣飘散（Wind-Blown Petals）”场景转场物理粒子引擎 (V2 渐渐撒落与各页面花位定向版)
 * 
 * 特性：
 * - 9 种真花高透切片（酒红丝绒玫瑰、法式香槟玫瑰、粉黛玫瑰、尤加利绿叶）
 * - 各页面花位定制识别：精准根据 Card 01~08 画面中真实花束位置吹拂脱落
 * - 渐渐撒落流体发射器：在 1.0 秒内分批次、波浪式柔和剥离，告别突兀倾泻
 * - 极轻盈重力与空气悬浮动力学：下降速度减缓 4 倍，伴随钟摆摇曳与 3D 轴向微卷翻转
 * - 60fps 高性能 Canvas 2D 渲染，换场完成后 0% CPU 零常驻功耗
 */

// 卡片花艺真实分布区域定义（基于各页面背景图花艺的精确坐标 [0..1] 与物理吹拂风向）
const CARD_FLORAL_ZONES = {
  // Card 01 (封面): 顶部法式花拱 + 左侧酒红花艺帷幕 + 右侧点缀
  0: [
    { name: 'top-arch', xMin: 0.08, xMax: 0.92, yMin: 0.02, yMax: 0.22, weight: 0.45, vxBase: 0.8, vyBase: -0.6 },
    { name: 'left-curtain', xMin: 0.02, xMax: 0.26, yMin: 0.18, yMax: 0.85, weight: 0.35, vxBase: 2.8, vyBase: -1.2 },
    { name: 'right-swag', xMin: 0.76, xMax: 0.98, yMin: 0.20, yMax: 0.70, weight: 0.20, vxBase: -2.4, vyBase: -1.0 }
  ],
  // Card 02 (我们要结婚了): 浪漫 S 弯花藤（左上花角 + 右侧花腰 + 右下丰盛花簇）
  1: [
    { name: 'top-left', xMin: 0.04, xMax: 0.38, yMin: 0.04, yMax: 0.28, weight: 0.40, vxBase: 2.5, vyBase: -0.5 },
    { name: 'right-flank', xMin: 0.70, xMax: 0.96, yMin: 0.30, yMax: 0.68, weight: 0.30, vxBase: -2.5, vyBase: -0.8 },
    { name: 'bottom-right', xMin: 0.55, xMax: 0.96, yMin: 0.70, yMax: 0.95, weight: 0.30, vxBase: -2.0, vyBase: -3.0 }
  ],
  // Card 03 (时间 TIME): 顶部花楣 + 左侧立柱花艺 + 底部地花（中央清爽留给倒计时）
  2: [
    { name: 'top-arch', xMin: 0.08, xMax: 0.92, yMin: 0.02, yMax: 0.20, weight: 0.45, vxBase: 0.5, vyBase: -0.6 },
    { name: 'left-garland', xMin: 0.02, xMax: 0.24, yMin: 0.22, yMax: 0.82, weight: 0.30, vxBase: 2.8, vyBase: -1.0 },
    { name: 'bottom-base', xMin: 0.10, xMax: 0.90, yMin: 0.82, yMax: 0.98, weight: 0.25, vxBase: 0.8, vyBase: -3.5 }
  ],
  // Card 04 (日期 CALENDAR): 左侧整列立柱花艺瀑布（右侧为日历表，花朵全在左边！）
  3: [
    { name: 'left-column-top', xMin: 0.02, xMax: 0.30, yMin: 0.04, yMax: 0.48, weight: 0.50, vxBase: 3.2, vyBase: -0.8 },
    { name: 'left-column-bot', xMin: 0.02, xMax: 0.32, yMin: 0.48, yMax: 0.92, weight: 0.50, vxBase: 3.5, vyBase: -2.0 }
  ],
  // Card 05 (地点 VENUE): 顶部丰盛花楣 + 左上角花簇 + 右侧轻点缀
  4: [
    { name: 'top-garland', xMin: 0.06, xMax: 0.94, yMin: 0.03, yMax: 0.24, weight: 0.60, vxBase: 0.6, vyBase: -0.6 },
    { name: 'left-upper', xMin: 0.02, xMax: 0.28, yMin: 0.22, yMax: 0.46, weight: 0.25, vxBase: 2.6, vyBase: -1.0 },
    { name: 'right-edge', xMin: 0.75, xMax: 0.96, yMin: 0.28, yMax: 0.72, weight: 0.15, vxBase: -2.0, vyBase: -0.8 }
  ],
  // Card 06 (期待相见): 圣殿石拱门玫瑰墙与漫天柔光花影
  5: [
    { name: 'arch-left', xMin: 0.04, xMax: 0.32, yMin: 0.10, yMax: 0.88, weight: 0.40, vxBase: 2.5, vyBase: -1.5 },
    { name: 'arch-right', xMin: 0.68, xMax: 0.96, yMin: 0.10, yMax: 0.88, weight: 0.40, vxBase: -2.5, vyBase: -1.5 },
    { name: 'arch-summit', xMin: 0.20, xMax: 0.80, yMin: 0.04, yMax: 0.25, weight: 0.20, vxBase: 0.5, vyBase: -0.8 }
  ],
  // Card 07 (新人合影): 左下丰盛花篮花艺 + 右上角微枝点缀
  6: [
    { name: 'bottom-left-basket', xMin: 0.04, xMax: 0.42, yMin: 0.55, yMax: 0.95, weight: 0.75, vxBase: 2.8, vyBase: -3.8 },
    { name: 'top-right-sprig', xMin: 0.58, xMax: 0.92, yMin: 0.04, yMax: 0.28, weight: 0.25, vxBase: -2.0, vyBase: 0.5 }
  ],
  // Card 08 (邀请函正文): 经典对角法式花艺（右上角花簇 + 左下角花簇）
  7: [
    { name: 'top-right-corner', xMin: 0.64, xMax: 0.96, yMin: 0.03, yMax: 0.30, weight: 0.50, vxBase: -2.8, vyBase: 0.5 },
    { name: 'bottom-left-corner', xMin: 0.04, xMax: 0.44, yMin: 0.66, yMax: 0.96, weight: 0.50, vxBase: 2.8, vyBase: -3.6 }
  ]
};

// 通用默认花艺区域（备用容错）
const DEFAULT_FLORAL_ZONES = [
  { name: 'top-spread', xMin: 0.1, xMax: 0.9, yMin: 0.05, yMax: 0.25, weight: 0.4, vxBase: 0.5, vyBase: -0.5 },
  { name: 'left-spread', xMin: 0.05, xMax: 0.28, yMin: 0.2, yMax: 0.8, weight: 0.3, vxBase: 2.5, vyBase: -1.0 },
  { name: 'right-spread', xMin: 0.72, xMax: 0.95, yMin: 0.2, yMax: 0.8, weight: 0.3, vxBase: -2.5, vyBase: -1.0 }
];

class PetalWindEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.petals = [];
    this.isRunning = false;
    this.animId = null;
    this.lastTime = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 预加载 9 款真花照片级切片精灵图
    this.petalSources = [
      'assets/images/petals/petal_burgundy_1.png',
      'assets/images/petals/petal_burgundy_2.png',
      'assets/images/petals/petal_burgundy_3.png',
      'assets/images/petals/petal_champagne_1.png',
      'assets/images/petals/petal_champagne_2.png',
      'assets/images/petals/petal_ivory_1.png',
      'assets/images/petals/petal_blush_1.png',
      'assets/images/petals/petal_eucalyptus_1.png',
      'assets/images/petals/petal_eucalyptus_2.png'
    ];
    this.petalImages = [];
    this.imagesLoaded = false;
    this.preloadImages();

    // 渐进式波浪发射器会话
    this.emissionSession = null;
  }

  preloadImages() {
    let loadedCount = 0;
    this.petalSources.forEach(src => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        loadedCount++;
        if (loadedCount === this.petalSources.length) {
          this.imagesLoaded = true;
        }
      };
      this.petalImages.push(img);
    });
  }

  init(containerElement) {
    this.container = containerElement || document.querySelector('.mobile-phone-frame') || document.body;

    let canvas = document.getElementById('petalWindCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'petalWindCanvas';
      canvas.className = 'petal-wind-canvas';
      this.container.appendChild(canvas);
    }
    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize() {
    if (!this.canvas || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  getZonesForPage(pageIndex) {
    if (pageIndex !== undefined && CARD_FLORAL_ZONES[pageIndex]) {
      return CARD_FLORAL_ZONES[pageIndex];
    }
    return DEFAULT_FLORAL_ZONES;
  }

  pickZone(zones) {
    const totalWeight = zones.reduce((sum, z) => sum + (z.weight || 1), 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < zones.length; i++) {
      const w = zones[i].weight || 1;
      if (rand <= w) return zones[i];
      rand -= w;
    }
    return zones[0];
  }

  /**
   * 触发风吹花瓣渐渐撒落转场
   * @param {'up'|'down'} direction 换场方向
   * @param {number} fromPageIndex 离开的场景卡片索引（0 ~ 7）
   * @param {number} count 总发射花瓣数（约 48~58 片）
   */
  triggerWindGust(direction = 'up', fromPageIndex = 0, count = 52) {
    if (!this.canvas) this.init();
    this.resize();

    const zones = this.getZonesForPage(fromPageIndex);

    // 开启“渐进式撒落”发射会话：花瓣在 ~0.95 秒内波浪式徐徐剥离，绝不突兀倾泻
    this.emissionSession = {
      direction: direction,
      zones: zones,
      totalPetals: count,
      emittedPetals: 0,
      duration: 0.95, // 0.95秒绵延持续发射期
      elapsed: 0,
      spawnTimer: 0,
      spawnInterval: 0.036 // 每 36ms 释放 1~2 片花瓣
    };

    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = performance.now();
      this.loop();
    }
  }

  spawnPetal(direction, zones) {
    const w = this.width;
    const h = this.height;
    const isUp = direction === 'up';

    const imgIdx = Math.floor(Math.random() * this.petalImages.length);
    const img = this.petalImages[imgIdx];

    // 精准从当前页面的花艺丛中选取发射点
    const zone = this.pickZone(zones);
    const startX = (zone.xMin + Math.random() * (zone.xMax - zone.xMin)) * w;
    const startY = (zone.yMin + Math.random() * (zone.yMax - zone.yMin)) * h;

    // 景深比例 (0.45 ~ 1.25)
    const depthScale = 0.48 + Math.random() * 0.72;
    const baseSize = 35 * depthScale;

    // 细腻初速度：由花艺簇物理朝向 + 整体微风共同形成
    const baseVx = (zone.vxBase || 0) * (0.8 + Math.random() * 0.45);
    const baseVy = (zone.vyBase || 0) * (0.8 + Math.random() * 0.45);

    const windLift = isUp ? -1.6 : 0.6; // 上划时带微升力，下划时顺流下淌
    const vx = (baseVx + (Math.random() - 0.5) * 1.8) * depthScale;
    const vy = (baseVy + windLift + (Math.random() - 0.5) * 1.2) * depthScale;

    this.petals.push({
      img: img,
      x: startX,
      y: startY,
      vx: vx,
      vy: vy,
      depthScale: depthScale,
      baseSize: baseSize,
      aspectRatio: (img && img.width && img.height) ? (img.height / img.width) : 1.15,

      // 3D 轴向角度
      roll: Math.random() * Math.PI * 2,
      pitch: Math.random() * Math.PI * 2,
      yaw: Math.random() * Math.PI * 2,

      // 优雅舒缓的翻滚速度（慢速旋转展现真花绒面质感）
      vRoll: (Math.random() - 0.5) * 0.024,
      vPitch: (0.016 + Math.random() * 0.022) * (Math.random() > 0.5 ? 1 : -1),
      vYaw: (0.016 + Math.random() * 0.022) * (Math.random() > 0.5 ? 1 : -1),

      // 钟摆式空气侧向摇曳
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.025 + Math.random() * 0.03,
      swayAmp: (2.2 + Math.random() * 2.2) * depthScale,

      // 自花丛剥离时从 0 柔和浮现
      opacity: 0,
      targetOpacity: 0.86 + Math.random() * 0.14,
      fadeInSpeed: 0.055 + Math.random() * 0.045,

      age: 0,
      lifespan: 2.3 + Math.random() * 0.9 // 2.3s ~ 3.2s 漫长从容的曼舞时间
    });
  }

  loop(currentTime = performance.now()) {
    if (!this.isRunning) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    if (this.petals.length > 0 || this.emissionSession !== null) {
      this.animId = requestAnimationFrame((t) => this.loop(t));
    } else {
      this.stop();
    }
  }

  update(dt) {
    const w = this.width;
    const h = this.height;

    // 1. 处理“渐渐撒落”波浪式分批释放
    if (this.emissionSession) {
      const sess = this.emissionSession;
      sess.elapsed += dt;
      sess.spawnTimer += dt;

      while (sess.spawnTimer >= sess.spawnInterval && sess.emittedPetals < sess.totalPetals) {
        sess.spawnTimer -= sess.spawnInterval;

        const batchSize = Math.min(
          sess.totalPetals - sess.emittedPetals,
          Math.floor(Math.random() * 2) + 1
        );

        for (let b = 0; b < batchSize; b++) {
          this.spawnPetal(sess.direction, sess.zones);
          sess.emittedPetals++;
        }
      }

      if (sess.elapsed >= sess.duration || sess.emittedPetals >= sess.totalPetals) {
        this.emissionSession = null;
      }
    }

    // 2. 极轻盈重力与空气悬浮动力学
    const gravity = 46; // px/s^2，极柔和重力加速度（比原先慢近4倍）
    const airDrag = 0.958; // 空气阻尼

    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.age += dt;

      // 自花丛脱离瞬间柔和淡入
      if (p.opacity < p.targetOpacity) {
        p.opacity = Math.min(p.targetOpacity, p.opacity + p.fadeInSpeed);
      }

      // 空气阻力减缓水平初速度
      p.vx *= Math.pow(airDrag, dt * 60);

      // 重力加速沉降，但受到轻盈花瓣终端速度严格限制
      p.vy += gravity * dt * p.depthScale;
      const maxVy = (55 + 45 * p.depthScale); // 终端下坠速度限制在 55~100 px/s
      if (p.vy > maxVy) {
        p.vy = p.vy * 0.92 + maxVy * 0.08;
      }

      // 钟摆横向空气摇曳
      p.swayPhase += p.swaySpeed;
      const swayForceX = Math.sin(p.swayPhase) * p.swayAmp;

      // 空气动力学受风托举升力
      const lift = Math.abs(Math.cos(p.pitch)) * 8 * p.depthScale;

      p.x += (p.vx + swayForceX) * (dt * 60);
      p.y += (p.vy - lift) * (dt * 60);

      // 3D 轴向慢翻转
      p.roll += p.vRoll;
      p.pitch += p.vPitch;
      p.yaw += p.vYaw;

      // 临近生命末期或快落出屏幕底部时从容淡出
      if (p.age > p.lifespan - 0.45 || p.y > h - 30 || p.x < -80 || p.x > w + 80) {
        p.opacity -= 0.026;
      }

      // 移除条件
      if (p.opacity <= 0 || p.y > h + 70) {
        this.petals.splice(i, 1);
      }
    }
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.petals.length === 0) return;

    this.petals.sort((a, b) => a.depthScale - b.depthScale);

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      if (!p.img || !p.img.complete || p.opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));

      ctx.translate(p.x, p.y);
      ctx.rotate(p.roll);

      const scaleX = Math.cos(p.pitch) * p.depthScale;
      const scaleY = Math.sin(p.yaw) * p.depthScale;
      ctx.scale(scaleX, scaleY);

      // 细腻柔和受光阴影
      ctx.shadowColor = 'rgba(25, 10, 5, 0.22)';
      ctx.shadowBlur = 7 * p.depthScale;
      ctx.shadowOffsetY = 3.5 * p.depthScale;

      const drawW = p.baseSize;
      const drawH = p.baseSize * p.aspectRatio;

      ctx.drawImage(p.img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }

  stop() {
    this.isRunning = false;
    this.emissionSession = null;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
    this.petals = [];
  }
}

// 挂载全局单例类
window.PetalWindEngine = PetalWindEngine;
