import { publicAssetUrl } from './static-assets.js';
import './fonts.css';
import './shell.css';
import './glass.css';
import './style.css';
import './motion.css';
import './themes/chinese.css';
import './invitation-event.css';
import { FallingPetals } from './petals.js';
import { WeddingPreloader } from './preloader.js';
import { WeddingMusic } from './music.js';
import { MusicContinuity } from './music-continuity.js';
import { InvitationFoil } from './foil.js';
import { DeviceTilt } from './device-tilt.js';
import { InvitationCalendar } from './calendar-layer.js';
import { MusicPlayer } from './music-player.js';
import { WEDDING_CONFIG } from './config.js';
import { getInvitationEvent, daysUntilEvent } from './invitation-event.js';
import { renderInvitationEvent } from './invitation-event-view.js';
import { getCalendarDetails } from './invitation-calendar.js';
import { resolveInvitationTheme } from './invitation-theme.js';
import { applyChineseTheme } from './themes/chinese.js';
import { getShareMetadata } from './share-metadata.js';
import { configureWechatShare } from './wechat-share.js';
import { InvitationGame } from './game-layer.js';
import { Celebration } from './celebration/view.js';
import { trackInvitationVisit } from './visit-tracking.js';

trackInvitationVisit(resolveInvitationTheme(location.search)).catch(() => {});

// 分享配置独立于请柬素材加载，不阻塞开场或音乐。
configureWechatShare(getShareMetadata(WEDDING_CONFIG, location.search), WEDDING_CONFIG.share.wechatSignatureEndpoint).then(state => {
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
}))).then(() => new Promise(resolve => {
  // print 样式切换为 all 后，等待媒体查询进入渲染周期再读取背景和字体清单。
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

stylesReady.then(initializeInvitation).catch(error => {
  window.invitationBootFailed();
  console.error('请柬初始化失败', error);
});

const coverOption1Url = publicAssetUrl('./assets/classic/alternatives/french-clean.jpg');
const coverOption2Url = publicAssetUrl('./assets/classic/alternatives/burgundy-velvet.jpg');
const defaultCoverUrl = publicAssetUrl('./assets/classic/portrait.webp');
const defaultHotelIconUrl = publicAssetUrl('./assets/classic/hotel.svg');
const invitationTheme = resolveInvitationTheme(location.search);
const invitationEvent = getInvitationEvent(WEDDING_CONFIG, location.search);
const calendarUrl = `${import.meta.env.BASE_URL}${invitationEvent.calendarFile}`;

function initializeInvitation() {
// ==========================================
    // 婚礼全局配置引入 (来源于 config.js)
    // ==========================================
    const config = WEDDING_CONFIG;

    // 动态渲染全局配置数据至界面各个组件
    function renderConfigData() {
      if (!config) return;

      document.title = getShareMetadata(config, location.search).title;

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

      if (coverBgPhoto && invitationTheme === 'classic') {
        coverBgPhoto.src = coverParam === 'opt1' ? coverOption1Url : coverParam === 'opt2' ? coverOption2Url : config.assets?.coverBg || defaultCoverUrl;
        document.querySelector('.p3-castle-img').src = defaultHotelIconUrl;
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
    let swipe = null;

    function goToPage(index) {
      if (index < 0 || index >= totalPages || index === currentPage || isAnimating || navigationBlocked()) return;
      isAnimating = true;
      const outgoing = pages[currentPage];
      const incoming = pages[index];
      incoming.style.setProperty('--scene-shift', index > currentPage ? '14px' : '-14px');
      outgoing.classList.add('is-leaving');
      swiper.dataset.transition = 'running';
      currentPage = index;
      rememberInvitationPage();

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
        || !!document.querySelector('.modal-backdrop.open,dialog[open]');
    }

    function nextPage() {
      if (currentPage < totalPages - 1) {
        goToPage(currentPage + 1);
      } else {
        goToPage(0); // 循环至第一屏
      }
    }

    // 请柬接管触摸手势；弹窗位于 #app 之外，继续使用自身的原生滚动。
    const touchSurface = document.getElementById('app');
    const touchEvents = new AbortController();
    touchSurface.addEventListener('touchstart', event => {
      swipe = null;
      if (event.touches.length !== 1 || isAnimating || navigationBlocked()) return;
      const control = event.target.closest('button, a, input, textarea');
      if (control && !control.matches('.scroll-hint')) return;
      const touch = event.touches[0];
      swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, page: currentPage };
    }, { passive: true, signal: touchEvents.signal });

    touchSurface.addEventListener('touchmove', event => {
      if (event.touches.length !== 1) { swipe = null; return; }
      // 兼容未应用 touch-action 的宿主；在移动阶段阻止下拉刷新，而非等待 touchend。
      if (event.cancelable) event.preventDefault();
    }, { passive: false, signal: touchEvents.signal });

    touchSurface.addEventListener('touchend', event => {
      const gesture = swipe;
      swipe = null;
      if (!gesture || event.touches.length || gesture.page !== currentPage) return;
      const touch = [...event.changedTouches].find(point => point.identifier === gesture.id);
      if (!touch) return;
      const vertical = gesture.y - touch.clientY;
      const horizontal = gesture.x - touch.clientX;
      if (Math.abs(vertical) > 45 && Math.abs(vertical) > Math.abs(horizontal)) {
        goToPage(currentPage + (vertical > 0 ? 1 : -1));
      }
    }, { passive: true, signal: touchEvents.signal });
    touchSurface.addEventListener('touchcancel', () => { swipe = null; }, { passive: true, signal: touchEvents.signal });
    if (import.meta.hot) import.meta.hot.dispose(() => touchEvents.abort());

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
    const savedPage = history.state?.invitation?.page;
    const returning = performance.getEntriesByType('navigation')[0]?.type === 'back_forward'
      && history.state?.invitation?.entered === true && Number.isInteger(savedPage) && savedPage >= 0 && savedPage < totalPages;
    const initialPageIndex = returning ? savedPage : Number.parseInt(urlParams.get('page'), 10);

    function rememberInvitationPage() {
      if (document.body.classList.contains('invitation-open')) {
        history.replaceState({ ...history.state, invitation: { ...history.state?.invitation, entered: true, page: currentPage } }, '');
      }
    }

    // ==========================================
    // 背景音乐播放控制与自动播放唤醒
    // ==========================================
    const audio = document.getElementById('bgm');
    const musicBtn = document.getElementById('musicBtn');
    const musicTip = document.getElementById('musicTip');

    const musicPlayer = new MusicPlayer({
      button: musicBtn, tip: musicTip, app: document.getElementById('app'),
      onToggle: () => music.toggle(), onSelect: index => music.playTrack(index),
    });
    const music = new WeddingMusic({ audio, theme: invitationTheme, preferCache: returning, onChange: state => musicPlayer.update(state) });
    const musicContinuity = new MusicContinuity(music);
    const invitationCalendar = new InvitationCalendar(document.getElementById('app'));

    // ==========================================
    // 全局配置渲染与开场仪式感预加载引擎启动
    // ==========================================
    renderConfigData();
    if (invitationTheme === 'chinese') applyChineseTheme();
    const eventView = renderInvitationEvent(config, invitationEvent, location.search);
    const tilt = new DeviceTilt();
    const foil = new InvitationFoil(document.getElementById('app'), { tilt });

    const petals = new FallingPetals(document.getElementById('petalsCanvas'), { theme: invitationTheme, tilt });
    const celebration = new Celebration({ app: document.getElementById('app'), theme: invitationTheme, openModal, closeModal });
    const invitationGame = invitationEvent.allowGames ? new InvitationGame({ entry: document.getElementById('gameEntry'), sealEntry: document.getElementById('gameSeal'), app: document.getElementById('app'), tilt }) : null;
    const weddingPreloader = new WeddingPreloader({
      music,
      petals,
      returning,
      onEnter: () => {
        document.body.classList.remove('invitation-loading');
        document.body.classList.add('invitation-open');
        swiper.inert = false;
        pages.forEach((page, index) => { page.inert = index !== currentPage; });
        document.getElementById('pageNav').inert = false;
        document.querySelector('.music-player').inert = false;
        if (Number.isInteger(initialPageIndex)) goToPage(initialPageIndex);
        rememberInvitationPage();
        syncWelcomeGlass();
        celebration.enter();
        prepareGameEntry();
        // play 保留在开启按钮的点击调用链中，使用同一次手势取得播放许可。
        if (returning) music.restore(history.state?.invitation?.music);
        else music.play();
        foil.enter();
        tilt.enter();
      }
    });
    weddingPreloader.init();
    async function prepareGameEntry() {
      if (!invitationEvent.allowGames) return;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/game/config', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const game = await response.json(); if (!game.enabled) return;
        const entry = document.getElementById('gameEntry');
        const url = new URL('./game.html', location.href);
        for (const key of ['theme', 'side', 'parents']) { const value = new URLSearchParams(location.search).get(key); if (value) url.searchParams.set(key, value); }
        entry.href = url.href; entry.hidden = false;
        if (game.phase !== 'open') { entry.querySelector('span').textContent = '默契榜单';entry.setAttribute('aria-label','查看默契榜');entry.querySelector('small').textContent='查看成绩与兑奖码'; }
        const sealEntry = document.getElementById('gameSeal');
        sealEntry.href = url.href; sealEntry.hidden = false;
        sealEntry.setAttribute('aria-label', game.phase === 'open' ? '通过火漆开启默契挑战' : '通过火漆查看默契榜');
      } catch { /* 可选活动服务未就绪时，邀请、祝福与音乐仍可使用。 */ }
      finally { clearTimeout(timeout); }
    }

    // ==========================================
    // 主题花瓣飘落 Canvas 特效
    // ==========================================
    if (import.meta.env.DEV) {
      window.__petals = petals;
      window.__preloader = weddingPreloader;
    }
    if (import.meta.hot) import.meta.hot.dispose(() => {
      weddingPreloader.destroy();
      musicPlayer.destroy();
      musicContinuity.destroy();
      invitationCalendar.destroy();
      foil.destroy();
      tilt.destroy();
      music.destroy();
      invitationGame?.destroy();
      petals.destroy();
      celebration.destroy();
    });
    document.addEventListener('visibilitychange', () => {
      document.body.classList.toggle('invitation-paused', document.hidden);
    });

    // ==========================================
    // 婚礼倒计时计算器
    // ==========================================
    if (!invitationEvent.schedule) {
      const countdown = document.getElementById('eventCountdown');
      const updateCountdown = () => {
        const days = daysUntilEvent(invitationEvent);
        countdown.textContent = days ? `距回门宴还有 ${days} 天` : '';
      };
      updateCountdown();
      const timer = setInterval(updateCountdown, 60000);
      if (import.meta.hot) import.meta.hot.dispose(() => clearInterval(timer));
    }

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
        if (target.dataset.openModal === 'mapModal') eventView.showVenue(target.dataset.venue);
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
      rememberInvitationPage();
      musicContinuity.remember();
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        const entry = new URL(`${import.meta.env.BASE_URL}calendar.html`, location.href);
        entry.search = new URL(getShareMetadata(config, location.search).url).search;
        entry.searchParams.set('open', '1');
        closeModal('calendarModal');
        invitationCalendar.open(entry);
        return;
      }
      try {
        window.location.assign(calendarUrl);
      } catch (error) {
        console.warn('日历文件打开未完成', error);
        showToast('日程链接未打开，请重试或复制日程');
      }
    }

    function copyCalendarInfo() {
      const text = getCalendarDetails(config, invitationEvent).text;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('日程已复制！可在手机备忘录或日历中粘贴 ✦');
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
      showToast('日程已复制！可在手机备忘录或日历中粘贴 ✦');
    }

}
