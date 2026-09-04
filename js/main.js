/**
 * 移动端竖版电子婚礼请柬 - 交互与动态配置渲染引擎
 */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.WEDDING_CONFIG || {};

  // 1. 渲染网页标题与全局数据
  renderConfigData(config);

  // 2. 初始化背景音乐控制器
  initAudioPlayer(config);

  // 3. 初始化全屏滚动与翻页箭头事件
  initScrollInteractions();

  // 4. 初始化地图导航弹窗
  initMapModal(config);

  // 5. URL 参数与 Hash 直接定位卡片支持 (如 ?card=3 或 #card-03)
  const urlParams = new URLSearchParams(window.location.search);
  const cardQuery = urlParams.get('card');
  const container = document.getElementById('scrollContainer');
  const cards = document.querySelectorAll('.card');

  if (cardQuery && container) {
    const cardIdx = parseInt(cardQuery, 10) - 1;
    if (cardIdx >= 0 && cardIdx < cards.length) {
      container.scrollTop = cardIdx * container.clientHeight;
    }
  } else if (window.location.hash && container) {
    const target = document.querySelector(window.location.hash);
    const cardIdx = Array.from(cards).indexOf(target);
    if (cardIdx >= 0) {
      container.scrollTop = cardIdx * container.clientHeight;
    }
  }
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
  setText('page06Sub', config.texts?.page06Sub || 'LOOKING FORWARD TO SEEING YOU');

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
 * 全屏滚动平滑翻页与箭头交互
 */
function initScrollInteractions() {
  const container = document.getElementById('scrollContainer');
  if (!container) return;

  document.querySelectorAll('.scroll-circle-arrow, .scroll-hint').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentCard = btn.closest('.card');
      if (currentCard && currentCard.nextElementSibling) {
        currentCard.nextElementSibling.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  const cards = document.querySelectorAll('.card');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, {
    root: container,
    threshold: 0.6
  });

  cards.forEach(card => observer.observe(card));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      const activeCard = Array.from(cards).find(c => {
        const rect = c.getBoundingClientRect();
        return rect.top >= -50 && rect.top <= window.innerHeight / 2;
      });
      if (activeCard && activeCard.nextElementSibling) {
        activeCard.nextElementSibling.scrollIntoView({ behavior: 'smooth' });
        e.preventDefault();
      }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      const activeCard = Array.from(cards).find(c => {
        const rect = c.getBoundingClientRect();
        return rect.top >= -50 && rect.top <= window.innerHeight / 2;
      });
      if (activeCard && activeCard.previousElementSibling) {
        activeCard.previousElementSibling.scrollIntoView({ behavior: 'smooth' });
        e.preventDefault();
      }
    }
  });
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
