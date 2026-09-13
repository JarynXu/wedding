import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from './password.js';

export class AdminAuth {
  constructor(config, { clock = () => Date.now(), store = null } = {}) {
    this.config = config;
    this.clock = clock;
    this.store=store;
    this.attempts = new Map();
    this.username = Buffer.from(config.username, 'utf8');
  }

  async login(username, password, clientKey) {
    const key = clientKey || 'unknown';
    const limit = this.store?await this.store.consumeAttempt(key):this.consumeAttempt(key);
    if (!limit.allowed) return { ok: false, rateLimited: true, retryAfter: limit.retryAfter };
    const sameUsername = typeof username === 'string' && equalBuffer(Buffer.from(username, 'utf8'), this.username);
    const validPassword = await verifyPassword(typeof password === 'string' ? password : '', this.config.passwordHash);
    if (!sameUsername || !validPassword) return { ok: false, rateLimited: false };
    this.attempts.delete(key);
    await this.store?.resetAttempts(key);
    const now = Math.floor(this.clock() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: this.config.username, iat: now, exp: now + this.config.sessionTtlSeconds, nonce: randomBytes(16).toString('base64url') })).toString('base64url');
    return { ok: true, cookieValue: `${payload}.${sign(payload, this.config.sessionSecret)}`, maxAge: this.config.sessionTtlSeconds };
  }

  #readSignedSession(header) {
    const value = readCookie(header, this.config.cookieName);
    const session = decodeSession(value, this.config.sessionSecret);
    if (!session || !equalBuffer(Buffer.from(session.sub, 'utf8'), this.username)) return null;
    const now = Math.floor(this.clock() / 1000);
    if (session.exp <= now || session.iat > now + 60) return null;
    return session;
  }

  async authenticateCookie(header){const session=this.#readSignedSession(header);return session&&(!this.store||!await this.store.revoked(session.nonce))?session:null;}
  async logout(header) { const session=this.#readSignedSession(header);if(session)await this.store?.revoke(session.nonce,session.exp); }

  consumeAttempt(key) {
    const now = this.clock();
    this.pruneAttempts();
    const existing = this.attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      if (!existing && this.attempts.size >= 10000) this.attempts.delete(this.attempts.keys().next().value);
      this.attempts.set(key, { count: 1, resetAt: now + this.config.loginWindowSeconds * 1000 });
      return { allowed: true };
    }
    if (existing.count >= this.config.loginMaxAttempts) return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
    existing.count += 1;
    return { allowed: true };
  }

  pruneAttempts() {
    const now = this.clock();
    if (this.attempts.size > 10000) for (const [key, attempt] of this.attempts) if (attempt.resetAt <= now) this.attempts.delete(key);
  }
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function decodeSession(value, secret) {
  if (typeof value !== 'string') return null;
  const [payload, signature, extra] = value.split('.');
  if (extra || !payload || !signature || payload.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(payload, secret);
  if (!equalBuffer(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session || typeof session !== 'object' || Array.isArray(session) || typeof session.sub !== 'string' || !Number.isSafeInteger(session.iat) || !Number.isSafeInteger(session.exp) || typeof session.nonce !== 'string') return null;
    return session;
  } catch { return null; }
}

function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function equalBuffer(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}
