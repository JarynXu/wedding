/** 页面暂离不改变宾客的播放选择；历史记录只持有可重新构造的曲目和进度。 */
export class MusicContinuity {
  constructor(music, host = window) {
    this.music = music;
    this.host = host;
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const resume = () => { if (!this.departed && !host.document.hidden) music.resume(); };
    host.addEventListener('pagehide', () => { this.departed = true; this.remember(); }, options);
    host.addEventListener('pageshow', () => { this.departed = false; resume(); }, options);
    host.addEventListener('focus', resume, options);
    host.document.addEventListener('visibilitychange', () => {
      if (host.document.hidden) this.remember(); else resume();
    }, options);
    // 自动恢复被宿主限制时，下一次操作重新取得播放许可；音乐控件仍由自己的操作负责。
    for (const name of ['pointerdown', 'keydown']) host.document.addEventListener(name, event => {
      if (!event.target.closest?.('.music-player, .music-playlist')) resume();
    }, { ...options, capture: true });
    host.document.addEventListener('WeixinJSBridgeReady', resume, options);
  }

  remember() {
    const { history } = this.host;
    if (!this.music.prepared || !history.state?.invitation?.entered) return;
    history.replaceState({ ...history.state, invitation: { ...history.state.invitation, music: this.music.snapshot() } }, '');
  }

  destroy() { this.events.abort(); }
}
