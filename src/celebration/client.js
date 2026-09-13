/** 浏览器连接拥有 SSE 生命周期；断线游标只来自已收到的事件。 */
export class BlessingsClient {
  constructor({ onSync, onMessage, onState, onReset, generation=0 }) {
    this.handlers = { onSync, onMessage, onState, onReset };this.generation=generation;
    this.cursor = null;
    this.stopped = false;
    this.controllers = new Set();
  }
  async available() {
    const config = await this.request('/config');
    if((config.generation||0)!==this.generation)this.reset(config.generation);
    this.giftRecordIntervalMs = Number.isFinite(config.giftRecordIntervalMs) ? Math.max(1000, config.giftRecordIntervalMs) : 5000;
    this.writingEnabled=config.aiWritingEnabled===true;
    return config.enabled === true;
  }
  connect() {
    if (this.stopped || this.source || document.hidden) return;
    clearTimeout(this.retry);
    if (!window.EventSource) { this.handlers.onState('unsupported'); return; }
    this.handlers.onState('connecting');
    const source = new EventSource(`/api/blessings/stream${this.cursor == null ? '' : `?after=${encodeURIComponent(this.cursor)}`}`);
    this.source = source;
    source.addEventListener('sync', event => {
      const snapshot = JSON.parse(event.data);
      if((snapshot.generation||0)!==this.generation){this.reset(snapshot.generation);return;}
      this.cursor = snapshot.cursor;
      this.handlers.onSync(snapshot);
      this.handlers.onState('connected');
    });
    source.addEventListener('blessing', event => {
      const message = JSON.parse(event.data);
      this.cursor = message.id;
      this.handlers.onMessage(message);
    });
    source.onerror = () => {
      if (this.source !== source) return;
      this.handlers.onState('reconnecting');
      // HTTP 503 等响应会结束 EventSource，不能只等待浏览器的网络重试。
      if (source.readyState === EventSource.CLOSED) {
        source.close(); this.source = null;
        this.retry = setTimeout(() => this.connect(), 3000);
      }
    };
  }
  reset(generation){this.generation=generation;this.stopped=true;this.pause();this.handlers.onReset?.(generation);}
  pause() { clearTimeout(this.retry); this.source?.close(); this.source = null; }
  destroy() { this.stopped = true; this.pause(); for (const controller of this.controllers) controller.abort(); this.controllers.clear(); }
  history(before = null) { return this.request(`/history${before ? `?before=${encodeURIComponent(before)}` : ''}`); }
  send(message) { return this.request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) }); }
  polish(message) { return this.request('/polish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)}); }
  async request(path, options = {}) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), path==='/polish'?20000:12000);
    try {
      const response = await fetch(`/api/blessings${path}`, { ...options, signal: controller.signal, cache: 'no-store' });
      let body;
      try { body = await response.json(); } catch { throw new Error('祝福服务暂时无法连接，请稍后重试'); }
      if (!response.ok) {
        const error = new Error(body.message || '祝福服务暂时无法连接，请稍后重试');
        error.status = response.status;error.code=body.error;
        if(body.error==='ROOM_RESET')this.available().catch(()=>{});
        error.retryAfter = Number(response.headers.get('Retry-After')) || 0;
        throw error;
      }
      return body;
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
}
