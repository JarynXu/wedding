/** 入口的就绪条件由实际图片、字体和完整音乐文件共同决定。 */
export class WeddingPreloader {
  constructor({ music, petals, onEnter }) {
    this.music = music;
    this.petals = petals;
    this.onEnter = onEnter;
    this.overlay = document.getElementById('preloaderOverlay');
    this.enterButton = document.getElementById('btnEnterInvitation');
    this.retryButton = document.getElementById('preloaderRetry');
    this.status = document.getElementById('preloaderStatus');
    this.note = document.getElementById('preloaderLoadNote');
    this.resources = [];
    this.controllers = new Set();
    this.state = 'loading';
    this.onEnterClick = () => this.enter();
    this.onRetryClick = () => window.location.reload();
  }

  init() {
    this.setState('loading');
    this.enterButton.disabled = true;
    document.getElementById('swiperWrapper').inert = true;
    document.getElementById('pageNav').inert = true;
    document.querySelector('.music-player').inert = true;
    this.enterButton.addEventListener('click', this.onEnterClick);
    this.retryButton.addEventListener('click', this.onRetryClick);

    const images = this.collectImages();
    this.resources = [
      ...images.map(({ url, element }) => ({ kind: 'image', load: signal => this.loadImage(url, element, signal) })),
      { kind: 'image', load: signal => abortable(this.petals.start(), signal) },
      { kind: 'font', load: signal => this.loadFonts(signal) },
      { kind: 'music', load: (signal, progress) => this.music.prepare(signal, progress) },
    ].map(resource => ({ ...resource, state: 'loading', progress: 0 }));
    this.updateProgress();
    Promise.all(this.resources.map(resource => this.prepare(resource))).then(() => {
      if (this.state === 'disposed') return;
      if (this.resources.some(resource => resource.state !== 'ready')) {
        this.showFailure();
        return;
      }
      this.setState('ready');
      this.enterButton.disabled = false;
      this.overlay.classList.add('ready');
      document.getElementById('preloaderActionArea').classList.add('visible');
      this.note.textContent = '';
      // 开发预览可自动打开；生产入口始终等待全部资源，并由宾客点击。
      if (import.meta.env.DEV && new URLSearchParams(location.search).get('nopreloader') === '1') this.enter();
    });
  }

  destroy() {
    this.setState('disposed');
    for (const controller of this.controllers) controller.abort();
    this.enterButton.removeEventListener('click', this.onEnterClick);
    this.retryButton.removeEventListener('click', this.onRetryClick);
  }

  collectImages() {
    const urls = new Map();
    // 从页面消费者读取资源，新增 CSS 背景或 img 时不需要维护第二份清单。
    for (const element of document.body.querySelectorAll('*')) {
      if (element instanceof HTMLImageElement && (element.currentSrc || element.src)) {
        const url = element.currentSrc || element.src;
        const record = urls.get(url) || { url, element: [] };
        record.element.push(element);
        urls.set(url, record);
      }
      for (const pseudo of [null, '::before', '::after']) {
        const background = getComputedStyle(element, pseudo).backgroundImage;
        for (const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
          const url = new URL(match[1], location.href).href;
          if (!urls.has(url)) urls.set(url, { url, element: [] });
        }
      }
    }
    return [...urls.values()];
  }

  async prepare(resource) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      resource.value = await resource.load(controller.signal, progress => {
        if (resource.state !== 'loading' || controller.signal.aborted) return;
        resource.progress = Math.min(0.99, progress);
        this.updateProgress();
      });
      resource.state = 'ready';
      resource.progress = 1;
      if (this.resources.filter(item => item.kind === 'image').every(item => item.state === 'ready')) this.overlay.classList.add('art-ready');
    } catch (error) {
      resource.state = 'error';
      console.error(`请柬${resource.kind}资源准备失败`, error);
      if (this.state !== 'disposed') this.showFailure();
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
      this.updateProgress();
    }
  }

  async loadImage(url, elements, signal) {
    if (elements.length) return abortable(Promise.all(elements.map(image => image.decode())), signal);
    const image = new Image();
    image.src = url;
    await abortable(image.decode(), signal);
    return image;
  }

  async loadFonts(signal) {
    const text = document.body.textContent;
    // 可变字体加载一个字重即可取得同一文件内的全部字重。
    const specs = [...new Set([...document.fonts].map(face => `${face.style} ${face.weight.split(' ')[0]} 16px ${face.family}`))];
    if (!specs.length) throw new Error('请柬字体未注册');
    await abortable(Promise.all(specs.map(async spec => {
      const faces = await document.fonts.load(spec, text);
      if (!faces.length || faces.some(face => face.status !== 'loaded')) throw new Error(`字体未就绪：${spec}`);
    })), signal);
    await abortable(document.fonts.ready, signal);
  }

  updateProgress() {
    if (this.state === 'disposed') return;
    const complete = this.resources.every(resource => resource.state === 'ready');
    const progress = this.resources.reduce((sum, resource) => sum + resource.progress, 0) / this.resources.length;
    const percent = complete ? 100 : Math.min(99, Math.floor(progress * 100));
    document.getElementById('preloaderBarFill').style.transform = `scaleX(${percent / 100})`;
    document.getElementById('preloaderPercent').textContent = `${percent}%`;
    document.getElementById('preloaderProgressSection').setAttribute('aria-valuenow', String(percent));
    if (this.state === 'error') return;
    this.status.textContent = complete ? '照片、音乐与字体已就绪'
      : percent < 35 ? '正在装点浪漫殿堂...'
        : percent < 75 ? '正在调校礼堂音律...' : '即将开启婚礼华章...';
  }

  showFailure() {
    this.setState('error');
    this.status.textContent = '素材尚未准备完成';
    this.note.textContent = '部分素材加载失败，请检查网络后重试';
    this.retryButton.hidden = false;
    this.enterButton.disabled = true;
  }

  enter() {
    if (this.state !== 'ready' || this.resources.some(resource => resource.state !== 'ready')) return;
    this.setState('entered');
    this.enterButton.disabled = true;
    this.overlay.inert = true;
    this.overlay.classList.add('fade-out');
    this.onEnter();
    const hide = () => {
      this.overlay.hidden = true;
      document.querySelector('.page.active [tabindex="-1"]')?.focus({ preventScroll: true });
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) hide();
    else Promise.allSettled(this.overlay.getAnimations({ subtree: true }).map(animation => animation.finished)).then(hide);
  }

  setState(state) {
    this.state = state;
    this.overlay.dataset.state = state;
    this.overlay.setAttribute('aria-busy', String(state === 'loading'));
  }
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('素材准备超时'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
