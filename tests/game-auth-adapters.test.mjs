import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { AliyunGameSms } from '../server/game/sms.js';
import { AliyunGameCaptcha } from '../server/game/captcha.js';

test('阿里云短信使用号码认证接口、托管验证码与明确 PASS 核验',async()=>{
  const adapter=new AliyunGameSms({accessKeyId:'test',accessKeySecret:'test',signName:'测试签名',templateCode:'100001',schemeName:'test'});
  let verifyResult='UNKNOWN',sent;
  adapter.client={
    async sendSmsVerifyCodeWithOptions(request,options){sent=request;assert.equal(options.autoretry,false);return {body:{code:'OK',success:true,model:{bizId:'test-biz',verifyCode:'must-not-return'}}};},
    async checkSmsVerifyCodeWithOptions(request){assert.equal(request.verifyCode,'123456');return {body:{code:'OK',success:true,model:{verifyResult}}};},
  };
  const result=await adapter.send('+8613800000000','request-id');
  assert.deepEqual(result,{delivery:'sent',bizId:'test-biz'});
  assert.equal(sent.returnVerifyCode,false);assert.equal(sent.codeLength,6);assert.equal(sent.validTime,300);
  assert.deepEqual(JSON.parse(sent.templateParam),{code:'##code##',min:'5'});
  assert.equal(sent.phoneNumber,'13800000000');
  assert.equal(await adapter.verify('+8613800000000','123456','request-id'),'fail','接口OK不等于手机号核验通过');
  verifyResult='PASS';assert.equal(await adapter.verify('+8613800000000','123456','request-id'),'pass');
  adapter.client.checkSmsVerifyCodeWithOptions=async()=>{throw new Error('network');};
  assert.equal(await adapter.verify('+8613800000000','123456','request-id'),'unavailable');
});

test('图形二次校验使用服务端签名，异常与客户端伪造成功均不放行',async()=>{
  const proof={lot_number:'1234567890abcdef1234567890abcdef',captcha_output:'proof-value',pass_token:'pass-value',gen_time:'1789195000'};
  let payload;
  const adapter=new AliyunGameCaptcha({appId:'configured-id',appKey:'server-only-key'},{fetcher:async(url,options)=>{
    assert.equal(new URL(url).hostname,'captcha.alicaptcha.com');assert.equal(new URL(url).searchParams.get('captcha_id'),'configured-id');
    payload=new URLSearchParams(options.body);return Response.json({status:'success',result:'success',captcha_args:{lot_number:proof.lot_number}});
  }});
  assert.equal(await adapter.verify({...proof,captcha_id:'attacker-id',sign_token:'attacker-signature'}),proof.lot_number);
  assert.equal(payload.get('sign_token'),createHmac('sha256','server-only-key').update(proof.lot_number).digest('hex'));
  adapter.fetcher=async()=>Response.json({result:'success',reason:'request api fail'});
  await assert.rejects(adapter.verify(proof),{code:'CAPTCHA_FAILED'});
  adapter.fetcher=async()=>{throw new Error('offline');};
  await assert.rejects(adapter.verify(proof),{code:'CAPTCHA_UNAVAILABLE'});
  await assert.rejects(adapter.verify({success:true}),{code:'INVALID_INPUT'});
});
