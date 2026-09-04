/**
 * 婚礼请柬 - 全资源预加载（Preloader）与开场仪式感引擎
 * 
 * 功能：
 * - 并行预加载 8 张照片级全画幅背景大图与新人照片
 * - 预加载背景音乐与核心衬线艺术字体 (document.fonts.ready)
 * - requestAnimationFrame 平滑插值动画，保证 0% -> 100% 进度条与数字丝滑推进
 * - 弱网 5.5 秒超时自动放行兜底（Timeout Fallback）
 * - 达成 100% 时升华为【开启请柬 · OPEN】烫金呼吸按钮，一键 100% 解锁微信与 iOS 音频播放！
 */

class WeddingPreloader {
  constructor(options = {}) {
    this.overlay = document.getElementById('preloaderOverlay');
    this.barFill = document.getElementById('preloaderBarFill');
    this.percentText = document.getElementById('preloaderPercent');
    this.statusText = document.getElementById('preloaderStatus');
    this.actionArea = document.getElementById('preloaderActionArea');
    this.enterBtn = document.getElementById('btnEnterInvitation');

    this.onEnterCallback = options.onEnter || null;

    this.targetProgress = 0;
    this.displayProgress = 0;
    this.isCompleted = false;
    this.isEntered = false;
    this.animId = null;

    // 关键资源预加载清单
    this.manifest = [
      { type: 'image', url: 'assets/images/card01_bg.jpg?v=20260904_photoreal', weight: 12 },
      { type: 'image', url: 'assets/images/card02_bg.jpg?v=20260904_photoreal', weight: 10 },
      { type: 'image', url: 'assets/images/card03_bg.jpg?v=20260904_photoreal', weight: 10 },
      { type: 'image', url: 'assets/images/card04_bg.jpg?v=20260904_photoreal', weight: 10 },
      { type: 'image', url: 'assets/images/card05_bg.jpg?v=20260904_photoreal', weight: 10 },
      { type: 'image', url: 'assets/images/card06_bg.jpg?v=20260904_photoreal', weight: 12 },
      { type: 'image', url: 'assets/images/welcome-photo.jpg', weight: 12 },
      { type: 'image', url: 'assets/images/card08_bg.jpg?v=20260904_photoreal', weight: 10 },
      { type: 'audio', url: 'assets/audio/wedding-bgm.mp3', weight: 8 },
      { type: 'font', name: 'WebFonts', weight: 6 }
    ];

    this.totalWeight = this.manifest.reduce((sum, item) => sum + item.weight, 0);
    this.loadedWeight = 0;
  }

  init() {
    if (!this.overlay) return;

    // 启动平滑插值数字驱动循环
    this.startProgressLoop();

    // 开始加载资源
    this.loadAllAssets();

    // 5.5 秒弱网超时兜底（保证任何网络环境下均不会卡死）
    setTimeout(() => {
      if (!this.isCompleted) {
        this.targetProgress = 100;
      }
    }, 5500);

    // 绑定进入按钮点击事件
    if (this.enterBtn) {
      this.enterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.enterInvitation();
      });
    }

    // 点击背景也可唤醒
    if (this.overlay) {
      this.overlay.addEventListener('click', () => {
        if (this.isCompleted && !this.isEntered) {
          this.enterInvitation();
        }
      });
    }
  }

  loadAllAssets() {
    this.manifest.forEach(item => {
      if (item.type === 'image') {
        const img = new Image();
        img.onload = () => this.onItemLoaded(item.weight);
        img.onerror = () => this.onItemLoaded(item.weight); // 容错推进
        img.src = item.url;
      } else if (item.type === 'audio') {
        const audio = new Audio();
        audio.preload = 'auto';
        let handled = false;
        const markAudio = () => {
          if (!handled) {
            handled = true;
            this.onItemLoaded(item.weight);
          }
        };
        audio.addEventListener('canplaythrough', markAudio, { once: true });
        audio.addEventListener('loadeddata', markAudio, { once: true });
        audio.addEventListener('error', markAudio, { once: true });
        setTimeout(markAudio, 2500); // 音频缓冲超时容错
        audio.src = item.url;
        audio.load();
      } else if (item.type === 'font') {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            this.onItemLoaded(item.weight);
          }).catch(() => {
            this.onItemLoaded(item.weight);
          });
        } else {
          this.onItemLoaded(item.weight);
        }
      }
    });
  }

  onItemLoaded(weight) {
    this.loadedWeight += weight;
    const rawPercent = Math.min(100, Math.round((this.loadedWeight / this.totalWeight) * 100));
    this.targetProgress = Math.max(this.targetProgress, rawPercent);
  }

  startProgressLoop() {
    const update = () => {
      // 弹性缓动趋近目标值
      const diff = this.targetProgress - this.displayProgress;
      if (Math.abs(diff) > 0.05) {
        this.displayProgress += diff * 0.08;
      } else {
        this.displayProgress = this.targetProgress;
      }

      const percent = Math.min(100, Math.floor(this.displayProgress));

      if (this.barFill) {
        this.barFill.style.width = `${percent}%`;
      }
      if (this.percentText) {
        this.percentText.textContent = `${percent}%`;
      }

      // 动态状态提示文字
      if (this.statusText) {
        if (percent < 40) {
          this.statusText.textContent = "正在铺设浪漫花艺...";
        } else if (percent < 80) {
          this.statusText.textContent = "正在调校礼堂音律...";
        } else if (percent < 100) {
          this.statusText.textContent = "即将开启婚礼华章...";
        }
      }

      if (percent >= 100 && !this.isCompleted) {
        this.isCompleted = true;
        this.onProgressComplete();
      }

      if (!this.isEntered) {
        this.animId = requestAnimationFrame(update);
      }
    };

    this.animId = requestAnimationFrame(update);
  }

  onProgressComplete() {
    if (this.statusText) {
      this.statusText.textContent = "爱意就绪 · 诚挚邀请";
    }

    if (this.overlay) {
      this.overlay.classList.add('ready');
    }

    // 显示“开启请柬”烫金呼吸按钮
    if (this.actionArea) {
      this.actionArea.classList.add('visible');
    }
  }

  enterInvitation() {
    if (this.isEntered) return;
    this.isEntered = true;

    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    // 触发外部回调（启动背景音乐播放与场景激活）
    if (typeof this.onEnterCallback === 'function') {
      this.onEnterCallback();
    }

    // 华丽淡出大幕
    if (this.overlay) {
      this.overlay.classList.add('fade-out');
      setTimeout(() => {
        this.overlay.style.display = 'none';
      }, 900);
    }
  }
}

// 挂载全局
window.WeddingPreloader = WeddingPreloader;
