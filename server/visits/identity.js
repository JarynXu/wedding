import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const cookieName = 'wedding_visit';

export function visitorIdentity(config, body, cookie = '') {
  const digest = value => createHmac('sha256', config.secret).update(`visits:${config.room}:${value}`).digest('hex');
  const sign = value => createHmac('sha256', config.secret).update(`visit-cookie:${config.room}:${value}`).digest('base64url');
  const saved = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const match = /^([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/.exec(saved || '');
  const prior = match && timingSafeEqual(Buffer.from(match[2]), Buffer.from(sign(match[1]))) ? match[1] : null;
  // 可用的长期存储是当前身份来源；清除它后不会从其他存储恢复旧编号。
  const hash = body.storage === 'local' ? digest(body.visitorId) : prior || digest(body.visitorId || randomUUID());
  const value = `${hash}.${sign(hash)}`;
  return { hash, cookie: `${cookieName}=${value}; Path=/api/visits; HttpOnly; SameSite=Lax; Max-Age=15552000${config.origin.startsWith('https:') ? '; Secure' : ''}` };
}

export function browserCategory(agent = '') {
  const browser = /MicroMessenger/i.test(agent) ? 'wechat' : /Edg(?:e|A|iOS)?\//i.test(agent) ? 'edge'
    : /Firefox|FxiOS/i.test(agent) ? 'firefox' : /Chrome|CriOS|Chromium/i.test(agent) ? 'chrome' : /Safari/i.test(agent) ? 'safari' : 'other';
  const device = /iPhone|iPad|iPod/i.test(agent) ? 'ios' : /Android/i.test(agent) ? 'android' : /Windows|Macintosh|Linux/i.test(agent) ? 'desktop' : 'other';
  return { browser, device };
}

export const isAutomated = agent => /bot\b|spider|crawler|preview|headless|curl\/|wget\/|python-requests/i.test(agent);

export function validVisit(body) {
  return body && !Array.isArray(body) && isUuid(body.visitId) && isUuid(body.visitorId)
    && ['open', 'ping'].includes(body.event) && ['classic', 'chinese'].includes(body.theme)
    && ['local', 'session', 'memory'].includes(body.storage);
}
