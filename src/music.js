import { publicAssetUrl } from './static-assets.js';

/** 当前主题歌单、完整音频 Blob 与播放器由同一对象持有。 */
export class WeddingMusic {
  constructor({ audio, theme, preferCache = false, onChange = () => {} }) {
    this.audio = audio;
    this.theme = theme;
    this.preferCache = preferCache;
    this.onChange = onChange;
    this.tracks = [];
    this.index = 0;
    this.operation = 0;
    this.prepared = false;
    this.destroyed = false;
    this.pendingPlay = false;
    this.hasPlayed = false;
    this.nextOnPlay = false;
    this.error = null;
    audio.loop = false;
    this.listeners = {
      playing: () => { if (!audio.paused) { this.hasPlayed = true; this.error = null; } this.notify(); },
      pause: () => { if (audio.paused && this.hasPlayed && !audio.ended) this.nextOnPlay = true; this.notify(); },
      ended: () => { if (this.prepared && !this.destroyed) { this.nextOnPlay = true; this.play(); } },
      error: () => { if (this.prepared) { this.operation++; this.pendingPlay = false; this.error = new Error('音乐播放失败'); this.notify(); } },
    };
    for (const [event, listener] of Object.entries(this.listeners)) audio.addEventListener(event, listener);
  }

  async prepare(signal, progress) {
    try {
      const tracks = await loadPlaylist(this.theme, signal);
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index];
        const blob = await download(track.url, signal, value => progress((index + value * 0.95) / tracks.length), this.preferCache);
        if (signal.aborted || this.destroyed) throw new Error('音乐准备已取消');
        const objectUrl = URL.createObjectURL(blob);
        // 先登记资源归属；解码失败或取消时仍可释放。
        this.tracks.push({ ...track, objectUrl });
        await validateAudio(blob, objectUrl, signal);
        if (signal.aborted || this.destroyed) throw new Error('音乐准备已取消');
        progress((index + 1) / tracks.length);
      }
      this.select(0);
      this.prepared = true;
      this.notify();
    } catch (error) {
      for (const track of this.tracks) URL.revokeObjectURL(track.objectUrl);
      this.tracks = [];
      throw error;
    }
  }

  toggle() {
    if (!this.prepared || this.destroyed) return;
    if (this.pendingPlay || !this.audio.paused) this.pause();
    else this.play();
  }

  /** 点选曲目覆盖暂停后的顺序切歌；当前曲目从原位置继续播放。 */
  playTrack(index) {
    if (!this.prepared || this.destroyed) return Promise.resolve(false);
    if (!Number.isInteger(index) || index < 0 || index >= this.tracks.length) throw new RangeError('曲目序号无效');
    if (index !== this.index) this.select(index);
    this.nextOnPlay = false;
    return this.play();
  }

  pause() {
    this.nextOnPlay = this.hasPlayed || !this.audio.paused;
    this.operation++;
    this.pendingPlay = false;
    this.audio.pause();
    this.notify();
  }

  /** play 在点击调用栈内执行；播放被拒后重试当前曲目，不再跳过一首。 */
  play() {
    if (!this.prepared || this.destroyed) return Promise.resolve(false);
    if (this.nextOnPlay) this.select((this.index + 1) % this.tracks.length);
    this.nextOnPlay = false;
    this.error = null;
    const operation = ++this.operation;
    this.pendingPlay = true;
    let started;
    try { started = this.audio.play(); }
    catch (error) { started = Promise.reject(error); }
    this.notify();
    return Promise.resolve(started).then(() => {
      if (operation !== this.operation || this.destroyed) return false;
      this.pendingPlay = false;
      this.hasPlayed = !this.audio.paused;
      this.notify();
      return this.hasPlayed;
    }, error => {
      if (operation !== this.operation || this.destroyed) return false;
      this.pendingPlay = false;
      this.nextOnPlay = false;
      this.error = error;
      this.notify();
      return false;
    });
  }

  select(index) {
    this.index = index;
    this.hasPlayed = false;
    this.nextOnPlay = false;
    this.audio.src = this.tracks[index].objectUrl;
    this.audio.dataset.trackIndex = String(index);
    this.audio.dataset.trackTitle = this.tracks[index].title;
    this.audio.load();
  }

  destroy() {
    this.destroyed = true;
    this.operation++;
    for (const [event, listener] of Object.entries(this.listeners)) this.audio.removeEventListener(event, listener);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    for (const track of this.tracks) URL.revokeObjectURL(track.objectUrl);
    this.tracks = [];
  }

  notify() {
    if (!this.destroyed) this.onChange({
      playing: !this.audio.paused, pending: this.pendingPlay, error: this.error,
      title: this.tracks[this.index]?.title || '', nextOnPlay: this.nextOnPlay,
      prepared: this.prepared, index: this.index, tracks: this.tracks.map(({ title }, index) => ({ index, title })),
    });
  }
}

async function loadPlaylist(theme, signal) {
  const directory = new URL(publicAssetUrl(`./music/${theme}/`), location.href);
  const response = await fetch(new URL('playlist.json', directory), { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`歌单加载失败：HTTP ${response.status}`);
  const playlist = await response.json();
  if (!Array.isArray(playlist.tracks)) throw new Error('歌单格式无效');
  if (!playlist.tracks.length && theme === 'chinese' && playlist.fallback === 'classic') return loadPlaylist('classic', signal);
  if (!playlist.tracks.length) throw new Error('歌单没有音乐');
  return playlist.tracks.map(track => {
    if (!track || typeof track.file !== 'string' || /[\/\\\x00-\x1f]/.test(track.file) || !/\.(mp3|m4a|aac|ogg|wav)$/i.test(track.file)) throw new Error('曲目文件名无效');
    const url = new URL(encodeURIComponent(track.file), directory);
    if (track.version) url.searchParams.set('v', track.version);
    return { url: url.href, title: typeof track.title === 'string' ? track.title : track.file };
  });
}

async function download(url, signal, progress, preferCache) {
  // 歌单的内容版本随音频字节变化；返回请柬时可复用同版本的完整响应。
  const cached = preferCache && new URL(url).searchParams.has('v');
  let response = await fetch(url, { signal, cache: cached ? 'force-cache' : 'default' });
  // 失败响应不能成为后续重试的缓存依据。
  if (!response.ok && cached) {
    await response.body?.cancel();
    response = await fetch(url, { signal, cache: 'reload' });
  }
  if (!response.ok) throw new Error(`音乐下载失败：HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length'));
  const reader = response.body?.getReader();
  if (!reader) { const blob = await response.blob(); if (!blob.size) throw new Error('音乐文件为空'); return blob; }
  const chunks = []; let received = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    chunks.push(value); received += value.length;
    if (total > 0) progress(Math.min(1, received / total));
  }
  if (!received) throw new Error('音乐文件为空');
  return new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' });
}

async function validateAudio(blob, url, signal) {
  if (signal.aborted) throw new Error('音乐准备已取消');
  const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Decoder) {
    const decoder = new Decoder(1, 1, 22050);
    const decoded = await abortable(decoder.decodeAudioData(await blob.arrayBuffer()), signal);
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('音乐文件无法解码');
  } else {
    const probe = new Audio();
    try {
      await new Promise((resolve, reject) => {
        const finish = error => { probe.removeEventListener('loadedmetadata', ready); probe.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
        const ready = () => { if (probe.readyState >= 1) finish(Number.isFinite(probe.duration) && probe.duration > 0 ? null : new Error('音乐没有有效时长')); };
        const failed = () => finish(new Error('浏览器无法读取音乐文件'));
        const aborted = () => finish(new Error('音乐准备已取消'));
        probe.addEventListener('loadedmetadata', ready); probe.addEventListener('error', failed); signal.addEventListener('abort', aborted, { once: true });
        probe.preload = 'metadata'; probe.src = url; probe.load(); if (signal.aborted) aborted(); else ready();
      });
    } finally { probe.removeAttribute('src'); probe.load(); }
  }
  if (signal.aborted) throw new Error('音乐准备已取消');
}

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('音乐准备已取消'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
