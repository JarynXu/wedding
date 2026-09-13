import { logError } from '../observability.js';
import { createHmac } from 'node:crypto';
import { GameError,text } from './model.js';

export class AliyunGameCaptcha {
  constructor(config,{fetcher=fetch}={}){this.config=config;this.configured=Boolean(config);this.fetcher=fetcher;}
  async verify(proof) {
    if(!this.config)throw new GameError('CAPTCHA_UNAVAILABLE','图形认证服务尚未开放',503);
    if(!proof||typeof proof!=='object')throw new GameError('CAPTCHA_REQUIRED','请先完成图形验证');
    const fields=Object.fromEntries(['lot_number','captcha_output','pass_token','gen_time'].map(key=>[key,text(proof[key],'图形验证参数',key==='captcha_output'?4096:256)]));
    if(!/^[a-zA-Z0-9_-]{16,128}$/.test(fields.lot_number)||!/^\d{1,20}$/.test(fields.gen_time))throw new GameError('CAPTCHA_REQUIRED','图形验证参数有误，请重新验证');
    const signature=createHmac('sha256',this.config.appKey).update(fields.lot_number).digest('hex');
    let result;
    try {
      const response=await this.fetcher('https://captcha.alicaptcha.com/validate?captcha_id='+encodeURIComponent(this.config.appId),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,sign_token:signature}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('CAPTCHA_HTTP_'+response.status);
      result=await response.json();
    }catch(error){logError('captcha.failed',error);throw new GameError('CAPTCHA_UNAVAILABLE','图形验证暂时无法完成，请稍后重试',503);}
    if(result.status!=='success'||result.result!=='success'||result.captcha_args?.lot_number!==fields.lot_number)throw new GameError('CAPTCHA_FAILED','图形验证未通过，请重新验证');
    return fields.lot_number;
  }
}
