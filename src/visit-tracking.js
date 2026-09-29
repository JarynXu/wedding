const visitorKey = 'wedding.visitor.v1';
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const value = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

export function anonymousVisitor({ local = () => window.localStorage, session = () => window.sessionStorage, createId = uuid } = {}) {
  for (const [storage, getStore] of [['local', local], ['session', session]]) {
    try {
      const store = getStore(), saved = store.getItem(visitorKey);
      if (uuidPattern.test(saved || '')) return { visitorId: saved, storage };
      const visitorId = createId(); store.setItem(visitorKey, visitorId);
      return { visitorId, storage };
    } catch { /* 存储被禁用时只在仍可用的范围内记住本次访问。 */ }
  }
  return { visitorId: createId(), storage: 'memory' };
}

/** 一个顶层文档记一次打开；前台心跳只更新时间，不增加次数。 */
export async function trackInvitationVisit(theme) {
  if (window.parent !== window || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') return;
  const identity = navigator.locks?.request
    ? await navigator.locks.request('wedding-visitor', () => anonymousVisitor()).catch(() => anonymousVisitor())
    : anonymousVisitor();
  const visitId = uuid();
  let opened = false, stopped = false, suspended = false, busy = false, timer, failures = 0;
  const active = () => !stopped && !suspended && !document.hidden;
  const schedule = delay => { clearTimeout(timer); if (active()) timer = setTimeout(report, delay); };
  async function report() {
    if (!active() || busy) return;
    busy = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/visits', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ ...identity, visitId, theme, event: opened ? 'ping' : 'open' }) });
      if ([400, 403, 404].includes(response.status)) { stopped = true; return; }
      if (!response.ok) throw new Error('visit-unavailable');
      const result = await response.json();
      if (result.enabled === false) { stopped = true; return; }
      opened = true; failures = 0;
    } catch { failures = Math.min(failures + 1, 4); }
    finally { clearTimeout(timeout); busy = false; schedule(failures ? Math.min(60000, 5000 * 2 ** failures) : 30000); }
  }
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (active()) report(); });
  window.addEventListener('pagehide', () => { suspended = true; clearTimeout(timer); });
  window.addEventListener('pageshow', () => { suspended = false; if (active()) report(); });
  report();
}
