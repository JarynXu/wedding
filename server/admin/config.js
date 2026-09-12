import { parsePasswordHash } from './password.js';

/** 管理后台只从服务端环境读取凭据，缺省时保持未配置状态。 */
export function readAdminConfig(env = process.env) {
  if (env.ADMIN_ENABLED && !['true', 'false'].includes(env.ADMIN_ENABLED)) throw new Error('ADMIN_ENABLED 须为 true 或 false');
  if (env.ADMIN_ENABLED === 'false') return null;
  const configured = env.ADMIN_ENABLED === 'true' || ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET'].some(key => env[key] != null && env[key] !== '');
  if (!configured) return null;
  if (typeof env.ADMIN_USERNAME !== 'string' || !/^[^\u0000-\u0020\u007f]{1,64}$/u.test(env.ADMIN_USERNAME)) throw new Error('ADMIN_USERNAME 须为 1–64 位可见字符');
  if (typeof env.ADMIN_PASSWORD_HASH !== 'string') throw new Error('请配置 ADMIN_PASSWORD_HASH');
  parsePasswordHash(env.ADMIN_PASSWORD_HASH);
  if (typeof env.ADMIN_SESSION_SECRET !== 'string' || env.ADMIN_SESSION_SECRET.length < 32) throw new Error('ADMIN_SESSION_SECRET 须为至少 32 字符的随机值');
  return {
    username: env.ADMIN_USERNAME,
    passwordHash: env.ADMIN_PASSWORD_HASH,
    sessionSecret: Buffer.from(env.ADMIN_SESSION_SECRET, 'utf8'),
    sessionTtlSeconds: integer(env.ADMIN_SESSION_TTL_SECONDS, 8 * 60 * 60, 300, 7 * 24 * 60 * 60),
    loginWindowSeconds: integer(env.ADMIN_LOGIN_WINDOW_SECONDS, 15 * 60, 60, 24 * 60 * 60),
    loginMaxAttempts: integer(env.ADMIN_LOGIN_MAX_ATTEMPTS, 5, 1, 20),
    cookieSecure: boolean(env.ADMIN_COOKIE_SECURE, env.NODE_ENV === 'production'),
    cookieName: 'admin_session',
  };
}

function boolean(value, fallback) {
  if (value == null || value === '') return fallback;
  if (!['true', 'false'].includes(value)) throw new Error('ADMIN_COOKIE_SECURE 须为 true 或 false');
  return value === 'true';
}

function integer(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`管理后台配置整数须在 ${minimum}–${maximum} 之间`);
  return number;
}
