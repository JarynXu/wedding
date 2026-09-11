import './fonts.css';
import './shell.css';
import './glass.css';
import './style.css';
import './motion.css';
import { RosePetals } from './petals.js';
import { WeddingPreloader } from './preloader.js';
import { WEDDING_CONFIG } from './config.js';
import { getShareMetadata } from './share-metadata.js';
import { configureWechatShare } from './wechat-share.js';

// 分享配置独立于请柬素材加载，不阻塞开场或音乐。
configureWechatShare(getShareMetadata(WEDDING_CONFIG), WEDDING_CONFIG.share.wechatSignatureEndpoint).then(state => {
  document.documentElement.dataset.wechatShare = state;
}).catch(error => {
  document.documentElement.dataset.wechatShare = 'failed';
  console.warn('微信自定义分享未启用', error);
});

// 生产样式非阻塞加载；资源清单须在样式可读后收集。
const stylesReady = Promise.all([...document.querySelectorAll('link[data-invitation-styles]')].map(link => new Promise((resolve, reject) => {
  if (link.dataset.loaded === 'true') { resolve(); return; }
  if (link.dataset.failed === 'true') { reject(new Error('请柬样式加载失败')); return; }
  link.addEventListener('load', resolve, { once: true });
  link.addEventListener('error', () => reject(new Error('请柬样式加载失败')), { once: true });
})));

stylesReady.then(initializeInvitation).catch(error => {
  window.invitationBootFailed();
  console.error('请柬初始化失败', error);
});

const coverOption1Url = new URL('./assets/cover_option_1_french_clean.jpg', import.meta.url).href;
const coverOption2Url = new URL('./assets/cover_option_2_burgundy_velvet.jpg', import.meta.url).href;
const defaultCoverUrl = new URL('./assets/cover-welcome-art.webp', import.meta.url).href;
const weddingCalendarUrl = `${import.meta.env.BASE_URL}wedding.ics`;

function initializeInvitation() {
// ==========================================
    // 婚礼全局配置引入 (来源于 config.js)
    // ==========================================
    const config = WEDDING_CONFIG;

    // 动态渲染全局配置数据至界面各个组件
    function renderConfigData() {
      if (!config) return;

      document.title = getShareMetadata(config).title;

      // Page 1
      const p1Names = document.getElementById('p1CouplesNames');
      if (p1Names && config.coupleNamesZh) p1Names.textContent = config.coupleNamesZh;

      // Page 1 可选双金线宫廷画框
      const page1El = document.querySelector('.page-1');
      const coverGildedFrame = document.getElementById('coverGildedFrame');
      const currentUrlParams = new URLSearchParams(window.location.search);
      const frameParam = currentUrlParams.get('frame');
      if (coverGildedFrame && page1El) {
        if (config.coverSettings?.useGildedFrame || frameParam === '1' || frameParam === 'true') {
          page1El.classList.add('has-gilded-frame');
          coverGildedFrame.style.display = 'block';
        } else {
          page1El.classList.remove('has-gilded-frame');
          coverGildedFrame.style.display = 'none';
        }
      }

      const coverBgPhoto = document.getElementById('coverBgPhoto');
      const coverParam = currentUrlParams.get('cover');

      if (coverParam === 'opt1' && coverBgPhoto) {
        coverBgPhoto.src = coverOption1Url;
      } else if (coverParam === 'opt2' && coverBgPhoto) {
        coverBgPhoto.src = coverOption2Url;
      } else {
        if (coverBgPhoto) {
          coverBgPhoto.src = (config.assets && config.assets.coverBg) || defaultCoverUrl;
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
        const calendarAction = p2Agenda.querySelector('.p2-calendar-wrap');
        p2Agenda.innerHTML = config.schedule.map((item, index) => `
          <div class="p2-agenda-row" style="--item-index: ${index}">
            <span class="p2-agenda-time">${item.time}</span>
            <span class="p2-agenda-event">${item.title || item.event}</span>
          </div>
        `).join('');
        if (calendarAction) p2Agenda.append(calendarAction);
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

    }

    // ==========================================
    // 多屏滑动与手势逻辑
    // ==========================================
    let currentPage = 0;
    const totalPages = 4;
    const swiper = document.getElementById('swiperWrapper');
    const pages = document.querySelectorAll('.page');
    const welcomeGlass = document.getElementById('welcomeGlass');
    const dots = document.querySelectorAll('.nav-dot');
    let isAnimating = false;
    let touchStartY = 0;
    let touchEndY = 0;

    function goToPage(index) {
      if (index < 0 || index >= totalPages || index === currentPage || isAnimating || navigationBlocked()) return;
      isAnimating = true;
      const outgoing = pages[currentPage];
      const incoming = pages[index];
      incoming.style.setProperty('--scene-shift', index > currentPage ? '14px' : '-14px');
      outgoing.classList.add('is-leaving');
      swiper.dataset.transition = 'running';
      currentPage = index;

      pages.forEach((p, idx) => {
        p.classList.toggle('active', idx === currentPage);
        p.inert = idx !== currentPage;
      });
      syncWelcomeGlass();

      dots.forEach((d, idx) => {
        d.classList.toggle('active', idx === currentPage);
        if (idx === currentPage) d.setAttribute('aria-current', 'page');
        else d.removeAttribute('aria-current');
      });

      // 旧页保持不透明底图，入口文字退场；新页叠化结束后释放旧页。
      Promise.allSettled(incoming.getAnimations().map(animation => animation.finished)).then(() => {
        outgoing.classList.remove('is-leaving');
        syncWelcomeGlass();
        swiper.dataset.transition = 'idle';
        isAnimating = false;
      });
    }

    function syncWelcomeGlass() {
      const active = currentPage === 0 && document.body.classList.contains('invitation-open');
      const leaving = pages[0].classList.contains('is-leaving') && welcomeGlass.dataset.state !== 'hidden';
      welcomeGlass.dataset.state = active ? 'active' : leaving ? 'leaving' : 'hidden';
      welcomeGlass.setAttribute('aria-hidden', String(!active));
      welcomeGlass.style.setProperty('--scene-shift', pages[0].style.getPropertyValue('--scene-shift') || '14px');
    }

    function navigationBlocked() {
      return !document.body.classList.contains('invitation-open')
        || !!document.querySelector('.modal-backdrop.open, .wechat-guide-overlay.show');
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
      if (navigationBlocked() || e.target.closest('button, a, input, textarea, [role=button]')) return;
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key)) e.preventDefault();
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

    // URL 参数 page 使用从零开始的页码；开场完成后定位。
    const urlParams = new URLSearchParams(window.location.search);
    const initialPageIndex = Number.parseInt(urlParams.get('page'), 10);

    // ==========================================
    // 背景音乐播放控制与自动播放唤醒
    // ==========================================
    const audio = document.getElementById('bgm');
    const musicBtn = document.getElementById('musicBtn');
    const musicTip = document.getElementById('musicTip');

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

    // ==========================================
    // 全局配置渲染与开场仪式感预加载引擎启动
    // ==========================================
    renderConfigData();

    const rosePetals = new RosePetals(document.getElementById('petalsCanvas'));
    const weddingPreloader = new WeddingPreloader({
      audio,
      audioUrl: config.assets?.bgMusic || new URL('./assets/Close to You-Olivia Ong.mp3', import.meta.url).href,
      petals: rosePetals,
      onEnter: () => {
        document.body.classList.remove('invitation-loading');
        document.body.classList.add('invitation-open');
        swiper.inert = false;
        pages.forEach((page, index) => { page.inert = index !== currentPage; });
        document.getElementById('pageNav').inert = false;
        document.querySelector('.music-player').inert = false;
        if (Number.isInteger(initialPageIndex)) goToPage(initialPageIndex);
        syncWelcomeGlass();
        // play 保留在开启按钮的点击调用链中，使用同一次手势取得播放许可。
        if (audio && audio.paused) {
          audio.play().then(() => {
            musicBtn.classList.add('playing');
            musicTip.classList.add('fade-out');
          }).catch(error => {
            musicTip.classList.remove('fade-out');
            console.warn('背景音乐未开始播放，可点击音乐按钮重试', error);
          });
        }
      }
    });
    weddingPreloader.init();

    // ==========================================
    // 浪漫玫瑰花瓣飘落 Canvas 特效
    // ==========================================
    if (import.meta.env.DEV) {
      window.__petals = rosePetals;
      window.__preloader = weddingPreloader;
    }
    if (import.meta.hot) import.meta.hot.dispose(() => {
      weddingPreloader.destroy();
      rosePetals.destroy();
    });
    document.addEventListener('visibilitychange', () => {
      document.body.classList.toggle('invitation-paused', document.hidden);
    });

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
    const modalTriggers = new WeakMap();
    function openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modalTriggers.set(modal, document.activeElement);
      modal.inert = false;
      modal.classList.add('open');
      modal.querySelector('.modal-close').focus({ preventScroll: true });
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.remove('open');
      modal.inert = true;
      modalTriggers.get(modal)?.focus({ preventScroll: true });
    }

    document.querySelectorAll('.modal-backdrop').forEach(b => {
      b.addEventListener('click', (e) => {
        if (e.target === b) {
          closeModal(b.id);
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      const modal = document.querySelector('.modal-backdrop.open');
      if (event.key === 'Escape' && modal) closeModal(modal.id);
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
    // 微信内由宾客选择外部浏览器；其他浏览器打开日历文件。
    // ==========================================
    function addToCalendar() {
      openModal('calendarModal');
    }

    function handleSystemCalendar() {
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        showWechatGuide();
        return;
      }
      try {
        if (window.location.protocol.startsWith('http')) window.location.assign(weddingCalendarUrl);
        else downloadIcsBlob();
      } catch (error) {
        console.warn('日历文件打开未完成', error);
        showToast('日程链接未打开，请重试或复制婚礼日程');
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
}
