const SHARE_APIS = ['updateAppMessageShareData', 'updateTimelineShareData'];

/** 配置微信菜单分享内容；配置成功不代表宾客已发送分享。缺少签名接口时仅保留 HTML 元信息。 */
export async function configureWechatShare(metadata, signatureEndpoint) {
  if (!/MicroMessenger/i.test(navigator.userAgent)) return 'outside-wechat';
  if (!signatureEndpoint) return 'unconfigured';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = new URL(signatureEndpoint, location.href);
    if (endpoint.origin !== location.origin) throw new Error('微信签名接口须与页面同站');
    // 签名使用当前访问地址，分享链接使用配置的正式地址；二者不可混用。
    endpoint.searchParams.set('url', location.href.split('#')[0]);
    const response = await fetch(endpoint, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`微信签名请求失败：HTTP ${response.status}`);
    const signature = await response.json();
    if (!signature || typeof signature.appId !== 'string' || !signature.appId || !Number.isInteger(signature.timestamp)
      || typeof signature.nonceStr !== 'string' || !signature.nonceStr || !/^[a-f0-9]{40}$/i.test(signature.signature)) {
      throw new Error('微信签名响应格式不正确');
    }
    const wx = await loadWechatSdk(controller.signal);
    await new Promise((resolve, reject) => {
      const abort = () => reject(new Error('微信分享配置超时'));
      if (controller.signal.aborted) { abort(); return; }
      controller.signal.addEventListener('abort', abort, { once: true });
      wx.error(() => reject(new Error('微信分享配置未通过，请检查签名与接口安全域名')));
      wx.ready(() => {
        if (controller.signal.aborted) return;
        const common = { title: metadata.title, link: metadata.url, imgUrl: metadata.image };
        Promise.all(SHARE_APIS.map(api => new Promise((done, fail) => {
          wx[api]({ ...common, ...(api === 'updateAppMessageShareData' ? { desc: metadata.description } : {}), success: done, fail: () => fail(new Error(`微信分享内容设置失败：${api}`)) });
        }))).then(resolve, reject);
      });
      wx.config({ debug: false, appId: signature.appId, timestamp: signature.timestamp, nonceStr: signature.nonceStr, signature: signature.signature, jsApiList: SHARE_APIS });
    });
    return 'configured';
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function loadWechatSdk(signal) {
  if (window.wx) return Promise.resolve(window.wx);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = error => {
      script.onload = script.onerror = null;
      signal.removeEventListener('abort', abort);
      if (error) { script.remove(); reject(error); }
      else resolve(window.wx);
    };
    const abort = () => finish(new Error('微信 SDK 加载超时'));
    if (signal.aborted) { abort(); return; }
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    script.async = true;
    script.onload = () => finish(window.wx ? null : new Error('微信 SDK 未初始化'));
    script.onerror = () => finish(new Error('微信 SDK 加载失败'));
    signal.addEventListener('abort', abort, { once: true });
    document.head.append(script);
  });
}
