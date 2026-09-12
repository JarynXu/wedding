import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/** 手机号与兑奖码使用独立用途密钥加密；查询摘要不暴露原值。 */
export class GameSecrets {
  constructor(runtime) { this.dataKey = runtime.dataKey; this.sessionSecret = runtime.sessionSecret; }
  digest(purpose, value) { return createHmac('sha256', purpose === 'session' ? this.sessionSecret : this.dataKey).update(purpose + '\0' + value).digest('hex'); }
  seal(purpose, value) {
    const iv = randomBytes(12), key = createHmac('sha256', this.dataKey).update('encryption:' + purpose).digest();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
  }
  open(purpose, value) {
    const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64url'));
    const key = createHmac('sha256', this.dataKey).update('encryption:' + purpose).digest();
    const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }
}
