import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };

test('生产请柬的加载与页面切换', { timeout: 90000 }, async suite => {
  let failure = null;
  let holdMusic = false;
  let corruptMusic = false;
  let releaseMusic = null;
  let holdStatic = false;
  const releaseStatic = [];
  const requests = [];
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (path.relative(dist, filename).startsWith('..')) { response.writeHead(403).end(); return; }
    requests.push(pathname);
    try {
      if (failure && pathname.includes(failure)) { response.writeHead(503).end('test failure'); return; }
      let body = await readFile(filename);
      const extension = path.extname(filename);
      if (extension === '.mp3' && corruptMusic) body = Buffer.from('invalid audio');
      response.writeHead(200, { 'content-type': contentTypes[extension] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
      if (holdStatic && extension !== '.html') {
        releaseStatic.push(() => response.end(body));
        return;
      }
      if (extension === '.mp3' && holdMusic) {
        response.write(body.subarray(0, 131072));
        releaseMusic = () => response.end(body.subarray(131072));
      } else response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
  const blocked = async () => {
    assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), false);
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('invitation-open')), false);
    assert.notEqual(await page.locator('#preloaderPercent').innerText(), '100%');
  };

  try {
    await suite.test('仅收到 HTML，阻塞外部样式、脚本和图片仍有完整首屏', async () => {
      holdStatic = true;
      try {
        await page.goto(url, { waitUntil: 'commit' });
        await page.locator('#preloaderOverlay').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.fonts.check('16px "Welcome Serif"') && document.fonts.check('16px "Welcome Script"'));
        await page.waitForTimeout(300);
        const initial = await page.evaluate(() => ({
          state: document.getElementById('preloaderOverlay').dataset.state,
          background: getComputedStyle(document.querySelector('.welcome-background')).backgroundImage.startsWith('url("data:image/webp'),
          emblem: document.querySelector('.welcome-emblem svg').getBoundingClientRect().width,
          contentWidth: document.querySelector('.preloader-content').getBoundingClientRect().width,
          hiddenPages: getComputedStyle(document.querySelector('#swiperWrapper')).visibility,
          externalFonts: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.woff2')).length,
        }));
        assert.equal(initial.state, 'booting');
        assert.equal(await page.locator('#preloaderStatus').innerText(), '正在装点浪漫殿堂...');
        assert.equal(initial.background, true);
        assert.ok(initial.emblem > 0);
        assert.match(await page.title(), /徐旨越.*赵荣蓉/);
        assert.doesNotMatch(await page.locator('#preloaderOverlay').innerText(), /徐旨越|赵荣蓉|徐|赵|2026|10[./月]17|11:58|东海|晶都/);
        assert.ok(initial.contentWidth > 200 && initial.contentWidth < 390);
        assert.equal(initial.hiddenPages, 'hidden');
        assert.equal(initial.externalFonts, 0);
        if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, 'html-only-first-frame.png') });
      } finally {
        holdStatic = false;
        releaseStatic.splice(0).forEach(release => release());
      }
      await ready();
    });

    for (const [label, pattern] of [['主样式', '.css'], ['主脚本', '.js']]) {
      await suite.test(`${label}失败时首屏保持样式并提供重试`, async () => {
        failure = pattern;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
        await blocked();
        assert.equal(await page.locator('#preloaderRetry').isVisible(), true);
        assert.equal(await page.locator('.welcome-background').evaluate(element => getComputedStyle(element).backgroundImage.startsWith('url("data:image/webp')), true);
        failure = null;
        await page.locator('#preloaderRetry').click();
        await ready();
      });
    }

    await suite.test('音乐响应只有首段时，超过旧超时仍保持等待', async () => {
      holdMusic = true;
      await page.goto(url + '?nopreloader=1', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3800);
      assert.ok(releaseMusic, '测试服务器已发送音乐首段');
      await blocked();
      assert.equal(await page.locator('#preloaderStatus').innerText(), '即将开启婚礼华章...');
      await page.locator('.welcome-message').click();
      await page.keyboard.press('Space');
      await page.mouse.wheel(0, 650);
      await blocked();
      assert.equal(await page.locator('#bgm').getAttribute('src'), null);
      holdMusic = false;
      releaseMusic();
      await ready();
      assert.equal(await page.locator('#preloaderPercent').innerText(), '100%');
      assert.match(await page.locator('#bgm').getAttribute('src'), /^blob:/);
      assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), true);
      assert.equal(await page.locator('#preloaderOverlay').isVisible(), true, '生产环境不通过查询参数跳过入口');
    });

    await suite.test('加载完成后断网，四页、字体和音乐仍可使用', async () => {
      await page.context().setOffline(true);
      try {
      await page.locator('#btnEnterInvitation').click();
      await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.getElementById('bgm').paused);
      await page.waitForFunction(() => document.getElementById('bgm').currentTime > 0.05);
      for (let index = 1; index < 4; index++) {
        await page.mouse.wheel(0, 650);
        await page.waitForFunction(index => document.querySelector('.page.active').dataset.index === String(index) && document.getElementById('swiperWrapper').dataset.transition === 'idle', index);
        assert.equal(await page.locator('.page.active').getAttribute('data-index'), String(index));
      }
      assert.equal(await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)), true);
      assert.equal(await page.evaluate(() => [...document.fonts].some(face => face.status === 'error' || face.status === 'loading')), false);
      } finally { await page.context().setOffline(false); }
    });

    for (const [label, pattern] of [['图片', '/classic/location.jpg'], ['字体', 'RWmMoK'], ['音乐', '.mp3']]) {
      await suite.test(`${label}失败时禁止进入，重试恢复`, async () => {
        failure = pattern;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
        await blocked();
        assert.equal(await page.locator('#preloaderRetry').isVisible(), true);
        failure = null;
        await page.locator('#preloaderRetry').click();
        await ready();
        assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), true);
      });
    }

    await suite.test('音乐返回 200 但文件损坏时禁止进入', async () => {
      corruptMusic = true;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
      await blocked();
      corruptMusic = false;
    });

    await suite.test('图片解码失败时禁止进入', async () => {
      await page.route('**/assets/classic/portrait.webp', route => route.fulfill({ contentType: 'image/webp', body: 'invalid image' }));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('#preloaderOverlay[data-state="error"]').waitFor();
      await blocked();
      await page.unroute('**/assets/classic/portrait.webp');
    });

    await suite.test('减少动态效果仍须等待素材，字体全部来自本站', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await ready();
      assert.equal(await page.locator('#petalsCanvas').isVisible(), false);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('fonts.googleapis.com') || entry.name.includes('fonts.gstatic.com'))), false);
      assert.ok(requests.some(value => value.endsWith('.woff2')));
      assert.deepEqual(errors, []);
    });

    await suite.test('正文按阅读顺序揭晓，时间页保留日历入口', async () => {
      assert.match(await page.title(), /徐旨越.*赵荣蓉/);
      assert.doesNotMatch(await page.locator('#preloaderOverlay').innerText(), /徐|赵|2026|10[./月]17|11:58|东海|晶都/);
      assert.equal(await page.locator('#preloaderOverlay img').count(), 0);
      assert.doesNotMatch(await page.locator('#preloaderOverlay').innerText(), /婚礼请柬/);
      assert.equal(await page.locator('.btn-enter-text').innerText(), '开启请柬');
      assert.equal(await page.locator('link[rel="icon"]').getAttribute('type'), 'image/png');
      await page.locator('#btnEnterInvitation').click();
      await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
      assert.match(await page.title(), /徐旨越.*赵荣蓉/);
      assert.equal(await page.locator('.page-1').getAttribute('aria-owns'), 'welcomeGlass');
      assert.equal(await page.locator('#welcomeGlass').getAttribute('aria-hidden'), 'false');
      const cover = await page.locator('.page-1').innerText() + await page.locator('#welcomeGlass').innerText();
      assert.match(cover, /徐旨越.*赵荣蓉/);
      assert.match(cover, /Welcome/);
      assert.match(cover, /TO OUR WEDDING/);
      assert.match(cover, /TOGETHER FOREVER/);
      assert.equal(await page.locator('.cover-heading .cover-names').count(), 1);
      assert.ok(await page.locator('.cover-names').evaluate(element => element.getBoundingClientRect().bottom < document.getElementById('app').getBoundingClientRect().top + document.getElementById('app').clientHeight * 0.2));
      assert.doesNotMatch(cover, /2026|10[./月]17|11:58|东海|晶都|国际厅/);
      assert.ok(await page.locator('#coverBgPhoto').evaluate(image => image.complete && image.naturalWidth > 0));
      await page.locator('.nav-dot[data-index="1"]').click();
      const time = await page.locator('.page-2').innerText();
      assert.match(time, /2026/);
      assert.match(time, /10\/17/);
      assert.match(time, /11:58/);
      assert.doesNotMatch(time, /东海|晶都|国际厅/);
      assert.equal(await page.locator('.page-2 [data-action="add-calendar"]').count(), 1);
      await page.locator('.page-2 [data-action="add-calendar"]').click();
      await page.locator('#calendarModal.open').waitFor();
      assert.match(await page.locator('#calEventLoc').innerText(), /东海嘉臣国际大酒店/);
      await page.keyboard.press('Escape');
      await page.locator('.nav-dot[data-index="2"]').click();
      assert.match(await page.locator('.page-3').innerText(), /东海嘉臣国际大酒店/);
      assert.match(await page.locator('.page-3').innerText(), /晶都大道99号/);
      await page.locator('.nav-dot[data-index="3"]').click();
      const summary = await page.locator('.page-4').innerText();
      assert.match(summary, /徐旨越.*赵荣蓉/);
      assert.match(summary, /2026年10月17日 11:58/);
      assert.match(summary, /东海嘉臣国际大酒店/);
      assert.match(summary, /晶都大道99号/);
      assert.equal(await page.locator('.page-4 [data-action="add-calendar"]').count(), 0);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await ready();
    });

    await suite.test('加载页、迎宾牌、日历及地图的玻璃面板柔化后方画布', async () => {
      try {
        await assertFrostedCanvas(page, '.preloader-content');
        await page.locator('#btnEnterInvitation').click();
        await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        await assertFrostedCanvas(page, '#welcomeGlass');
        await page.locator('.nav-dot[data-index="1"]').click();
        await page.locator('.calendar-button').click();
        await assertFrostedCanvas(page, '#calendarModal .modal-card');
        await page.keyboard.press('Escape');
        await page.locator('.nav-dot[data-index="2"]').click();
        await page.locator('.p3-map-btn').click();
        await assertFrostedCanvas(page, '#mapModal .modal-card');
        await page.keyboard.press('Escape');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const before = await page.locator('#petalsCanvas').evaluate(canvas => canvas.toDataURL());
        await page.waitForTimeout(200);
        assert.notEqual(await page.locator('#petalsCanvas').evaluate(canvas => canvas.toDataURL()), before);
      } finally {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await ready();
      }
    });

    await suite.test('各页前进、返回及跳页使用连续叠化，旧底图不露白', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('#btnEnterInvitation').click();
      await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        window.journeyCanvas = document.getElementById('petalsCanvas');
        window.journeyAudio = document.getElementById('bgm').src;
      });
      let current = 0;
      for (const target of [1, 2, 3, 2, 1, 0, 2, 0, 3, 1, 3, 0]) {
        await page.locator(`.nav-dot[data-index="${target}"]`).click();
        await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'running');
        await page.evaluate(() => {
          window.transitionAnimations = [...document.querySelectorAll('.page.active, .page.is-leaving, #welcomeGlass')].flatMap(el => el.getAnimations({ subtree: true })).filter(animation => animation.effect.getTiming().iterations !== Infinity);
          window.transitionAnimations.forEach(animation => animation.pause());
        });
        for (const progress of [0.25, 0.5, 0.75]) {
          const sample = await page.evaluate(progress => {
            const incoming = document.querySelector('.page.active');
            const outgoing = document.querySelector('.page.is-leaving');
            const scene = incoming.getAnimations().find(animation => animation.animationName === 'scene-arrive');
            window.transitionAnimations.forEach(animation => { animation.currentTime = scene.effect.getTiming().duration * progress; });
            const incomingStyle = getComputedStyle(incoming);
            const outgoingStyle = getComputedStyle(outgoing);
            const app = document.getElementById('app').getBoundingClientRect();
            const old = outgoing.getBoundingClientRect();
            return {
              incomingOpacity: Number(incomingStyle.opacity),
              outgoingOpacity: Number(outgoingStyle.opacity),
              oldCoversViewport: old.top <= app.top + 1 && old.bottom >= app.bottom - 1 && old.left <= app.left + 1 && old.right >= app.right - 1,
              incomingShift: Math.abs(incoming.getBoundingClientRect().top - app.top),
              filter: incomingStyle.filter,
              active: incoming.dataset.index,
              outgoingInert: outgoing.inert,
              activeCount: document.querySelectorAll('.page.active').length,
              sameCanvas: window.journeyCanvas === document.getElementById('petalsCanvas'),
              sameAudio: window.journeyAudio === document.getElementById('bgm').src,
            };
          }, progress);
          assert.ok(sample.incomingOpacity > 0 && sample.incomingOpacity < 1);
          assert.equal(sample.outgoingOpacity, 1);
          assert.equal(sample.oldCoversViewport, true);
          assert.ok(sample.incomingShift <= 14);
          assert.equal(sample.filter, 'none');
          assert.equal(sample.active, String(target));
          assert.equal(sample.activeCount, 1);
          assert.equal(sample.outgoingInert, true);
          assert.equal(sample.sameCanvas && sample.sameAudio, true);
          if (process.env.WEDDING_QA_DIR && progress === 0.5 && target === current + 1) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, `transition-${current}-${target}-midpoint.png`) });
        }
        await page.evaluate(() => window.transitionAnimations.forEach(animation => animation.play()));
        await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
        assert.equal(await page.locator('.page.is-leaving').count(), 0);
        assert.equal(await page.locator('#welcomeGlass').isVisible(), target === 0);
        assert.equal(await page.locator('#welcomeGlass').getAttribute('aria-hidden'), String(target !== 0));
        current = target;
      }
      // 动态切换偏好取消动画后，旧页必须释放。
      await page.locator('.nav-dot[data-index="1"]').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
      assert.equal(await page.locator('.page.is-leaving').count(), 0);
      assert.equal(await page.locator('.page.active').getAttribute('data-index'), '1');
      assert.deepEqual(errors, []);
    });

    await suite.test('安卓触摸可往返四页，拦截下拉默认行为并保留弹窗和日历页滚动', async () => {
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 MicroMessenger/8.0' });
      const input = await mobile.context().newCDPSession(mobile);
      let navigations = 0;
      mobile.on('framenavigated', frame => { if (frame === mobile.mainFrame()) navigations++; });
      const idle = () => mobile.waitForFunction(() => document.getElementById('swiperWrapper').dataset.transition === 'idle');
      const drag = async (from, to, ending = 'touchEnd', fingers = 1) => {
        const points = (x, y) => Array.from({ length: fingers }, (_, id) => ({ x: x + id * 80, y, id }));
        await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from.x, from.y) });
        for (let step = 1; step <= 8; step++) {
          await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8) });
          await mobile.waitForTimeout(16);
        }
        await input.send('Input.dispatchTouchEvent', { type: ending, touchPoints: [] });
      };
      try {
        await mobile.goto(url);
        await mobile.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        await mobile.locator('#btnEnterInvitation').tap();
        await mobile.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
        await mobile.evaluate(() => {
          window.touchMoves = [];
          window.swipeButtonClicks = 0;
          document.addEventListener('touchmove', event => {
            if (event.target.closest('#app')) window.touchMoves.push({ prevented: event.defaultPrevented, cancelable: event.cancelable, trusted: event.isTrusted });
          }, { passive: true });
          document.addEventListener('click', event => {
            if (event.target.closest('.scroll-hint')) window.swipeButtonClicks++;
          });
        });
        let current = 0;
        for (const target of [1, 2, 3, 2, 1, 0]) {
          if (current === 0 && target === 1) {
            const button = await mobile.locator('.page-1 .scroll-hint').boundingBox();
            await drag({ x: button.x + button.width / 2, y: button.y + button.height / 2 }, { x: button.x + button.width / 2, y: 450 });
          } else await drag({ x: 70, y: target > current ? 590 : 260 }, { x: 70, y: target > current ? 260 : 590 });
          await mobile.waitForFunction(target => document.querySelector('.page.active').dataset.index === String(target), target, { timeout: 3000 });
          await idle();
          const viewport = await mobile.evaluate(() => ({ top: document.getElementById('app').getBoundingClientRect().top, scroll: scrollY, visualTop: visualViewport.offsetTop }));
          assert.deepEqual(viewport, { top: 0, scroll: 0, visualTop: 0 });
          current = target;
        }
        const moves = await mobile.evaluate(() => window.touchMoves);
        assert.ok(moves.length > 0 && moves.every(move => move.trusted));
        assert.ok(moves.some(move => move.cancelable));
        assert.ok(moves.filter(move => move.cancelable).every(move => move.prevented), '在移动阶段取消浏览器默认下拉行为');
        assert.equal(await mobile.evaluate(() => window.swipeButtonClicks), 0, '从翻页按钮开始上滑不额外产生点击');
        assert.equal(await mobile.locator('html').evaluate(element => getComputedStyle(element).overscrollBehaviorY), 'none');
        assert.equal(await mobile.locator('#app').evaluate(element => getComputedStyle(element).touchAction), 'none');
        await drag({ x: 70, y: 260 }, { x: 70, y: 590 });
        assert.equal(await mobile.locator('.page.active').getAttribute('data-index'), '0', '第一页下拉不刷新或越界');

        await mobile.locator('.nav-dot[data-index="1"]').tap();
        await mobile.waitForFunction(() => document.querySelector('.page.active').dataset.index === '1');
        await idle();
        await drag({ x: 70, y: 360 }, { x: 300, y: 450 });
        assert.equal(await mobile.locator('.page.active').getAttribute('data-index'), '1', '横向为主的手势不翻页');
        await drag({ x: 70, y: 260 }, { x: 70, y: 590 }, 'touchCancel');
        assert.equal(await mobile.locator('.page.active').getAttribute('data-index'), '1', '取消手势不翻页');
        await drag({ x: 70, y: 260 }, { x: 70, y: 590 }, 'touchEnd', 2);
        assert.equal(await mobile.locator('.page.active').getAttribute('data-index'), '1', '多指手势不翻页');

        await mobile.locator('.nav-dot[data-index="2"]').tap();
        // 先确认点击已切到目标页，避免旧页的 idle 让尺寸切换提前发生。
        await mobile.waitForFunction(() => document.querySelector('.page.active').dataset.index === '2');
        await idle();
        await mobile.setViewportSize({ width: 360, height: 520 });
        await mobile.locator('.p3-map-btn').tap();
        const card = mobile.locator('#mapModal .modal-card');
        await card.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
        assert.ok(await card.evaluate(element => element.scrollHeight > element.clientHeight), '小屏弹窗具有可滚动内容');
        const rect = await card.boundingBox();
        await drag({ x: rect.x + 24, y: rect.y + rect.height - 65 }, { x: rect.x + 24, y: rect.y + 100 });
        await mobile.waitForFunction(() => document.querySelector('#mapModal .modal-card').scrollTop > 0);
        assert.equal(await mobile.locator('.page.active').getAttribute('data-index'), '2', '弹窗滚动不翻页');
        assert.equal(navigations, 1, '手势不刷新或重载请柬');
        await mobile.locator('[data-close-modal="mapModal"]').tap();
        await drag({ x: 70, y: 150 }, { x: 70, y: 380 });
        await mobile.waitForFunction(() => document.querySelector('.page.active').dataset.index === '1');
        await idle();

        await mobile.goto(url + 'calendar.html');
        await drag({ x: 65, y: 380 }, { x: 65, y: 140 });
        await mobile.waitForFunction(() => scrollY > 0);
        assert.equal(await mobile.locator('#calendarOpenBrowser').count(), 0, '已撤掉浏览器唤起试用入口');
      } finally { await input.detach(); await mobile.close(); }
    });

    await suite.test('手机等待播放手势时显示开启请柬，一次点击启动原始音乐', async () => {
      const mobile = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
      try {
        await mobile.addInitScript(() => {
          const nativePlay = HTMLMediaElement.prototype.play;
          const nativeLoad = HTMLMediaElement.prototype.load;
          const state = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
          let activated = false;
          window.mobileAudioCalls = [];
          // 模拟收到完整文件、尚未得到播放手势时不报告 canplay 的手机播放器。
          Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
            get() { return this.id === 'bgm' && !activated ? 0 : state.get.call(this); },
          });
          HTMLMediaElement.prototype.load = function () {
            if (this.id !== 'bgm' || activated) nativeLoad.call(this);
          };
          HTMLMediaElement.prototype.play = function () {
            if (this.id === 'bgm') {
              window.mobileAudioCalls.push({ gesture: navigator.userActivation.isActive, source: this.src, muted: this.muted });
              activated = true;
              nativeLoad.call(this);
            }
            return nativePlay.call(this);
          };
        });
        await mobile.goto(url);
        await mobile.locator('#preloaderOverlay[data-state="ready"]').waitFor({ timeout: 10000 });
        assert.equal(await mobile.locator('#preloaderPercent').innerText(), '100%');
        assert.equal(await mobile.locator('#bgm').evaluate(audio => audio.readyState), 0);
        assert.equal(await mobile.locator('#btnEnterInvitation').isVisible(), true);
        assert.doesNotMatch(await mobile.locator('#preloaderOverlay').innerText(), /点按准备音乐/);
        assert.deepEqual(await mobile.evaluate(() => window.mobileAudioCalls), []);
        await mobile.locator('#btnEnterInvitation').tap();
        await mobile.waitForFunction(() => document.getElementById('bgm').currentTime > 0.05);
        const calls = await mobile.evaluate(() => window.mobileAudioCalls);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].gesture, true);
        assert.equal(calls[0].muted, false);
        assert.match(calls[0].source, /^blob:/);
      } finally { await mobile.close(); }
    });

    await suite.test('缺少离线音频解码接口时校验元数据，损坏音乐仍禁止进入', async () => {
      const fallback = await browser.newPage();
      try {
        await fallback.addInitScript(() => {
          window.OfflineAudioContext = undefined;
          window.webkitOfflineAudioContext = undefined;
        });
        await fallback.goto(url);
        await fallback.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        assert.ok(await fallback.locator('#bgm').evaluate(audio => audio.duration > 0));
        corruptMusic = true;
        await fallback.reload();
        await fallback.locator('#preloaderOverlay[data-state="error"]').waitFor();
        assert.equal(await fallback.locator('#btnEnterInvitation').isEnabled(), false);
        assert.equal(await fallback.locator('#preloaderRetry').isVisible(), true);
      } finally { corruptMusic = false; await fallback.close(); }
    });

    await suite.test('Welcome 在手机尺寸变化和底部安全区下为完整翻页按钮留出间距', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url);
      await ready();
      await page.locator('#btnEnterInvitation').click();
      await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
      for (const [width, height] of [[320, 568], [375, 667], [390, 844], [414, 896], [360, 640], [375, 620], [320, 740], [768, 1024], [1440, 1000]]) {
        await page.setViewportSize({ width, height });
        for (const safeBottom of [14, 34]) {
          await page.locator('#app').evaluate((app, bottom) => app.style.setProperty('--page-next-bottom', `${bottom}px`), safeBottom);
          const boxes = await page.evaluate(() => {
            const panel = document.getElementById('welcomeGlass').getBoundingClientRect();
            const button = document.querySelector('.page-1 .scroll-hint').getBoundingClientRect();
            const app = document.getElementById('app').getBoundingClientRect();
            const target = document.elementFromPoint(button.x + button.width / 2, button.y + 2);
            return { gap: button.top - panel.bottom, buttonHeight: button.height, bottom: app.bottom - button.bottom, fits: panel.left >= app.left && panel.right <= app.right, hittable: !!target.closest('.scroll-hint') };
          });
          assert.ok(boxes.gap >= 9.5, `${width}×${height}, inset ${safeBottom}: gap ${boxes.gap}`);
          assert.ok(boxes.buttonHeight >= 44 && boxes.bottom >= safeBottom - 0.5);
          assert.equal(boxes.fits && boxes.hittable, true);
        }
      }
      await page.locator('#app').evaluate(app => app.style.removeProperty('--page-next-bottom'));
      await page.setViewportSize({ width: 375, height: 667 });
      if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, 'mobile-welcome-clearance.png') });
      await page.locator('.page-1 .scroll-hint').click();
      assert.equal(await page.locator('.page.active').getAttribute('data-index'), '1');
    });

    await suite.test('前三页无文字箭头保持可点击，动效增强不改变点击区域', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url);
      await ready();
      await page.locator('#btnEnterInvitation').click();
      await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
      const clickTargets = ['.scroll-arrow', '.scroll-arrow svg', '.scroll-arrow'];
      for (let index = 0; index < clickTargets.length; index++) {
        const button = page.locator('.page.active .scroll-hint');
        assert.equal((await button.innerText()).trim(), '');
        const fits = await button.evaluate(button => {
          const rect = button.getBoundingClientRect();
          return rect.height >= 44 && rect.width >= 44 && [...button.querySelectorAll('.scroll-arrow')].every(element => {
            const inner = element.getBoundingClientRect();
            return inner.left >= rect.left && inner.right <= rect.right && inner.top >= rect.top && inner.bottom <= rect.bottom;
          });
        });
        assert.equal(fits, true);
        if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, `next-page-hint-${index + 1}.png`) });
        await button.locator(clickTargets[index]).click();
        assert.equal(await page.locator('.page.active').getAttribute('data-index'), String(index + 1));
      }
      assert.equal(await page.locator('.page-4 .scroll-hint').count(), 0);
      await page.locator('.nav-dot[data-index="0"]').click();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.page.active').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      const motion = await page.locator('.page.active .scroll-hint').evaluate(button => {
        const animations = button.getAnimations({ subtree: true }).filter(animation => animation.effect.getTiming().iterations === Infinity);
        const sample = time => {
          animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
          const ring = getComputedStyle(button, '::before');
          return {
            button: button.getBoundingClientRect().toJSON(),
            arrowY: new DOMMatrix(getComputedStyle(button.querySelector('svg')).transform).m42,
            ringScale: new DOMMatrix(ring.transform).m11,
            ringOpacity: Number(ring.opacity),
          };
        };
        const early = sample(350);
        const later = sample(800);
        animations.forEach(animation => animation.play());
        return { early, later, count: animations.length };
      });
      assert.ok(motion.count >= 3);
      assert.deepEqual(motion.early.button, motion.later.button);
      assert.ok(Math.abs(motion.early.arrowY - motion.later.arrowY) >= 2);
      assert.ok(motion.later.ringScale > motion.early.ringScale);
      assert.ok(motion.early.ringOpacity > 0);
    });

    for (const { name, userAgent, guide } of [
      { name: 'iPhone 微信', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0', guide: true },
      { name: 'Android 微信', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile MicroMessenger/8.0', guide: true },
      { name: 'iPhone 外部浏览器', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', guide: false },
      { name: 'Android 外部浏览器', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', guide: false },
    ]) await suite.test(`${name} 使用对应的日历入口`, async () => {
      const mobile = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', userAgent });
      try {
        let calendarRequests = 0;
        mobile.on('request', request => { if (new URL(request.url()).pathname === '/wedding.ics') calendarRequests++; });
        // 日历文件由宿主处理，测试只核对入口调用，不模拟系统导入成功。
        await mobile.route('**/wedding.ics', route => route.fulfill({ status: 204 }));
        await mobile.goto(url);
        await mobile.locator('#preloaderOverlay[data-state="ready"]').waitFor();
        await mobile.locator('#btnEnterInvitation').tap();
        await mobile.locator('.nav-dot[data-index="1"]').tap();
        await mobile.locator('.calendar-button').tap();
        assert.doesNotMatch(await mobile.locator('#calendarModal').innerText(), /微信|默认浏览器/);
        assert.equal(await mobile.locator('#calendarHelp').count(), 0);
        if (process.env.WEDDING_QA_DIR) await mobile.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, 'mobile-calendar.png') });
        if (guide) {
          const handoffRequests = [];
          mobile.on('request', request => handoffRequests.push(new URL(request.url()).pathname));
          await mobile.locator('[data-action="system-calendar"]').tap();
          await mobile.waitForURL('**/calendar.html?open=1');
          assert.match(await mobile.locator('.browser-guide').innerText(), /在默认浏览器打开/);
          assert.equal(await mobile.locator('#calendarOpen').isVisible(), false);
          assert.equal(await mobile.locator('#preloaderOverlay').count(), 0);
          assert.equal(calendarRequests, 0, '微信内不发起日历文件下载');
          assert.deepEqual(handoffRequests, ['/calendar.html']);
          for (const width of [320, 375, 390, 414]) {
            await mobile.setViewportSize({ width, height: 667 });
            const geometry = await mobile.evaluate(() => {
              const guide = document.querySelector('.browser-guide');
              const card = document.querySelector('.calendar-card');
              const rect = guide.getBoundingClientRect();
              const before = { top: card.getBoundingClientRect().top, height: document.documentElement.scrollHeight };
              const overlapsContent = [...document.querySelectorAll('h1, .couple, .calendar-emblem, #calendarDetails, #calendarCopyLink')].some(element => {
                const target = element.getBoundingClientRect();
                return rect.left < target.right && rect.right > target.left && rect.top < target.bottom && rect.bottom > target.top;
              });
              guide.style.display = 'none';
              const after = { top: card.getBoundingClientRect().top, height: document.documentElement.scrollHeight };
              guide.style.removeProperty('display');
              return { before, after, overlapsContent, rightGap: innerWidth - rect.right, top: rect.top, width: rect.width };
            });
            assert.deepEqual(geometry.before, geometry.after, '指引显示与隐藏均不改变正文位置或页面高度');
            assert.equal(geometry.overlapsContent, false);
            assert.ok(geometry.rightGap >= 9 && geometry.rightGap <= 11 && geometry.top >= 10 && geometry.width <= 190);
          }
          await mobile.setViewportSize({ width: 375, height: 667 });
          if (process.env.WEDDING_QA_DIR) await mobile.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, 'calendar-handoff-wechat.png') });

          // 外部浏览器使用全新上下文，不能依赖微信缓存或 localStorage 恢复流程。
          const external = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
          try {
            const requests = [];
            external.on('request', request => requests.push(new URL(request.url()).pathname));
            await external.route('**/wedding.ics', route => route.fulfill({ status: 204 }));
            const opened = external.waitForResponse('**/wedding.ics');
            await external.goto(mobile.url(), { waitUntil: 'commit' });
            await opened;
            assert.equal(await external.locator('#calendarOpen').isVisible(), true);
            assert.equal(await external.locator('.browser-guide').isVisible(), false);
            assert.equal(await external.locator('#preloaderOverlay').count(), 0);
            assert.deepEqual(requests, ['/calendar.html', '/wedding.ics'], '不加载请柬脚本、字体、照片或音乐');
            if (process.env.WEDDING_QA_DIR) await external.screenshot({ path: path.join(process.env.WEDDING_QA_DIR, 'calendar-handoff-browser.png') });
            const retry = external.waitForResponse('**/wedding.ics');
            await external.locator('#calendarOpen').tap();
            await retry;
            await external.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
            assert.equal(requests.filter(path => path === '/wedding.ics').length, 2, '手动重试一次，从日历返回时不循环打开');
          } finally { await external.close(); }
        } else {
          const request = mobile.waitForResponse('**/wedding.ics');
          await mobile.locator('[data-action="system-calendar"]').tap();
          await request;
          assert.equal(calendarRequests, 1);
          assert.equal(await mobile.locator('#wechatGuideOverlay').count(), 0);
        }
      } finally { await mobile.close(); }
    });

    await suite.test('日历直达页无脚本时保留原生添加链接，手机布局可滚动且不溢出', async () => {
      const simple = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 320, height: 568 } });
      try {
        let requests = 0;
        await simple.route('**/wedding.ics', route => { requests++; return route.fulfill({ status: 204 }); });
        await simple.goto(url + 'calendar.html?open=1');
        assert.equal(requests, 0);
        assert.equal(await simple.locator('#calendarCopyDetails').isVisible(), false);
        for (const [width, height] of [[320, 568], [375, 667], [390, 844], [768, 1024]]) {
          await simple.setViewportSize({ width, height });
          const fits = await simple.evaluate(() => ({
            horizontal: document.documentElement.scrollWidth <= innerWidth,
            button: document.getElementById('calendarOpen').getBoundingClientRect().height,
          }));
          assert.equal(fits.horizontal, true);
          assert.ok(fits.button >= 44);
        }
        const opened = simple.waitForResponse('**/wedding.ics');
        await simple.locator('#calendarOpen').click();
        await opened;
        assert.equal(requests, 1);
      } finally { await simple.close(); }
    });

    await suite.test('日历直达页复制可继续添加的地址与当前日程，失败不报告已复制', async () => {
      const copyPage = await browser.newPage({ userAgent: 'Mozilla/5.0 MicroMessenger/8.0', viewport: { width: 375, height: 667 } });
      try {
        await copyPage.addInitScript(() => {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedCalendarText = text; } } });
        });
        await copyPage.goto(url + 'calendar.html?open=1&revision=test#calendar');
        await copyPage.locator('#calendarCopyLink').click();
        assert.equal(await copyPage.evaluate(() => window.copiedCalendarText), url + 'calendar.html?open=1');
        await copyPage.locator('#calendarCopyDetails').click();
        const text = await copyPage.evaluate(() => window.copiedCalendarText);
        assert.match(text, /徐旨越.*赵荣蓉/);
        assert.match(text, /2026年10月17日/);
        assert.match(text, /11:30/);
        assert.match(text, /晶都大道99号/);
        await copyPage.evaluate(() => {
          navigator.clipboard.writeText = async () => { throw new Error('test denied'); };
          document.execCommand = () => { throw new Error('test denied'); };
        });
        await copyPage.locator('#calendarCopyDetails').click();
        assert.match(await copyPage.locator('#calendarFeedback').innerText(), /未能复制/);
      } finally { await copyPage.close(); }
    });
  } finally {
    releaseMusic?.();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

async function assertFrostedCanvas(page, selector) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const probe = await page.evaluate(selector => {
    const glass = document.querySelector(selector);
    const canvas = document.getElementById('petalsCanvas');
    const rect = glass.getBoundingClientRect();
    const app = document.getElementById('app').getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    canvas.style.setProperty('display', 'block', 'important');
    const dpr = canvas.width / app.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, app.width, app.height);
    const x = Math.round(rect.left - app.left + 18);
    const bottom = Math.round(rect.bottom - app.top);
    for (let column = 0; column < 96; column++) {
      ctx.fillStyle = Math.floor(column / 4) % 2 ? '#f9edda' : '#650d29';
      ctx.fillRect(x + column, bottom - 28, 1, 50);
    }
    let paintLayer = glass;
    while (getComputedStyle(paintLayer).zIndex === 'auto' && paintLayer.parentElement) paintLayer = paintLayer.parentElement;
    return { x: x + app.left, y: bottom + app.top, glassLayer: Number(getComputedStyle(paintLayer).zIndex), canvasLayer: Number(getComputedStyle(canvas).zIndex), filter: getComputedStyle(glass).backdropFilter, textFilter: getComputedStyle(glass.querySelector('.cover-welcome-copy, .modal-title, .welcome-script')).filter };
  }, selector);
  assert.ok(probe.glassLayer > probe.canvasLayer);
  assert.match(probe.filter, /blur/);
  assert.equal(probe.textFilter, 'none');
  const frosted = await page.screenshot();
  await page.locator(selector).evaluate(glass => {
    glass.style.backdropFilter = 'none';
    glass.style.webkitBackdropFilter = 'none';
  });
  const clear = await page.screenshot();
  const contrast = await page.evaluate(async ({ frosted, clear, x, y }) => {
    async function energy(base64, row) {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(x + 8, row, 80, 1).data;
      let result = 0;
      for (let i = 4; i < data.length; i += 4) result += Math.abs(data[i] - data[i - 4]) + Math.abs(data[i + 1] - data[i - 3]) + Math.abs(data[i + 2] - data[i - 2]);
      return { energy: result, pixels: [...data] };
    }
    return { insideBlur: await energy(frosted, y - 12), insideClear: await energy(clear, y - 12), outsideBlur: await energy(frosted, y + 10), outsideClear: await energy(clear, y + 10) };
  }, { frosted: frosted.toString('base64'), clear: clear.toString('base64'), x: probe.x, y: probe.y });
  assert.ok(contrast.insideClear.energy > 1000, '已知条纹输入必须具有清晰边缘');
  assert.ok(contrast.insideBlur.energy < contrast.insideClear.energy * 0.75, '玻璃须降低牌内图像边缘对比度');
  // 背景模糊会改变合成层，牌外阴影允许两级 8 位通道取整误差。
  const outsideDifference = Math.max(...contrast.outsideBlur.pixels.map((value, index) => Math.abs(value - contrast.outsideClear.pixels[index])));
  assert.ok(outsideDifference <= 2, `牌外图像不得被玻璃模糊：最大通道差 ${outsideDifference}`);
  await page.locator(selector).evaluate(glass => {
    glass.style.removeProperty('backdrop-filter');
    glass.style.removeProperty('-webkit-backdrop-filter');
  });
  await page.locator('#petalsCanvas').evaluate(canvas => canvas.style.removeProperty('display'));
}
