import { publicAssetUrl } from '../static-assets.js';
let sdkLoading;
function loadSdk() {
  if(typeof window.initAlicom4==='function')return Promise.resolve();
  sdkLoading ??= new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=publicAssetUrl('./vendor/aliyun-graph/ct4.js');script.async=true;
    const fail=()=>{clearTimeout(timeout);script.remove();reject(new Error('图形验证加载失败，请稍后重试'));};
    const timeout=setTimeout(fail,15000);
    script.onerror=fail;script.onload=()=>{clearTimeout(timeout);if(typeof window.initAlicom4==='function')resolve();else fail();};document.head.append(script);
  }).catch(error=>{sdkLoading=null;throw error;});
  return sdkLoading;
}

/** 宾客主动申请验证码后才加载认证 SDK；客户端成功结果仍须服务端核验。 */
export async function getCaptchaProof(captchaId, onVerified) {
  if(!captchaId)throw new Error('图形认证正在准备中，请稍后再试');
  await loadSdk();
  return new Promise((resolve,reject)=>{
    let instance,finished=false;
    const finish=(error,result)=>{
      if(finished)return;finished=true;clearTimeout(timeout);window.removeEventListener('pagehide',leave);instance?.destroy();
      if(error)reject(error);else { onVerified?.(); resolve(result); }
    };
    const leave=()=>finish(new Error('已取消图形验证'));
    const timeout=setTimeout(()=>finish(new Error('图形验证未完成，请重新尝试')),90000);
    window.addEventListener('pagehide',leave,{once:true});
    try{
      window.initAlicom4({captchaId,product:'bind',language:'zho',protocol:'https://'},captcha=>{
        instance=captcha;
        captcha.onSuccess(()=>{const proof=captcha.getValidate();if(!proof)finish(new Error('请先完成图形验证'));else finish(null,{...proof});})
          .onError(()=>finish(new Error('图形验证暂时无法完成，请重试')))
          .onClose(()=>finish(new Error('已取消图形验证')))
          .onNextReady(()=>{if(!finished)captcha.showCaptcha();});
      });
    }catch(error){finish(new Error('图形验证暂时无法启动，请重试'));}
  });
}
