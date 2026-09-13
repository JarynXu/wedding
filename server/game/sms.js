import { log, logError } from '../observability.js';
import Dypns from '@alicloud/dypnsapi20170525';
import Core from '@alicloud/openapi-core';
import Dara from '@darabonba/typescript';

/** 号码认证由阿里云生成并核验验证码；不在前端或响应中返回验证码。 */
export class AliyunGameSms {
  constructor(config) {
    this.config=config;this.configured=Boolean(config);
    this.client=config?new Dypns.default(new Core.$OpenApiUtil.Config({accessKeyId:config.accessKeyId,accessKeySecret:config.accessKeySecret,endpoint:'dypnsapi.aliyuncs.com',regionId:'cn-hangzhou'})):null;
  }
  options(){return new Dara.RuntimeOptions({autoretry:false,maxAttempts:1,readTimeout:10000,connectTimeout:5000});}
  async send(phone,requestId) {
    if(!this.client)return {delivery:'failed'};
    try {
      const result=await this.client.sendSmsVerifyCodeWithOptions(new Dypns.SendSmsVerifyCodeRequest({
        schemeName:this.config.schemeName,countryCode:'86',phoneNumber:phone.replace(/^\+86/,''),
        signName:this.config.signName,templateCode:this.config.templateCode,templateParam:JSON.stringify({code:'##code##',min:'5'}),
        outId:requestId,codeLength:6,validTime:300,duplicatePolicy:1,interval:60,codeType:1,returnVerifyCode:false,autoRetry:0,
      }),this.options());
      if(result.body?.code==='OK'&&result.body?.success===true)return {delivery:'sent',bizId:result.body.model?.bizId||null};
      log('sms.provider_rejected',{error_code:result.body?.code||'unknown'},'error');return {delivery:'failed'};
    }catch(error){logError('sms.send_unconfirmed',error);return {delivery:error.statusCode>=400&&error.statusCode<500?'failed':'unknown'};}
  }
  async verify(phone,code,requestId) {
    if(!this.client)return 'unavailable';
    try {
      const result=await this.client.checkSmsVerifyCodeWithOptions(new Dypns.CheckSmsVerifyCodeRequest({schemeName:this.config.schemeName,countryCode:'86',phoneNumber:phone.replace(/^\+86/,''),verifyCode:code,outId:requestId,caseAuthPolicy:1}),this.options());
      if(result.body?.code!=='OK'||result.body?.success!==true)return 'unavailable';
      if(result.body.model?.verifyResult==='PASS')return 'pass';
      // PNVS 文档将 UNKNOWN 定义为“验证码核验失败”；网络与响应异常走 unavailable。
      if(result.body.model?.verifyResult==='UNKNOWN')return 'fail';
      return 'unavailable';
    }catch(error){logError('sms.verify_failed',error);return 'unavailable';}
  }
}
