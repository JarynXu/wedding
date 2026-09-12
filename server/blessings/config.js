import { WEDDING_CONFIG } from '../../src/config.js';

/** 仅服务端读取数据库凭据。缺省不开启，显式错误配置在启动时报告。 */
export function readBlessingsConfig(env = process.env) {
  if (env.BLESSINGS_ENABLED && !['true', 'false'].includes(env.BLESSINGS_ENABLED)) throw new Error('BLESSINGS_ENABLED 须为 true 或 false');
  if (env.BLESSINGS_ENABLED === 'false' || (!env.BLESSINGS_DATABASE_URL && env.BLESSINGS_ENABLED !== 'true')) return null;
  let url;
  try { url = new URL(env.BLESSINGS_DATABASE_URL); } catch { throw new Error('请配置有效的 BLESSINGS_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/' || url.search || url.hash) throw new Error('数据库地址须为 PostgreSQL URI，TLS 通过 BLESSINGS_DB_SSL 配置，不在 URI 中添加参数');
  const secret = env.BLESSINGS_RATE_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('BLESSINGS_RATE_SECRET 须为至少 32 字符的随机值');
  const ssl = env.BLESSINGS_DB_SSL ?? 'true';
  if (!['true', 'false'].includes(ssl)) throw new Error('BLESSINGS_DB_SSL 须为 true 或 false');
  const room = env.BLESSINGS_ROOM || 'wedding-20261017';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) throw new Error('BLESSINGS_ROOM 须为 1–64 位字母、数字、下划线或连字符');
  const origin = new URL(env.BLESSINGS_PUBLIC_ORIGIN || WEDDING_CONFIG.share.siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('BLESSINGS_PUBLIC_ORIGIN 须为本站 HTTP(S) 地址');
  const clientIpHeader = env.BLESSINGS_CLIENT_IP_HEADER || '';
  if (clientIpHeader && !['x-original-forwarded-for', 'x-forwarded-for', 'x-real-ip'].includes(clientIpHeader)) throw new Error('BLESSINGS_CLIENT_IP_HEADER 不在支持范围内');
  return {
    room, secret, origin: origin.origin, clientIpHeader,
    maxStreams: integer(env.BLESSINGS_MAX_STREAMS, 500, 1, 3000),
    clientLimit: integer(env.BLESSINGS_CLIENT_LIMIT, 12, 1, 120),
    networkLimit: integer(env.BLESSINGS_NETWORK_LIMIT, 600, 1, 10000),
    minIntervalMs: integer(env.BLESSINGS_MIN_INTERVAL_MS, 3000, 0, 60000),
    database: {
      connectionString: url.href,
      ssl: ssl === 'true' ? { rejectUnauthorized: true, ...(env.BLESSINGS_DB_CA_PEM ? { ca: env.BLESSINGS_DB_CA_PEM.replaceAll('\\n', '\n') } : {}) } : false,
      max: integer(env.BLESSINGS_DB_POOL_SIZE, 5, 1, 30),
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 8000,
      application_name: 'wedding-blessings', keepAlive: true,
    },
  };
}
function integer(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`祝福配置整数须在 ${minimum}–${maximum} 之间`);
  return number;
}
