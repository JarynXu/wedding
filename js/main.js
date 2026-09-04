/**
 * 移动端竖版电子婚礼请柬 - 交互与动态配置渲染引擎
 */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.WEDDING_CONFIG || {};

  // 1. 渲染网页标题与全局数据（包含 Preloader 文本）
  renderConfigData(config);

  // 2. 初始化背景音乐控制器
  const audioController = initAudioPlayer(config);

  // 3. 初始化单屏固定舞台场景切换引擎与多维手势系统
  initSceneTransitionEngine();

  // 4. 初始化地图导航弹窗
  initMapModal(config);

  // 5. 初始化全资源预加载与开场仪式感引擎
  initPreloaderSystem(config, audioController);
});

/**
 * 将 config.js 中的数据动态绑定至 DOM 元素
 */
function renderConfigData(config) {
  if (config.meta?.pageTitle) {
    document.title = config.meta.pageTitle;
  }

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el && text !== undefined) el.textContent = text;
  };
  const setSrc = (id, src) => {
    const el = document.getElementById(id);
    if (el && src) el.src = src;
  };

  // Preloader 预加载界面
  setText('preloaderMonogram', config.monogram || 'JH');
  setText('preloaderNames', config.coupleNamesEn || 'JARYN & HANNA');

  // Screen 01: 封面智能图层处理
  setText('coverMonogram', config.monogram || 'JH');
  setText('coverNames', config.coupleNamesEn || 'JARYN & HANNA');
  setText('coverDate', config.date?.formattedDate || '2025.05.20');

  const defaultPhotoPath = 'assets/images/welcome-photo.jpg';
  const coverBgPhoto = document.getElementById('coverBgPhoto');
  const coverFrameOverlay = document.getElementById('coverFrameOverlay');

  const urlParams = new URLSearchParams(window.location.search);
  const coverParam = urlParams.get('cover');
  if (coverParam === 'opt1' && coverBgPhoto) {
    coverBgPhoto.src = 'assets/images/cover_option_1_french_clean.jpg';
    if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
  } else if (coverParam === 'opt2' && coverBgPhoto) {
    coverBgPhoto.src = 'assets/images/cover_option_2_burgundy_velvet.jpg';
    if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
  } else if (!config.assets?.welcomePhoto || config.assets.welcomePhoto === defaultPhotoPath) {
    if (coverBgPhoto) coverBgPhoto.src = 'assets/images/card01_bg.jpg';
    if (coverFrameOverlay) coverFrameOverlay.style.display = 'none';
  } else {
    if (coverBgPhoto) coverBgPhoto.src = config.assets.welcomePhoto;
    if (coverFrameOverlay) coverFrameOverlay.style.display = 'block';
  }

  // Screen 02: 序章
  setText('page02Title', config.texts?.page02Title || '我们要结婚了');
  setText('page02Sub', config.texts?.page02Sub || 'WE ARE GETTING MARRIED');

  // Screen 03: 时间
  setText('timeYear', config.date?.year || '2025');
  setText('timeMonthDay', `${config.date?.month || '05'}/${config.date?.day || '20'}`);
  setText('timeWeekday', config.date?.dayOfWeekEn || 'SATURDAY');

  const scheduleListEl = document.getElementById('scheduleList');
  if (scheduleListEl && Array.isArray(config.schedule)) {
    scheduleListEl.innerHTML = config.schedule.map(item => `
      <div class="schedule-item">
        <span class="schedule-time">${item.time}</span>
        <span class="schedule-title">${item.title}</span>
      </div>
    `).join('');
  }

  // Screen 04: 见证
  const quoteEl = document.getElementById('quoteContainer');
  if (quoteEl && Array.isArray(config.texts?.page04Quote)) {
    quoteEl.innerHTML = config.texts.page04Quote.map(line => `
      <div class="quote-line">${line}</div>
    `).join('');
  }

  // Screen 05: 地点
  setText('venueName', config.venue?.name || '玫瑰庄园酒店');
  setText('venueNameEn', config.venue?.nameEn || 'ROSE MANOR HOTEL');
  setText('venueAddress', config.venue?.address || '杭州市西湖区之江路128号');

  // Screen 06: 期待相见
  setText('page06Text', config.texts?.page06Text || '期待与您相见');

  // Screen 07: 新人展示
  setSrc('page07Photo', config.assets?.welcomePhoto || defaultPhotoPath);
  setText('page07Watermark', config.coupleNamesEn || 'JARYN & HANNA');

  // Screen 08: 邀请函正文
  setText('invitationHeader', `— ${config.texts?.invitationHeader || '诚挚邀请'} —`);
  setText('invitationHeaderEn', config.texts?.invitationHeaderEn || 'INVITATION');
  setText('scriptNames', config.coupleScriptNames || 'Jaryn & Hanna');

  const invBodyEl = document.getElementById('invitationBody');
  if (invBodyEl && Array.isArray(config.texts?.invitationBody)) {
    invBodyEl.innerHTML = config.texts.invitationBody.map(line => `
      <div class="inv-para-line">${line}</div>
    `).join('');
  }

  setText('invFullTime', `${config.date?.formattedDate || '2025.05.20'} ${config.date?.ceremonyTime || '17:00'}`);
  setText('invVenueName', config.venue?.name || '玫瑰庄园酒店');
  setText('invVenueAddress', config.venue?.address || '杭州市西湖区之江路128号');
}

/**
 * 背景音乐控制器（自动播放兼容与旋转切换）
 */
function initAudioPlayer(config) {
  const musicAudio = document.getElementById('bgMusic');
  const musicBtn = document.getElementById('musicToggle');
  if (!musicAudio || !musicBtn) return;

  if (config.assets?.bgMusic) {
    musicAudio.src = config.assets.bgMusic;
  }

  let isPlaying = false;
  let userInteracted = false;

  const playMusic = () => {
    musicAudio.play().then(() => {
      isPlaying = true;
      musicBtn.classList.remove('paused');
      musicBtn.classList.add('playing');
    }).catch(() => {
      isPlaying = false;
      musicBtn.classList.remove('playing');
      musicBtn.classList.add('paused');
    });
  };

  const pauseMusic = () => {
    musicAudio.pause();
    isPlaying = false;
    musicBtn.classList.remove('playing');
    musicBtn.classList.add('paused');
  };

  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userInteracted = true;
    if (isPlaying) {
      pauseMusic();
    } else {
      playMusic();
    }
  });

  const unlockAutoPlay = () => {
    if (!userInteracted && !isPlaying) {
      playMusic();
    }
    ['touchstart', 'touchend', 'click'].forEach(evt => {
      document.removeEventListener(evt, unlockAutoPlay);
    });
  };

  ['touchstart', 'touchend', 'click'].forEach(evt => {
    document.addEventListener(evt, unlockAutoPlay, { passive: true, once: true });
  });

  if (typeof window.WeixinJSBridgeReady !== 'undefined') {
    window.WeixinJSBridgeReady(playMusic);
  } else {
    document.addEventListener('WeixinJSBridgeReady', playMusic, false);
  }

  playMusic();
  return { playMusic, pauseMusic };
}

/**
 * 单屏固定舞台与电影级场景渐隐渐入切换引擎 (Fixed-Screen Dissolve Engine)
 */
function initSceneTransitionEngine() {
  const stage = document.getElementById('scrollContainer') || document.querySelector('.scene-stage');
  if (!stage) return;

  const cards = Array.from(document.querySelectorAll('.card'));
  const totalScenes = cards.length;
  if (totalScenes === 0) return;

  let currentIndex = 0;
  let isTransitioning = false;
  const TRANSITION_DURATION = 680; // 毫秒

  // 1. 初始化场景状态：仅当前页展示，其余完全隐藏
  function initSceneStates(initialIndex = 0) {
    currentIndex = Math.max(0, Math.min(initialIndex, totalScenes - 1));
    cards.forEach((card, idx) => {
      card.className = card.className
        .replace(/scene-[a-z0-9-]+|prep-[a-z0-9-]+|active/g, '')
        .trim();
      card.style.cssText = '';
      if (idx === currentIndex) {
        card.classList.add('scene-active', 'active');
      }
    });
  }

  // 2. 核心场景渐隐渐出、渐显渐入驱动函数
  function goToScene(targetIndex, direction = 'up', isInstant = false) {
    if (targetIndex < 0 || targetIndex >= totalScenes || targetIndex === currentIndex) {
      return false;
    }
    if (isTransitioning && !isInstant) {
      return false;
    }

    const currentCard = cards[currentIndex];
    const targetCard = cards[targetIndex];

    if (isInstant) {
      initSceneStates(targetIndex);
      return true;
    }

    isTransitioning = true;

    // 清空两张卡片上的临时类与内联样式
    currentCard.className = currentCard.className.replace(/scene-[a-z0-9-]+|prep-[a-z0-9-]+/g, '').trim();
    targetCard.className = targetCard.className.replace(/scene-[a-z0-9-]+|prep-[a-z0-9-]+/g, '').trim();
    currentCard.style.cssText = '';
    targetCard.style.cssText = '';

    if (direction === 'up' || targetIndex > currentIndex) {
      // ===== 下滑浏览（进入下一页）：目标卡片自微沉处渐显，当前卡片微浮渐隐 =====
      targetCard.classList.add('prep-from-bottom');
      currentCard.classList.add('scene-active');

      // 强制回流使初始位置生效
      void targetCard.offsetWidth;

      // 激活目标卡片的仪式感盛放动画
      targetCard.classList.add('active');

      requestAnimationFrame(() => {
        targetCard.classList.remove('prep-from-bottom');
        targetCard.classList.add('scene-fade-in-up');
        currentCard.classList.remove('scene-active');
        currentCard.classList.add('scene-fade-out-up');
      });

      setTimeout(() => {
        currentCard.classList.remove('scene-fade-out-up', 'active');
        targetCard.classList.remove('scene-fade-in-up');
        targetCard.classList.add('scene-active');
        currentIndex = targetIndex;
        isTransitioning = false;
      }, TRANSITION_DURATION);

    } else {
      // ===== 上滑返回（返回上一页）：目标卡片自上方渐显，当前卡片向下渐隐 =====
      targetCard.classList.add('prep-from-top');
      currentCard.classList.add('scene-active');

      // 强制回流
      void targetCard.offsetWidth;

      targetCard.classList.add('active');

      requestAnimationFrame(() => {
        targetCard.classList.remove('prep-from-top');
        targetCard.classList.add('scene-fade-in-down');
        currentCard.classList.remove('scene-active');
        currentCard.classList.add('scene-fade-out-down');
      });

      setTimeout(() => {
        currentCard.classList.remove('scene-fade-out-down', 'active');
        targetCard.classList.remove('scene-fade-in-down');
        targetCard.classList.add('scene-active');
        currentIndex = targetIndex;
        isTransitioning = false;
      }, TRANSITION_DURATION);
    }

    return true;
  }

  function nextScene() {
    return goToScene(currentIndex + 1, 'up');
  }

  function prevScene() {
    return goToScene(currentIndex - 1, 'down');
  }

  // 3. 手机端触摸滑动手势交互（灵敏识别上划/下划触发渐显渐隐换场）
  let startY = 0;
  let startX = 0;
  let startTime = 0;
  let isTracking = false;

  const onTouchStart = (e) => {
    if (isTransitioning) return;
    if (e.target.closest('button, a, input, .nav-map-btn, .map-modal-mask, .map-modal-sheet, .music-btn')) {
      return; // 保证按钮和弹窗正常点击，不拦截
    }
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    startTime = Date.now();
    isTracking = true;
  };

  const onTouchMove = (e) => {
    if (!isTracking) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;

    // 只要是垂直滑动，立即阻止原生页面下拉回弹/刷新
    if (Math.abs(deltaY) > Math.abs(deltaX) && e.cancelable) {
      e.preventDefault();
    }
  };

  const onTouchEnd = (e) => {
    if (!isTracking) return;
    isTracking = false;

    if (isTransitioning) return;

    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;

    // 划动有效阈值：垂直划动超过 28px，且垂直位移大于水平位移
    if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < 0) {
        // 手指上划 -> 切换到下一个场景（当前渐隐、下一场景渐显）
        nextScene();
      } else {
        // 手指下划 -> 返回上一个场景（当前渐隐、上一场景渐显）
        prevScene();
      }
    }
  };

  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchmove', onTouchMove, { passive: false });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });
  stage.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // 4. PC 鼠标滚轮平滑防抖换场
  let wheelTimeout = null;
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (isTransitioning) return;

    if (wheelTimeout) return;
    wheelTimeout = setTimeout(() => {
      wheelTimeout = null;
    }, 400);

    if (e.deltaY > 15) {
      nextScene();
    } else if (e.deltaY < -15) {
      prevScene();
    }
  }, { passive: false });

  // 5. 键盘上下键支持
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      nextScene();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      prevScene();
      e.preventDefault();
    }
  });

  // 6. 翻页圆圈箭头与滑动提示点击
  document.querySelectorAll('.scroll-circle-arrow, .scroll-hint').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      nextScene();
    });
  });

  // 7. URL 参数与 Hash 深度链接识别
  const urlParams = new URLSearchParams(window.location.search);
  const cardQuery = urlParams.get('card');
  if (cardQuery) {
    const targetIdx = parseInt(cardQuery, 10) - 1;
    if (targetIdx >= 0 && targetIdx < totalScenes) {
      initSceneStates(targetIdx);
      return;
    }
  } else if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    const targetIdx = cards.indexOf(target);
    if (targetIdx >= 0) {
      initSceneStates(targetIdx);
      return;
    }
  }

  // 默认启动首场
  initSceneStates(0);
}

/**
 * 地图导航弹窗与多平台外链跳转
 */
function initMapModal(config) {
  const openBtn = document.getElementById('openMapBtn');
  const modalMask = document.getElementById('mapModalMask');
  const closeBtn = document.getElementById('closeModalBtn');
  const copyBtn = document.getElementById('copyAddrBtn');
  const modalAddrText = document.getElementById('modalAddressText');

  if (!openBtn || !modalMask) return;

  const venue = config.venue || {};
  const lat = venue.latitude || 30.19854;
  const lng = venue.longitude || 120.12568;
  const name = encodeURIComponent(venue.name || '婚礼现场');
  const address = venue.address || '杭州市西湖区之江路128号';

  if (modalAddrText) {
    modalAddrText.textContent = `${venue.name || ''} - ${address}`;
  }

  const amapLink = document.getElementById('linkAmap');
  const tencentLink = document.getElementById('linkTencent');
  const baiduLink = document.getElementById('linkBaidu');
  const appleLink = document.getElementById('linkApple');

  if (amapLink) amapLink.href = `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}`;
  if (tencentLink) tencentLink.href = `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${name};addr:${encodeURIComponent(address)}`;
  if (baiduLink) baiduLink.href = `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${name}&content=${encodeURIComponent(address)}&output=html`;
  if (appleLink) appleLink.href = `https://maps.apple.com/?ll=${lat},${lng}&q=${name}`;

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modalMask.classList.add('active');
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('modal') === '1') {
    modalMask.classList.add('active');
  }

  const closeModal = () => modalMask.classList.remove('active');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modalMask.addEventListener('click', (e) => {
    if (e.target === modalMask) closeModal();
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(() => {
          showToast('地址已成功复制到剪贴板！');
          setTimeout(closeModal, 600);
        }).catch(() => fallbackCopy(address));
      } else {
        fallbackCopy(address);
      }
    });
  }

  function fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('地址已复制！');
    setTimeout(closeModal, 600);
  }

  function showToast(msg) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(50, 35, 20, 0.92);
        color: #fff6e8;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 0.88rem;
        z-index: 10000;
        letter-spacing: 0.08em;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        pointer-events: none;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2000);
  }
}

/**
 * 全资源预加载与开场仪式感联动系统
 */
function initPreloaderSystem(config, audioController) {
  const coverCard = document.getElementById('card-01');
  if (coverCard) {
    // 初始先移除 active，等待开启请柬瞬间再激活盛放仪式动效
    coverCard.classList.remove('active');
  }

  if (typeof window.WeddingPreloader !== 'undefined') {
    const preloader = new window.WeddingPreloader({
      onEnter: () => {
        // 1. 用户点击瞬间唤醒背景音乐（100% 解锁移动端与微信音频播放权限）
        if (audioController && typeof audioController.playMusic === 'function') {
          audioController.playMusic();
        }
        // 2. 激活封面仪式感盛放动画
        if (coverCard) {
          void coverCard.offsetWidth; // 强制重排
          coverCard.classList.add('active');
        }
      }
    });
    preloader.init();
  } else {
    // 降级兼容：若无 preloader 则直接激活封面
    if (coverCard) coverCard.classList.add('active');
  }
}
