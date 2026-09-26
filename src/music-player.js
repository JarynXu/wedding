const HOLD_DELAY_MS = 500;
const DRAG_THRESHOLD_PX = 10;

/** 播放器界面拥有手势、歌单窗口和焦点；播放状态与曲目资源由 WeddingMusic 提供。 */
export class MusicPlayer {
  constructor({ button, tip, app, onToggle, onSelect }) {
    Object.assign(this, { button, tip, app, onToggle, onSelect });
    this.events = new AbortController();
    this.trackButtons = [];
    this.suppressClick = false;
    this.createPlaylist();
    const options = { signal: this.events.signal };
    const capture = { ...options, capture: true };

    document.addEventListener('pointerdown', event => {
      if (this.press && this.press.id !== event.pointerId) { this.finishPress(true); return; }
      this.suppressClick = false;
    }, capture);
    document.addEventListener('click', event => {
      // 长按后的兼容 click 可能落在窗口背景上，须在分发前消费。
      if (!this.suppressClick || event.detail === 0) return;
      this.suppressClick = false;
      event.preventDefault(); event.stopImmediatePropagation();
    }, capture);
    button.addEventListener('pointerdown', event => this.startPress(event), options);
    document.addEventListener('pointermove', event => {
      if (this.press?.id === event.pointerId && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > DRAG_THRESHOLD_PX) this.finishPress(true);
    }, capture);
    document.addEventListener('pointerup', event => { if (this.press?.id === event.pointerId) this.finishPress(false); }, capture);
    document.addEventListener('pointercancel', event => { if (this.press?.id === event.pointerId) this.finishPress(true); }, capture);
    button.addEventListener('lostpointercapture', () => this.finishPress(true), options);
    button.addEventListener('click', event => { event.stopPropagation(); this.onToggle(); }, options);
    button.addEventListener('contextmenu', event => {
      event.preventDefault(); this.finishPress(true); this.suppressClick = true; this.open();
    }, options);
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault(); this.open();
    }, options);
    window.addEventListener('blur', () => this.finishPress(true), options);
    window.addEventListener('pagehide', () => { this.finishPress(true); this.dialog.close(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.finishPress(true); this.dialog.close(); } }, options);
    for (const host of [window, window.visualViewport].filter(Boolean)) host.addEventListener('resize', () => this.fit(), options);
    window.visualViewport?.addEventListener('scroll', () => this.fit(), options);
  }

  update(state) {
    if (this.destroyed) return;
    this.state = state;
    const { playing, pending, title, nextOnPlay, tracks, index, error } = state;
    const action = playing ? '暂停音乐' : nextOnPlay ? '播放下一首' : '播放音乐';
    this.button.classList.toggle('playing', playing);
    this.button.setAttribute('aria-label', action);
    this.button.title = `${action}${title ? ` · ${title}` : ''}`;
    this.tip.textContent = nextOnPlay ? '点击播放下一首' : '点击播放音乐';
    this.tip.classList.toggle('fade-out', this.dialog.open || playing);

    if (tracks.length !== this.trackButtons.length || tracks.some((track, position) => this.trackButtons[position].querySelector('.music-track-title').textContent !== track.title)) {
      this.list.replaceChildren();
      this.trackButtons = tracks.map(track => {
        const item = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.className = 'music-track'; button.dataset.trackIndex = String(track.index);
        const number = document.createElement('span'); number.className = 'music-track-number'; number.textContent = String(track.index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.className = 'music-track-title'; name.textContent = track.title;
        const status = document.createElement('span'); status.className = 'music-track-state';
        button.append(number, name, status); item.append(button); this.list.append(item);
        return button;
      });
    }
    this.count.textContent = `${tracks.length} 首 · 顺序播放`;
    const currentStatus = error ? '未播放' : pending ? '切换中' : playing ? '播放中' : '已暂停';
    this.trackButtons.forEach((button, position) => {
      const current = position === index;
      if (current) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
      button.querySelector('.music-track-state').textContent = current ? currentStatus : '';
    });
    this.feedback.hidden = !error;
    this.feedback.textContent = error ? '未能播放，请再点一次曲目。' : '';
  }

  open() {
    if (!this.state?.prepared || this.dialog.open || this.destroyed) return;
    this.dialog.showModal();
    this.button.setAttribute('aria-expanded', 'true');
    this.tip.classList.add('fade-out');
    this.fit();
    this.trackButtons[this.state.index]?.focus({ preventScroll: true });
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    this.finishPress(true);
    this.dialog.remove();
    this.button.setAttribute('aria-expanded', 'false');
  }

  createPlaylist() {
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'musicPlaylist'; this.dialog.className = 'music-playlist glass-surface';
    this.dialog.setAttribute('aria-labelledby', 'musicPlaylistTitle');
    this.dialog.innerHTML = '<div class="music-playlist-heading"><div><h2 id="musicPlaylistTitle">婚礼歌单</h2><p class="music-playlist-count"></p></div><button class="music-playlist-close" type="button" aria-label="关闭歌单">×</button></div><ol class="music-playlist-tracks" aria-label="选择播放曲目"></ol><p class="music-playlist-feedback" role="status" hidden></p>';
    document.body.append(this.dialog);
    this.list = this.dialog.querySelector('.music-playlist-tracks');
    this.count = this.dialog.querySelector('.music-playlist-count');
    this.feedback = this.dialog.querySelector('.music-playlist-feedback');
    const options = { signal: this.events.signal };
    this.dialog.querySelector('.music-playlist-close').addEventListener('click', () => this.dialog.close(), options);
    this.list.addEventListener('click', event => {
      const track = event.target.closest('[data-track-index]');
      if (track) this.onSelect(Number(track.dataset.trackIndex));
    }, options);
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.dialog.close();
    }, options);
    this.dialog.addEventListener('close', () => {
      this.button.setAttribute('aria-expanded', 'false');
      if (this.state) this.update(this.state);
      if (!document.hidden) this.button.focus({ preventScroll: true });
    }, options);
  }

  startPress(event) {
    if (event.button !== 0 || !event.isPrimary || !this.state?.prepared) return;
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, opened: false };
    this.button.setPointerCapture(event.pointerId);
    this.holdTimer = setTimeout(() => {
      if (!this.press || document.hidden) return;
      this.press.opened = true; this.suppressClick = true;
      this.open();
    }, HOLD_DELAY_MS);
  }

  finishPress(cancelled) {
    clearTimeout(this.holdTimer);
    const press = this.press; this.press = null;
    if (!press) return;
    if (cancelled || press.opened) this.suppressClick = true;
    if (this.button.hasPointerCapture(press.id)) this.button.releasePointerCapture(press.id);
  }

  fit() {
    if (!this.dialog.open) return;
    const app = this.app.getBoundingClientRect(), button = this.button.getBoundingClientRect(), viewport = window.visualViewport;
    const leftEdge = Math.max(app.left, viewport?.offsetLeft || 0) + 12;
    const rightEdge = Math.min(app.right, (viewport?.offsetLeft || 0) + (viewport?.width || innerWidth)) - 12;
    const topEdge = Math.max(app.top, viewport?.offsetTop || 0) + 12;
    const bottomEdge = Math.min(app.bottom, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)) - 12;
    const width = Math.min(304, rightEdge - leftEdge);
    const top = Math.max(topEdge, Math.min(button.bottom + 12, bottomEdge - 160));
    Object.assign(this.dialog.style, { width: `${width}px`, left: `${Math.max(leftEdge, Math.min(button.right - width, rightEdge - width))}px`, top: `${top}px`, maxHeight: `${bottomEdge - top}px` });
  }
}
