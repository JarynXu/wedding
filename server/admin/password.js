import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 32;
const MIN_N = 16384;
const MAX_N = 65536;
const MIN_R = 8;
const MAX_R = 16;
const MIN_P = 1;
const MAX_P = 4;
const MIN_SALT_LENGTH = 16;
const MAX_SALT_LENGTH = 64;

/** 管理员凭据使用带随机盐的 scrypt 编码，不保存可逆密码。 */
export function parsePasswordHash(encoded) {
  if (typeof encoded !== 'string') throw new Error('ADMIN_PASSWORD_HASH 必须是 scrypt 编码');
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || !parts[4] || !parts[5]) throw new Error('ADMIN_PASSWORD_HASH 格式无效');
  const n = parsePositiveInteger(parts[1]);
  const r = parsePositiveInteger(parts[2]);
  const p = parsePositiveInteger(parts[3]);
  if (!isPowerOfTwo(n) || n < MIN_N || n > MAX_N || r < MIN_R || r > MAX_R || p < MIN_P || p > MAX_P) throw new Error('ADMIN_PASSWORD_HASH 参数不在支持范围');
  if (!/^[A-Za-z0-9_-]+$/.test(parts[4]) || !/^[A-Za-z0-9_-]+$/.test(parts[5])) throw new Error('ADMIN_PASSWORD_HASH 编码无效');
  const salt = Buffer.from(parts[4], 'base64url');
  const derived = Buffer.from(parts[5], 'base64url');
  if (salt.length < MIN_SALT_LENGTH || salt.length > MAX_SALT_LENGTH || derived.length !== KEY_LENGTH) throw new Error('ADMIN_PASSWORD_HASH 长度无效');
  return { n, r, p, salt, derived };
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string') return false;
  const parsed = typeof encoded === 'string' ? parsePasswordHash(encoded) : encoded;
  if (!parsed || typeof parsed !== 'object') return false;
  const derived = await derive(password, parsed);
  return derived.length === parsed.derived.length && timingSafeEqual(derived, parsed.derived);
}

export async function hashPassword(password, { n = MIN_N, r = MIN_R, p = MIN_P, salt = randomBytes(MIN_SALT_LENGTH) } = {}) {
  if (typeof password !== 'string' || !password) throw new Error('密码不能为空');
  if (!isPowerOfTwo(n) || n < MIN_N || n > MAX_N || r < MIN_R || r > MAX_R || p < MIN_P || p > MAX_P) throw new Error('scrypt 参数不在支持范围');
  const saltBuffer = Buffer.from(salt);
  if (saltBuffer.length < MIN_SALT_LENGTH || saltBuffer.length > MAX_SALT_LENGTH) throw new Error('scrypt 盐长度无效');
  const derived = await derive(password, { n, r, p, salt: saltBuffer });
  return `scrypt$${n}$${r}$${p}$${saltBuffer.toString('base64url')}$${derived.toString('base64url')}`;
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('base64url');
}

async function derive(password, { n, r, p, salt }) {
  return scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: Math.max(32 * 1024 * 1024, 128 * n * r + 1024) });
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value)) throw new Error('scrypt 参数无效');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('scrypt 参数无效');
  return number;
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
