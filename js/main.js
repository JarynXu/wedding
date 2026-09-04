/**
 * 移动端竖版电子婚礼请柬 - 交互与动态配置渲染引擎
 */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.WEDDING_CONFIG || {};

  // 1. 渲染网页标题与全局数据
  renderConfigData(config);

  // 2. 初始化背景音乐控制器
  initAudioPlayer(config);

  // 3. 初始化单屏固定舞台场景切换引擎与多维手势系统
  initSceneTransitionEngine();

  // 4. 初始化地图导航弹窗
  initMapModal(config);
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
}

/**
 * 单屏固定舞台与 3D 场景切换引擎 (Fixed-Screen Scene Transition Engine)
 */
function initSceneTransitionEngine() {
  const stage = document.getElementById('scrollContainer') || document.querySelector('.scene-stage');
  if (!stage) return;

  const cards = Array.from(document.querySelectorAll('.card'));
  const totalScenes = cards.length;
  if (totalScenes === 0) return;

  let currentIndex = 0;
  let isTransitioning = false;
  const TRANSITION_DURATION = 620; // 毫秒

  // 1. 初始化场景状态：仅目标页激活并展示，其余场景隐藏以节约 GPU 功耗
  function initSceneStates(initialIndex = 0) {
    currentIndex = Math.max(0, Math.min(initialIndex, totalScenes - 1));
    cards.forEach((card, idx) => {
      card.classList.remove('scene-active', 'scene-underneath', 'scene-exit-down', 'scene-enter-from-bottom', 'no-transition', 'active');
      card.style.transform = '';
      card.style.filter = '';
      card.style.opacity = '';
      card.style.zIndex = '';
      if (idx === currentIndex) {
        card.classList.add('scene-active', 'active');
      }
    });
  }

  // 2. 核心场景切换驱动函数
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

    // 清除可能残余的实时手势临时内联样式
    currentCard.classList.remove('no-transition');
    targetCard.classList.remove('no-transition');
    currentCard.style.transform = '';
    currentCard.style.filter = '';
    currentCard.style.opacity = '';
    targetCard.style.transform = '';
    targetCard.style.filter = '';
    targetCard.style.opacity = '';

    if (direction === 'up' || targetIndex > currentIndex) {
      // ===== 向下浏览（进入下一个场景）：新卡片自底部滑入并展开，当前卡片后退微沉 =====
      targetCard.classList.remove('scene-underneath', 'scene-exit-down');
      targetCard.classList.add('scene-enter-from-bottom');
      targetCard.style.zIndex = '30';

      currentCard.style.zIndex = '10';

      // 强制回流，确保初始进场样式生效
      void targetCard.offsetWidth;

      // 激活目标卡片的仪式感盛放动画
      targetCard.classList.add('active');

      // 触发平滑过渡
      requestAnimationFrame(() => {
        currentCard.classList.remove('scene-active');
        currentCard.classList.add('scene-underneath');

        targetCard.classList.remove('scene-enter-from-bottom');
        targetCard.classList.add('scene-active');
      });

      setTimeout(() => {
        currentCard.classList.remove('scene-underneath', 'active');
        currentCard.style.zIndex = '';
        targetCard.style.zIndex = '';
        currentIndex = targetIndex;
        isTransitioning = false;
      }, TRANSITION_DURATION);

    } else {
      // ===== 向上返回（返回上一个场景）：当前卡片向下滑出，上一个卡片在底层重新浮现 =====
      targetCard.classList.remove('scene-exit-down', 'scene-enter-from-bottom');
      targetCard.classList.add('scene-underneath');
      targetCard.style.zIndex = '10';

      currentCard.classList.remove('scene-enter-from-bottom');
      currentCard.classList.add('scene-active');
      currentCard.style.zIndex = '30';

      // 强制回流
      void targetCard.offsetWidth;

      targetCard.classList.add('active');

      requestAnimationFrame(() => {
        targetCard.classList.remove('scene-underneath');
        targetCard.classList.add('scene-active');

        currentCard.classList.remove('scene-active');
        currentCard.classList.add('scene-exit-down');
      });

      setTimeout(() => {
        currentCard.classList.remove('scene-exit-down', 'active');
        currentCard.style.zIndex = '';
        targetCard.style.zIndex = '';
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

  // 3. 触摸滑动手势交互（支持快速划动与 1:1 跟手阻尼微预览）
  let startY = 0;
  let startX = 0;
  let startTime = 0;
  let isTouching = false;
  let isDraggingVertically = false;

  const onTouchStart = (e) => {
    if (isTransitioning) return;
    if (e.target.closest('button, a, input, .nav-map-btn, .map-modal-mask, .map-modal-sheet, .music-btn')) {
      return;
    }
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    startTime = Date.now();
    isTouching = true;
    isDraggingVertically = false;
  };

  const onTouchMove = (e) => {
    if (!isTouching || isTransitioning) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;

    if (!isDraggingVertically) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        isDraggingVertically = true;
      } else if (Math.abs(deltaX) > 8) {
        isTouching = false;
        return;
      }
    }

    if (isDraggingVertically) {
      // 阻止浏览器默认拉动回弹
      if (e.cancelable) e.preventDefault();

      const height = stage.clientHeight || window.innerHeight;
      const currentCard = cards[currentIndex];

      if (deltaY < 0 && currentIndex < totalScenes - 1) {
        // 向上拖动（探索下一场景）
        const nextCard = cards[currentIndex + 1];
        nextCard.classList.add('no-transition');
        currentCard.classList.add('no-transition');

        const movePercent = Math.min(100, Math.max(0, 100 + (deltaY / height) * 100));
        const underScale = 1 - (Math.abs(deltaY) / height) * 0.08;
        const underBright = 1 - (Math.abs(deltaY) / height) * 0.35;

        nextCard.style.visibility = 'visible';
        nextCard.style.opacity = '1';
        nextCard.style.zIndex = '30';
        nextCard.style.transform = `translate3d(0, ${movePercent}%, 0)`;

        currentCard.style.transform = `translate3d(0, ${(-Math.abs(deltaY) / height) * 6}%, 0) scale(${underScale})`;
        currentCard.style.filter = `brightness(${underBright})`;
      } else if (deltaY > 0 && currentIndex > 0) {
        // 向下拖动（重温上一场景）
        const prevCard = cards[currentIndex - 1];
        prevCard.classList.add('no-transition');
        currentCard.classList.add('no-transition');

        const movePercent = Math.min(100, Math.max(0, (deltaY / height) * 100));
        const underScale = 0.92 + (deltaY / height) * 0.08;
        const underBright = 0.65 + (deltaY / height) * 0.35;

        prevCard.style.visibility = 'visible';
        prevCard.style.opacity = '0.5';
        prevCard.style.zIndex = '10';
        prevCard.style.transform = `translate3d(0, ${(-6 + (deltaY / height) * 6)}%, 0) scale(${underScale})`;
        prevCard.style.filter = `brightness(${underBright})`;

        currentCard.style.zIndex = '30';
        currentCard.style.transform = `translate3d(0, ${movePercent}%, 0)`;
      } else {
        // 边界弹性阻尼
        const damped = deltaY * 0.22;
        currentCard.classList.add('no-transition');
        currentCard.style.transform = `translate3d(0, ${damped}px, 0)`;
      }
    }
  };

  const onTouchEnd = (e) => {
    if (!isTouching) return;
    isTouching = false;

    if (!isDraggingVertically) return;
    isDraggingVertically = false;

    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - startY;
    const duration = Date.now() - startTime;
    const height = stage.clientHeight || window.innerHeight;

    // 清除拖拽卡片的 no-transition 标记
    cards.forEach(c => c.classList.remove('no-transition'));

    const isFlick = duration < 280 && Math.abs(deltaY) > 24;
    const isDraggedEnough = Math.abs(deltaY) > height * 0.12 || Math.abs(deltaY) > 45;

    if ((isFlick || isDraggedEnough) && deltaY < 0 && currentIndex < totalScenes - 1) {
      goToScene(currentIndex + 1, 'up');
    } else if ((isFlick || isDraggedEnough) && deltaY > 0 && currentIndex > 0) {
      goToScene(currentIndex - 1, 'down');
    } else {
      // 未达到换场阈值，优雅弹性复位
      const currentCard = cards[currentIndex];
      currentCard.style.transition = 'transform 0.32s var(--ease-luxury), filter 0.32s ease';
      currentCard.style.transform = 'translate3d(0, 0, 0) scale(1)';
      currentCard.style.filter = 'brightness(1)';

      if (currentIndex < totalScenes - 1) {
        const nextCard = cards[currentIndex + 1];
        nextCard.style.transition = 'transform 0.32s var(--ease-luxury)';
        nextCard.style.transform = 'translate3d(0, 100%, 0)';
      }
      if (currentIndex > 0) {
        const prevCard = cards[currentIndex - 1];
        prevCard.style.transition = 'transform 0.32s var(--ease-luxury)';
        prevCard.style.transform = 'translate3d(0, -6%, 0) scale(0.92)';
      }

      setTimeout(() => {
        initSceneStates(currentIndex);
      }, 340);
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
