import { createHash } from 'node:crypto';
import { findGift, BLESSING_LIMITS } from '../../src/celebration/catalog.js';

export class BlessingError extends Error {
  constructor(code, message, status = 400, retryAfter = 0) { super(message); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}

/** 请求只接受文字和已声明的礼物，不接受 HTML、任意图片或客户端时间。 */
export function validateBlessing(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BlessingError('INVALID_MESSAGE', '请检查祝福内容');
  if (!isUuid(body.requestId) || !isUuid(body.clientId)) throw new BlessingError('INVALID_ID', '发送凭据无效，请重新打开请柬');
  const name = cleanText(body.name ?? '', BLESSING_LIMITS.name, false) || '一位亲友';
  const text = cleanText(body.text ?? '', BLESSING_LIMITS.text, true);
  const gift = body.gift ?? '';
  if (body.theme !== 'classic' && body.theme !== 'chinese') throw new BlessingError('INVALID_THEME', '请柬主题无效');
  if (typeof gift !== 'string' || (gift && !findGift(gift)?.themes.includes(body.theme))) throw new BlessingError('INVALID_GIFT', '请选择这套请柬中的礼物');
  if (!text && !gift) throw new BlessingError('EMPTY_MESSAGE', '写一句祝福，或选一份心意');
  const giftCount = body.giftCount ?? (gift ? 1 : 0);
  if (!Number.isInteger(giftCount) || (gift ? giftCount < 1 || giftCount > BLESSING_LIMITS.giftCount : giftCount !== 0)) throw new BlessingError('INVALID_GIFT_COUNT', '礼物数量无效');
  const payload = { name, text, gift, theme: body.theme };
  // 单份礼物沿用旧指纹，部署前未确认的请求仍能按原标识重试。
  const fingerprint = createHash('sha256').update(JSON.stringify(giftCount > 1 ? { ...payload, giftCount } : payload)).digest('hex');
  return { ...payload, giftCount, requestId: body.requestId, clientId: body.clientId, fingerprint, generation:readGeneration(body.generation) };
}

export function parseCursor(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > 9223372036854775807n) throw new BlessingError('INVALID_CURSOR', '祝福页码无效，请刷新重试');
  return value;
}
export function validateWriting(body) {
  if (!body || !isUuid(body.requestId) || !isUuid(body.clientId)) throw new BlessingError('INVALID_ID','请求凭据无效');
  if (!['classic','chinese'].includes(body.theme)) throw new BlessingError('INVALID_THEME','请柬主题无效');
  const text=cleanText(body.text ?? '',BLESSING_LIMITS.text,true);
  return {requestId:body.requestId,clientId:body.clientId,text,theme:body.theme,fingerprint:createHash('sha256').update(JSON.stringify({text,theme:body.theme})).digest('hex'),generation:readGeneration(body.generation)};
}
function readGeneration(value=0){if(!Number.isSafeInteger(value)||value<0)throw new BlessingError('INVALID_MESSAGE','请重新打开请柬');return value;}

export function publicBlessing(row) {
  return { id: String(row.id), requestId: row.request_id, name: row.guest_name, text: row.message, gift: row.gift_id, giftCount: row.gift_id ? (row.gift_count ?? 1) : 0, giftName: findGift(row.gift_id)?.name || (row.gift_id ? '心意礼物' : ''), theme: row.sender_theme, createdAt: new Date(row.created_at).toISOString() };
}

function isUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function cleanText(value, maximum, multiline) {
  if (typeof value !== 'string') throw new BlessingError('INVALID_TEXT', '称呼和祝福须为文字');
  const text = value.normalize('NFC').trim();
  if ([...text].length > maximum) throw new BlessingError('TEXT_TOO_LONG', `这项内容最多 ${maximum} 字`);
  if ((multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u).test(text)) throw new BlessingError('INVALID_TEXT', '文字中含有无法显示的字符');
  return text;
}
