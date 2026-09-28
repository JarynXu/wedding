/** 将设备坐标转换到当前屏幕；CSS 的纵轴向下。 */
export function screenVector(x, y, angle = 0) {
  const radians = angle * Math.PI / 180;
  return { x: x * Math.cos(radians) + y * Math.sin(radians), y: y * Math.cos(radians) - x * Math.sin(radians) };
}

/** 文字反光与花瓣共用一次授权；内嵌活动接收请柬已获授权的读数。 */
export class DeviceTilt {
  constructor({ embedded = false } = {}) {
    this.embedded = embedded;
    this.events = new AbortController();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.listeners = new Set();
    this.sample = null;
    this.permission = typeof window.DeviceOrientationEvent?.requestPermission === 'function' ? 'prompt' : 'granted';
    const options = { signal: this.events.signal };
    document.addEventListener('visibilitychange', () => this.refresh(), options);
    this.motion.addEventListener('change', () => this.refresh(), options);
    window.addEventListener('pageshow', () => this.refresh(), options);
    window.addEventListener('pagehide', () => this.stop(), options);
    if (embedded) window.addEventListener('message', event => {
      if (!this.active || event.origin !== location.origin || event.source !== parent || event.data?.type !== 'wedding-tilt') return;
      this.publish(event.data.sample);
    }, options);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.sample) listener(this.sample);
    return () => this.listeners.delete(listener);
  }

  enter() {
    this.entered = true;
    this.refresh();
    if (!this.embedded && !this.motion.matches && navigator.userActivation?.isActive) this.requestPermission();
  }

  async requestPermission() {
    if (this.permission !== 'prompt' || this.permissionRequested || this.destroyed || !window.isSecureContext) return;
    this.permissionRequested = true;
    try { this.permission = await window.DeviceOrientationEvent.requestPermission(); }
    catch { this.permission = 'denied'; }
    if (!this.destroyed) this.refresh();
  }

  publish(sample) {
    this.sample = sample && Number.isFinite(sample.beta) && Number.isFinite(sample.gamma) && Number.isFinite(sample.angle)
      ? { beta: sample.beta, gamma: sample.gamma, angle: sample.angle } : null;
    for (const listener of this.listeners) listener(this.sample);
  }

  refresh() {
    this.stop();
    if (this.destroyed || !this.entered || document.hidden || this.motion.matches) return;
    this.active = true;
    if (this.embedded || this.permission === 'denied') return;
    this.sensorEvents = new AbortController();
    window.addEventListener('deviceorientation', event => {
      if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      this.publish({ beta: event.beta, gamma: event.gamma, angle: screen.orientation?.angle ?? window.orientation ?? 0 });
    }, { signal: this.sensorEvents.signal, passive: true });
  }

  stop() {
    this.active = false;
    this.sensorEvents?.abort();
    this.sensorEvents = null;
    this.publish(null);
  }

  destroy() { this.destroyed = true; this.stop(); this.events.abort(); this.listeners.clear(); }
}
