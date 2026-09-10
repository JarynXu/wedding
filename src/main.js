import './style.css';
import { WEDDING_CONFIG } from './config.js';

const coverOption1Url = new URL('./assets/cover_option_1_french_clean.jpg', import.meta.url).href;
const coverOption2Url = new URL('./assets/cover_option_2_burgundy_velvet.jpg', import.meta.url).href;
const curtainCoverUrl = new URL('./assets/card_01_hd.png', import.meta.url).href;
const burgundyCoverUrl = new URL('./assets/card01_bg_option_b.jpg', import.meta.url).href;
const defaultCoverUrl = new URL('./assets/card01_bg.jpg', import.meta.url).href;
const defaultCoverFrameUrl = new URL('./assets/card01_frame.png', import.meta.url).href;
const welcomePhotoUrl = new URL('./assets/welcome_photo_hd.jpg', import.meta.url).href;
const card2Url = new URL('./assets/card_02_hd.jpg', import.meta.url).href;
const card3Url = new URL('./assets/card_03_hd.jpg', import.meta.url).href;
const card4Url = new URL('./assets/card_04_hd.jpg', import.meta.url).href;
const defaultBgmUrl = new URL('./assets/Close to You-Olivia Ong.mp3', import.meta.url).href;
const weddingCalendarUrl = `${import.meta.env.BASE_URL}wedding.ics`;

// ==========================================
    // 婚礼全局配置引入 (来源于 config.js)
    // ==========================================
    const config = WEDDING_CONFIG;

    // 动态渲染全局配置数据至界面各个组件
    function renderConfigData() {
      if (!config) return;

      // 网页标题
      if (config.coupleNamesZh) {
        document.title = `${config.coupleNamesZh} · 婚礼请柬`;
      }

      // Preloader 信笺元素
      const monoEl = document.getElementById('preloaderMonogram');
      if (monoEl) {
        if (config.monogramImg) {
          monoEl.innerHTML = `<img src="${config.monogramImg}" alt="${config.monogram || '徐 & 赵'}" class="preloader-monogram-img">`;
        } else if (config.monogram) {
          monoEl.innerHTML = `<span class="preloader-monogram-text">${config.monogram}</span>`;
        }
      }
      const preNamesEl = document.getElementById('preloaderNames');
      if (preNamesEl && config.coupleNamesZh) preNamesEl.textContent = config.coupleNamesZh;
      const preDateEl = document.getElementById('preloaderDate');
      if (preDateEl && config.date?.formattedDate) preDateEl.textContent = config.date.formattedDate;

      // Page 1
      const p1Names = document.getElementById('p1CouplesNames');
      if (p1Names && config.coupleNamesZh) p1Names.textContent = config.coupleNamesZh;
      const p1Date = document.getElementById('p1DateText');
      if (p1Date && config.date?.formattedDate) p1Date.textContent = config.date.formattedDate;

      // Page 1 Monogram 徽章与多方案高清图层
      const coverMonogram = document.getElementById('coverMonogram');
      if (coverMonogram && config.monogram) coverMonogram.textContent = config.monogram;

      const coverBgPhoto = document.getElementById('coverBgPhoto');
      const coverFrameOverlay = document.getElementById('coverFrameOverlay');
      const currentUrlParams = new URLSearchParams(window.location.search);
      const coverParam = currentUrlParams.get('cover');

      if (coverParam === 'opt1' && coverBgPhoto) {
        coverBgPhoto.src = coverOption1Url;
        if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
      } else if (coverParam === 'opt2' && coverBgPhoto) {
        coverBgPhoto.src = coverOption2Url;
        if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
      } else if (coverParam === 'curtain' && coverBgPhoto) {
        coverBgPhoto.src = curtainCoverUrl;
        if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
      } else if (coverParam === 'burgundy' && coverBgPhoto) {
        coverBgPhoto.src = burgundyCoverUrl;
        if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
      } else {
        if (coverBgPhoto) {
          coverBgPhoto.src = (config.assets && config.assets.coverBg) || defaultCoverUrl;
        }
        if (coverFrameOverlay) {
          if (config.assets && config.assets.useCoverFrame) {
            coverFrameOverlay.src = config.assets.coverFrame || defaultCoverFrameUrl;
            coverFrameOverlay.style.display = 'block';
          } else {
            coverFrameOverlay.style.display = 'none';
          }
        }
      }

      // Page 2
      const p2Year = document.getElementById('p2Year');
      if (p2Year && config.date?.year) p2Year.textContent = config.date.year;
      const p2Day = document.getElementById('p2Day');
      if (p2Day && config.date?.month && config.date?.day) p2Day.textContent = `${config.date.month}/${config.date.day}`;
      const p2Week = document.getElementById('p2Week');
      if (p2Week && config.date) {
        const zh = config.date.dayOfWeekZh || '星期六';
        const en = config.date.dayOfWeekEn || 'SATURDAY';
        p2Week.textContent = `${zh} ${en}`;
      }

      // Page 2 流程日程动态渲染
      const p2Agenda = document.getElementById('p2Agenda');
      if (p2Agenda && Array.isArray(config.schedule)) {
        p2Agenda.innerHTML = config.schedule.map(item => `
          <div class="p2-agenda-row">
            <span class="p2-agenda-time">${item.time}</span>
            <span class="p2-agenda-event">${item.title || item.event}</span>
          </div>
        `).join('') + `
          <div class="p2-calendar-wrap">
            <button class="p2-calendar-btn" data-action="add-calendar">
              <span class="btn-line-main">✦ 添加到日历 ✦</span>
              <span class="btn-line-sub">ADD TO CALENDAR</span>
            </button>
          </div>
        `;
      }

      // Page 3
      const p3HotelName = document.getElementById('p3HotelName');
      if (p3HotelName && config.venue?.name) p3HotelName.textContent = config.venue.name;
      const p3HotelEn = document.getElementById('p3HotelEn');
      if (p3HotelEn && config.venue?.nameEn) p3HotelEn.textContent = config.venue.nameEn;
      const p3Address = document.getElementById('p3Address');
      if (p3Address && config.venue?.shortAddress) p3Address.textContent = config.venue.shortAddress;

      // Page 4
      const p4Couples = document.getElementById('p4Couples');
      if (p4Couples && config.coupleNamesZh) p4Couples.textContent = config.coupleNamesZh;
      const p4PoemTime = document.getElementById('p4PoemTime');
      if (p4PoemTime && config.date) {
        const dText = config.date.formattedFullZh || '2026年10月17日';
        const tText = config.date.ceremonyTime || '11:58';
        p4PoemTime.textContent = `${dText} ${tText}`;
      }
      const p4PoemVenue = document.getElementById('p4PoemVenue');
      if (p4PoemVenue && config.venue?.name) p4PoemVenue.textContent = config.venue.name;
      const p4PoemAddress = document.getElementById('p4PoemAddress');
      if (p4PoemAddress && config.venue) {
        const addr = config.venue.shortAddress || config.venue.address || '';
        const hall = config.venue.hall || '';
        p4PoemAddress.textContent = `（${addr}${hall ? ' · ' + hall : ''}）`;
      }

      // Map Modal
      const mapHotelVal = document.getElementById('mapHotelVal');
      if (mapHotelVal && config.venue?.name) {
        mapHotelVal.textContent = config.venue.name;
      }
      const mapHotelEn = document.getElementById('mapHotelEn');
      if (mapHotelEn && config.venue?.nameEn) {
        mapHotelEn.textContent = config.venue.nameEn;
      }
      const hotelAddressText = document.getElementById('hotelAddressText');
      if (hotelAddressText && config.venue?.address) {
        hotelAddressText.textContent = config.venue.address;
      }

      // 地图 App 外链 (经纬度精准直达)
      if (config.venue) {
        const v = config.venue;
        const nameEnc = encodeURIComponent(v.name || '');
        const addrEnc = encodeURIComponent(v.address || '');
        const lat = v.latitude;
        const lng = v.longitude;

        const amap = document.getElementById('mapAmapLink');
        if (amap) {
          amap.href = (lat && lng)
            ? `https://uri.amap.com/marker?position=${lng},${lat}&name=${nameEnc}`
            : `https://uri.amap.com/search?keyword=${nameEnc}`;
        }
        const tencent = document.getElementById('mapTencentLink');
        if (tencent) {
          tencent.href = (lat && lng)
            ? `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${nameEnc};addr:${addrEnc}`
            : `https://apis.map.qq.com/uri/v1/search?keyword=${nameEnc}`;
        }
        const baidu = document.getElementById('mapBaiduLink');
        if (baidu) {
          baidu.href = (lat && lng)
            ? `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${nameEnc}&content=${addrEnc}&output=html`
            : `https://api.map.baidu.com/geocoder?address=${addrEnc}&output=html`;
        }
        const apple = document.getElementById('mapAppleLink');
        if (apple) {
          apple.href = (lat && lng)
            ? `https://maps.apple.com/?ll=${lat},${lng}&q=${nameEnc}`
            : `http://maps.apple.com/?q=${nameEnc},${addrEnc}`;
        }
      }

      // Contact Modal
      if (config.groom) {
        const gName = document.getElementById('contactGroomVal');
        if (gName) gName.textContent = `${config.groom.name} ${config.groom.title || '先生'}`;
        const gTel = document.getElementById('contactGroomTel');
        if (gTel && config.groom.phone) gTel.href = `tel:${config.groom.phone}`;
      }
      if (config.bride) {
        const bName = document.getElementById('contactBrideVal');
        if (bName) bName.textContent = `${config.bride.name} ${config.bride.title || '女士'}`;
        const bTel = document.getElementById('contactBrideTel');
        if (bTel && config.bride.phone) bTel.href = `tel:${config.bride.phone}`;
      }

      // Calendar Modal
      const calTitle = document.getElementById('calEventTitle');
      if (calTitle && config.coupleNamesZh) calTitle.textContent = `${config.coupleNamesZh} 婚礼午宴`;
      const calTime = document.getElementById('calEventTime');
      if (calTime && config.date) calTime.textContent = `${config.date.formattedFullZh} 11:30 - 14:30`;
      const calLoc = document.getElementById('calEventLoc');
      if (calLoc && config.venue) calLoc.textContent = `${config.venue.name} · ${config.venue.hall || '国际厅(三楼)'}`;

      // 音频源
      if (config.assets?.bgMusic) {
        const audioEl = document.getElementById('bgm');
        if (audioEl && audioEl.getAttribute('src') !== config.assets.bgMusic) {
          audioEl.src = config.assets.bgMusic;
        }
      }
    }

    // ==========================================
    // 全资源预加载与开场仪式感引擎 (WeddingPreloader)
    // ==========================================
    class WeddingPreloader {
      constructor(options = {}) {
        this.overlay = document.getElementById('preloaderOverlay');
        this.barFill = document.getElementById('preloaderBarFill');
        this.percentText = document.getElementById('preloaderPercent');
        this.statusText = document.getElementById('preloaderStatus');
        this.actionArea = document.getElementById('preloaderActionArea');
        this.enterBtn = document.getElementById('btnEnterInvitation');

        this.onEnterCallback = options.onEnter || null;

        this.targetProgress = 12; // 初始启动底数，确保进入页面进度条即刻有呼吸动效
        this.displayProgress = 0;
        this.isCompleted = false;
        this.isEntered = false;
        this.animId = null;

        const cards = config.assets?.cards || [
          welcomePhotoUrl,
          card2Url,
          card3Url,
          card4Url
        ];
        const bgMusic = config.assets?.bgMusic || defaultBgmUrl;

        this.manifest = [
          ...cards.map(url => ({ type: 'image', url, weight: 15 })),
          { type: 'audio', url: bgMusic, weight: 15 },
          { type: 'font', name: 'WebFonts', weight: 10 }
        ];

        this.totalWeight = this.manifest.reduce((sum, item) => sum + item.weight, 0);
        this.loadedWeight = 0;
      }

      init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('nopreloader') === '1') {
          if (this.overlay) this.overlay.style.display = 'none';
          if (typeof this.onEnterCallback === 'function') this.onEnterCallback();
          const targetP = parseInt(urlParams.get('page'), 10);
          if (!isNaN(targetP) && typeof goToPage === 'function') {
            setTimeout(() => goToPage(targetP), 150);
          }
          return;
        }
        if (!this.overlay || this.overlay.style.display === 'none') return;

        this.startProgressLoop();
        this.loadAllAssets();

        // 3.2 秒弱网超时保底（保证任何极端弱网环境均不会卡死）
        setTimeout(() => {
          if (!this.isCompleted) {
            this.targetProgress = 100;
          }
        }, 3200);

        if (this.enterBtn) {
          this.enterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.enterInvitation();
          });
        }

        this.overlay.addEventListener('click', () => {
          if (!this.isCompleted) {
            // 加载中点击可快速加速至100%
            this.targetProgress = 100;
          } else if (!this.isEntered) {
            this.enterInvitation();
          }
        });
      }

      loadAllAssets() {
        this.manifest.forEach(item => {
          if (item.type === 'image') {
            const img = new Image();
            let handled = false;
            const onImg = () => {
              if (!handled) {
                handled = true;
                this.onItemLoaded(item.weight);
              }
            };
            img.onload = onImg;
            img.onerror = onImg;
            img.src = item.url;
            if (img.complete) {
              onImg();
            }
            setTimeout(onImg, 2000);
          } else if (item.type === 'audio') {
            const audioObj = new Audio();
            audioObj.preload = 'auto';
            let handled = false;
            const markAudio = () => {
              if (!handled) {
                handled = true;
                this.onItemLoaded(item.weight);
              }
            };
            audioObj.addEventListener('canplaythrough', markAudio, { once: true });
            audioObj.addEventListener('loadeddata', markAudio, { once: true });
            audioObj.addEventListener('error', markAudio, { once: true });
            setTimeout(markAudio, 1500);
            audioObj.src = item.url;
            try { audioObj.load(); } catch (e) { markAudio(); }
          } else if (item.type === 'font') {
            let handled = false;
            const markFont = () => {
              if (!handled) {
                handled = true;
                this.onItemLoaded(item.weight);
              }
            };
            if (document.fonts && document.fonts.ready) {
              document.fonts.ready.then(markFont).catch(markFont);
              setTimeout(markFont, 1000);
            } else {
              markFont();
            }
          }
        });
      }

      onItemLoaded(weight) {
        this.loadedWeight += weight;
        const rawPercent = Math.min(100, Math.round(12 + (this.loadedWeight / this.totalWeight) * 88));
        this.targetProgress = Math.max(this.targetProgress, rawPercent);
      }

      startProgressLoop() {
        const update = () => {
          const diff = this.targetProgress - this.displayProgress;
          if (Math.abs(diff) > 0.05) {
            this.displayProgress += diff * 0.09;
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

          if (this.statusText) {
            if (percent < 35) {
              this.statusText.textContent = "正在装点浪漫殿堂...";
            } else if (percent < 75) {
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

        if (typeof this.onEnterCallback === 'function') {
          this.onEnterCallback();
        }

        if (this.overlay) {
          this.overlay.classList.add('fade-out');
          setTimeout(() => {
            this.overlay.style.display = 'none';
          }, 880);
        }
      }
    }

    // ==========================================
    // 多屏滑动与手势逻辑
    // ==========================================
    let currentPage = 0;
    const totalPages = 4;
    const swiper = document.getElementById('swiperWrapper');
    const pages = document.querySelectorAll('.page');
    const dots = document.querySelectorAll('.nav-dot');
    let isAnimating = false;
    let touchStartY = 0;
    let touchEndY = 0;

    function goToPage(index) {
      if (index < 0 || index >= totalPages || isAnimating) return;
      isAnimating = true;
      currentPage = index;

      swiper.style.transform = `translateY(-${currentPage * 100}%)`;

      pages.forEach((p, idx) => {
        p.classList.toggle('active', idx === currentPage);
      });

      dots.forEach((d, idx) => {
        d.classList.toggle('active', idx === currentPage);
      });

      setTimeout(() => {
        isAnimating = false;
      }, 700);
    }

    function nextPage() {
      if (currentPage < totalPages - 1) {
        goToPage(currentPage + 1);
      } else {
        goToPage(0); // 循环至第一屏
      }
    }

    // 触摸滑动
    document.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY - touchEndY;
      if (Math.abs(diff) > 45) {
        if (diff > 0 && currentPage < totalPages - 1) {
          goToPage(currentPage + 1);
        } else if (diff < 0 && currentPage > 0) {
          goToPage(currentPage - 1);
        }
      }
    }, { passive: true });

    // 鼠标滚轮防抖
    let wheelTimer = null;
    window.addEventListener('wheel', (e) => {
      if (wheelTimer) return;
      wheelTimer = setTimeout(() => { wheelTimer = null; }, 600);
      if (e.deltaY > 20 && currentPage < totalPages - 1) {
        goToPage(currentPage + 1);
      } else if (e.deltaY < -20 && currentPage > 0) {
        goToPage(currentPage - 1);
      }
    }, { passive: true });

    // 键盘导航
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        nextPage();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (currentPage > 0) goToPage(currentPage - 1);
      }
    });

    // 右侧导航圆点点击
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.getAttribute('data-index'));
        goToPage(idx);
      });
    });

    // 支持 URL 参数定位页面 (?page=3 或 #p=3) 与跳过预加载 (?nopreloader=1)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('nopreloader')) {
      const overlay = document.getElementById('preloaderOverlay');
      if (overlay) overlay.style.display = 'none';
    }
    const initialPageParam = urlParams.get('page');
    if (initialPageParam !== null) {
      const pIdx = parseInt(initialPageParam);
      if (!isNaN(pIdx) && pIdx >= 0 && pIdx < totalPages) {
        setTimeout(() => goToPage(pIdx), 150);
      }
    }

    // ==========================================
    // 背景音乐播放控制与自动播放唤醒
    // ==========================================
    const audio = document.getElementById('bgm');
    const musicBtn = document.getElementById('musicBtn');
    const musicTip = document.getElementById('musicTip');
    let hasInteracted = false;

    function toggleMusic() {
      if (audio.paused) {
        audio.play().then(() => {
          musicBtn.classList.add('playing');
          musicTip.classList.add('fade-out');
        }).catch(err => {
          console.warn('Audio play prevented:', err);
        });
      } else {
        audio.pause();
        musicBtn.classList.remove('playing');
      }
    }

    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMusic();
    });

    // 首次触摸/点击全屏自动尝试唤醒背景音乐
    function autoPlayOnFirstTouch() {
      if (!hasInteracted) {
        hasInteracted = true;
        audio.play().then(() => {
          musicBtn.classList.add('playing');
          musicTip.classList.add('fade-out');
        }).catch(() => {
          // 浏览器阻止自动播放时保留手动按钮
        });
        document.removeEventListener('click', autoPlayOnFirstTouch);
        document.removeEventListener('touchstart', autoPlayOnFirstTouch);
      }
    }
    document.addEventListener('click', autoPlayOnFirstTouch);
    document.addEventListener('touchstart', autoPlayOnFirstTouch);

    // ==========================================
    // 全局配置渲染与开场仪式感预加载引擎启动
    // ==========================================
    renderConfigData();

    const weddingPreloader = new WeddingPreloader({
      onEnter: () => {
        // 用户主动点击“开启请柬”，顺畅激活背景音乐
        if (audio && audio.paused) {
          audio.play().then(() => {
            musicBtn.classList.add('playing');
            musicTip.classList.add('fade-out');
            hasInteracted = true;
          }).catch(() => {});
        }
      }
    });
    weddingPreloader.init();

    // ==========================================
    // 浪漫玫瑰花瓣飘落 Canvas 特效
    // ==========================================
    const canvas = document.getElementById('petalsCanvas');
    const ctx = canvas.getContext('2d');
    let width, height;
    const petals = [];
    const petalCount = 26;

    function resizeCanvas() {
      const container = document.getElementById('app');
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    class Petal {
      constructor() {
        this.reset(true);
      }
      reset(initial = false) {
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : -20;
        this.size = 9 + Math.random() * 13;
        this.speedY = 1.1 + Math.random() * 1.6;
        this.speedX = (Math.random() - 0.5) * 1.1;
        this.rotation = Math.random() * 360;
        this.rotSpeed = (Math.random() - 0.5) * 2;
        this.oscillation = Math.random() * Math.PI * 2;
        this.oscSpeed = 0.02 + Math.random() * 0.03;
        const colors = [
          'rgba(215, 80, 95, 0.72)',
          'rgba(235, 140, 150, 0.78)',
          'rgba(180, 50, 65, 0.65)',
          'rgba(255, 205, 215, 0.85)',
          'rgba(240, 160, 170, 0.7)'
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }
      update() {
        this.oscillation += this.oscSpeed;
        this.x += this.speedX + Math.sin(this.oscillation) * 0.8;
        this.y += this.speedY;
        this.rotation += this.rotSpeed;
        if (this.y > height + 20 || this.x < -30 || this.x > width + 30) {
          this.reset(false);
        }
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-this.size / 2, -this.size / 2, -this.size / 2, this.size / 2, 0, this.size);
        ctx.bezierCurveTo(this.size / 2, this.size / 2, this.size / 2, -this.size / 2, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }

    for (let i = 0; i < petalCount; i++) {
      petals.push(new Petal());
    }

    function animatePetals() {
      ctx.clearRect(0, 0, width, height);
      petals.forEach(p => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animatePetals);
    }
    animatePetals();

    // ==========================================
    // 婚礼倒计时计算器
    // ==========================================
    function updateCountdown() {
      const cdDaysEl = document.getElementById('cdDays');
      if (!cdDaysEl) return;
      const targetDateStr = config.date?.calendarIso || config.dateStr || '2026-10-17T11:58:00';
      const target = new Date(targetDateStr).getTime();
      const now = new Date().getTime();
      let diff = target - now;

      if (isNaN(diff) || diff < 0) {
        diff = 0;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      cdDaysEl.textContent = String(days).padStart(2, '0');
      const cdHoursEl = document.getElementById('cdHours');
      if (cdHoursEl) cdHoursEl.textContent = String(hours).padStart(2, '0');
      const cdMinsEl = document.getElementById('cdMins');
      if (cdMinsEl) cdMinsEl.textContent = String(mins).padStart(2, '0');
      const cdSecsEl = document.getElementById('cdSecs');
      if (cdSecsEl) cdSecsEl.textContent = String(secs).padStart(2, '0');
    }
    setInterval(updateCountdown, 1000);
    updateCountdown();

    // ==========================================
    // 模态弹窗系统
    // ==========================================
    function openModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.add('open');
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) modal.classList.remove('open');
    }

    document.querySelectorAll('.modal-backdrop').forEach(b => {
      b.addEventListener('click', (e) => {
        if (e.target === b) {
          b.classList.remove('open');
        }
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action], [data-open-modal], [data-close-modal]');
      if (!target) return;

      if (target.dataset.openModal) {
        openModal(target.dataset.openModal);
        return;
      }

      if (target.dataset.closeModal) {
        closeModal(target.dataset.closeModal);
        return;
      }

      const actions = {
        'next-page': nextPage,
        'add-calendar': addToCalendar,
        'copy-address': copyAddress,
        'system-calendar': handleSystemCalendar,
        'copy-calendar': copyCalendarInfo,
        'close-wechat-guide': closeWechatGuide,
      };

      actions[target.dataset.action]?.();
    });

    // 复制地址
    function copyAddress() {
      const text = document.getElementById('hotelAddressText').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('地址已复制到剪贴板！'));
      } else {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('地址已复制到剪贴板！');
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('copyToast');
      if (msg) toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 2600);
    }


    // ==========================================
    // 加入手机日历系统 (多端适配 & 微信防拦截)
    // ==========================================
    function addToCalendar() {
      openModal('calendarModal');
      checkWechatCalendar();
    }

    function checkWechatCalendar() {
      const isWechat = /MicroMessenger/i.test(navigator.userAgent);
      const tipEl = document.getElementById('wechatCalendarTip');
      if (tipEl) {
        tipEl.style.display = isWechat ? 'flex' : 'none';
      }
    }

    function handleSystemCalendar() {
      const isWechat = /MicroMessenger/i.test(navigator.userAgent);
      if (isWechat) {
        // 微信内直接唤起系统日历会被微信内核拦截，展现右上角引导
        showWechatGuide();
        return;
      }

      // 通过 Vite 生成的静态资源 URL 打开 wedding.ics。
      // iOS Safari 会自动唤起日历事件导入浮层，安卓浏览器会直接唤起系统日历或下载打开
      if (window.location.protocol.startsWith('http')) {
        window.location.href = weddingCalendarUrl;
        showToast('正在打开系统日历，请在弹出窗口中确认添加 ✦');
      } else {
        // 本地 file:// 协议打开时使用 Blob 下载保底
        downloadIcsBlob();
      }
    }

    function downloadIcsBlob() {
      const icsContent =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Wedding Invitation//Xu Zhiyue & Zhao Rongrong Wedding//CN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:徐旨越 & 赵荣蓉 婚礼午宴
X-WR-TIMEZONE:Asia/Shanghai
BEGIN:VEVENT
UID:wedding-20261017-xuzhiyue-zhaorongrong@wedding.com
DTSTAMP:20260909T000000Z
DTSTART:20261017T033000Z
DTEND:20261017T063000Z
SUMMARY:徐旨越 & 赵荣蓉 婚礼午宴
DESCRIPTION:诚挚邀请您参加 徐旨越 与 赵荣蓉 的婚礼仪式与喜宴！\\n时间：2026年10月17日 11:30 入场\\n地点：东海嘉臣国际大酒店 · 国际厅(三楼)\\n地址：江苏省连云港市东海县晶都大道99号\\n期待与您一同见证幸福时刻！
LOCATION:东海嘉臣国际大酒店 · 国际厅(三楼)（江苏省连云港市东海县晶都大道99号）
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-P1D
ACTION:DISPLAY
DESCRIPTION:【婚礼提醒】明天是 徐旨越 & 赵荣蓉 的婚礼午宴，记得盛装出席哦！
END:VALARM
BEGIN:VALARM
TRIGGER:-PT2H
ACTION:DISPLAY
DESCRIPTION:【婚礼提醒】徐旨越 & 赵荣蓉 婚礼午宴将在2小时后（11:30）开始，期待您的光临！
END:VALARM
END:VEVENT
END:VCALENDAR`;

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', 'wedding.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('日历文件已生成，请在下载中点击打开导入日历 ✦');
    }

    function copyCalendarInfo() {
      const text =
`【婚礼日程】
新人：徐旨越 & 赵荣蓉
时间：2026年10月17日 11:30 - 14:30
地点：东海嘉臣国际大酒店 · 国际厅(三楼)
地址：江苏省连云港市东海县晶都大道99号
诚挚期待您的莅临与祝福！`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('婚礼日程已复制！可直接在手机备忘录或日历中粘贴 ✦');
        }).catch(() => {
          fallbackCopyText(text);
        });
      } else {
        fallbackCopyText(text);
      }
    }

    function fallbackCopyText(text) {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('婚礼日程已复制！可直接在手机备忘录或日历中粘贴 ✦');
    }

    function openGoogleCalendar() {
      const title = encodeURIComponent("徐旨越 & 赵荣蓉 婚礼午宴");
      const dates = "20261017T033000Z/20261017T063000Z";
      const details = encodeURIComponent("诚挚邀请您参加 徐旨越 与 赵荣蓉 的婚礼仪式与喜宴！\n时间：2026年10月17日 11:30 入场\n地点：东海嘉臣国际大酒店 · 国际厅(三楼) (江苏省连云港市东海县晶都大道99号)");
      const location = encodeURIComponent("东海嘉臣国际大酒店 · 国际厅(三楼) (江苏省连云港市东海县晶都大道99号)");
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
      window.open(url, '_blank');
    }

    function showWechatGuide() {
      const overlay = document.getElementById('wechatGuideOverlay');
      if (overlay) overlay.classList.add('show');
    }

    function closeWechatGuide() {
      const overlay = document.getElementById('wechatGuideOverlay');
      if (overlay) overlay.classList.remove('show');
    }
