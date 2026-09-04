/**
 * 婚礼请柬 - 照片级“风吹花瓣飘散（Wind-Blown Petals）”场景转场物理粒子引擎
 * 
 * 特性：
 * - 9 种真花高透切片（酒红丝绒玫瑰、法式香槟玫瑰、粉黛玫瑰、尤加利绿叶）
 * - 3D 轴向三维翻滚动力学 (Pitch / Yaw / Roll)
 * - 空气动力学风力爆发、扰流摆动与重力沉降
 * - 60fps 高性能 Canvas 2D 渲染，换场完成后 0% CPU 零常驻功耗
 */

class PetalWindEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.petals = [];
    this.isRunning = false;
    this.animId = null;
    this.lastTime = 0;
    this.dpr = window.devicePixelRatio || 1;

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

    // 检查或创建全屏置顶 Canvas
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
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // 限制最大 2x DPR 保证极速帧率

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  /**
   * 触发风吹花瓣爆发转场
   * @param {'up'|'down'} direction 换场方向
   * @param {number} count 花瓣数量（默认 48~58 片）
   */
  triggerWindGust(direction = 'up', count = 52) {
    if (!this.canvas) this.init();
    this.resize();

    this.petals = [];
    const w = this.width;
    const h = this.height;

    const isUp = direction === 'up'; // 向上划动（去下一页）

    for (let i = 0; i < count; i++) {
      const imgIdx = Math.floor(Math.random() * this.petalImages.length);
      const img = this.petalImages[imgIdx];

      // 出生位置：主要从屏幕两翼角落（花艺装饰处）和边缘涌入
      let startX, startY;
      const spawnSide = Math.random();
      if (spawnSide < 0.4) {
        // 左侧或右侧花拱边缘
        startX = (Math.random() < 0.5) ? -30 - Math.random() * 60 : w + 30 + Math.random() * 60;
        startY = (isUp ? h * 0.4 + Math.random() * h * 0.6 : Math.random() * h * 0.6);
      } else if (spawnSide < 0.75) {
        // 底部或顶部
        startX = Math.random() * w;
        startY = isUp ? h + 20 + Math.random() * 80 : -20 - Math.random() * 80;
      } else {
        // 屏幕中心区域随风爆散
        startX = w * 0.2 + Math.random() * w * 0.6;
        startY = h * 0.2 + Math.random() * h * 0.6;
      }

      // 深度比例 (0.4 ~ 1.25)：模拟近景与远景立体景深
      const depthScale = 0.45 + Math.random() * 0.75;
      const baseSize = 38 * depthScale; // 基础绘制像素尺寸

      // 初始瞬时风力喷射速度
      const burstSpeed = (12 + Math.random() * 16) * depthScale;
      const windAngle = isUp
        ? (-Math.PI * 0.5 + (Math.random() - 0.5) * 0.9) // 向上喷射并带斜角
        : (Math.PI * 0.5 + (Math.random() - 0.5) * 0.9);  // 向下吹拂

      const vx = Math.cos(windAngle) * burstSpeed + (Math.random() - 0.5) * 4;
      const vy = Math.sin(windAngle) * burstSpeed;

      this.petals.push({
        img: img,
        x: startX,
        y: startY,
        vx: vx,
        vy: vy,
        depthScale: depthScale,
        baseSize: baseSize,
        aspectRatio: (img && img.width && img.height) ? (img.height / img.width) : 1.1,
        // 3D 轴向旋转
        roll: Math.random() * Math.PI * 2,
        pitch: Math.random() * Math.PI * 2,
        yaw: Math.random() * Math.PI * 2,
        vRoll: (Math.random() - 0.5) * 0.08,
        vPitch: (0.04 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1),
        vYaw: (0.04 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1),
        // 空气扰流摇曳
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.04 + Math.random() * 0.05,
        swayAmp: 1.5 + Math.random() * 2.5,
        // 生命期与透明度
        opacity: 0,
        targetOpacity: 0.88 + Math.random() * 0.12,
        fadeInSpeed: 0.08 + Math.random() * 0.06,
        age: 0,
        lifespan: 1.35 + Math.random() * 0.45 // 1.35s ~ 1.8s
      });
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = performance.now();
      this.loop();
    }
  }

  loop(currentTime = performance.now()) {
    if (!this.isRunning) return;

    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    if (this.petals.length > 0) {
      this.animId = requestAnimationFrame((t) => this.loop(t));
    } else {
      this.stop();
    }
  }

  update(dt) {
    const w = this.width;
    const h = this.height;
    const gravity = 180; // 重力加速度 (px/s^2)
    const airDrag = 0.94; // 空气阻力系数

    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.age += dt;

      // 淡入
      if (p.opacity < p.targetOpacity) {
        p.opacity = Math.min(p.targetOpacity, p.opacity + p.fadeInSpeed);
      }

      // 阶段 1：初段风力爆发与减速；阶段 2：重力接管与飘舞
      p.vx *= Math.pow(airDrag, dt * 60);
      p.vy *= Math.pow(airDrag, dt * 60);

      // 重力逐渐发挥主导
      p.vy += gravity * dt * p.depthScale;

      // 空气横向扰流摆动（真花落下的自然摆动）
      p.swayPhase += p.swaySpeed;
      const swayForceX = Math.sin(p.swayPhase) * p.swayAmp;

      p.x += (p.vx + swayForceX) * (dt * 60);
      p.y += p.vy * (dt * 60);

      // 3D 轴向自旋
      p.roll += p.vRoll;
      p.pitch += p.vPitch;
      p.yaw += p.vYaw;

      // 临近生命终结或落出视野下方时淡出
      if (p.age > p.lifespan - 0.35 || p.y > h + 50 || p.x < -100 || p.x > w + 100) {
        p.opacity -= 0.04;
      }

      // 移除条件：透明度耗尽或彻底脱离画布四周
      if (p.opacity <= 0 || p.y > h + 80) {
        this.petals.splice(i, 1);
      }
    }
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.petals.length === 0) return;

    // 按景深层次（depthScale）从远到近排序绘制，产生真实遮挡纵深
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

      ctx.shadowColor = 'rgba(25, 10, 5, 0.25)';
      ctx.shadowBlur = 8 * p.depthScale;
      ctx.shadowOffsetY = 4 * p.depthScale;

      const drawW = p.baseSize;
      const drawH = p.baseSize * p.aspectRatio;

      ctx.drawImage(p.img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }

  stop() {
    this.isRunning = false;
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

// 挂载全局单例
window.PetalWindEngine = PetalWindEngine;
