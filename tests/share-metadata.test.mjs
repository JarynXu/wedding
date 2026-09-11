import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { WEDDING_CONFIG } from '../src/config.js';
import { getShareMetadata } from '../src/share-metadata.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

test('分享地址与新人姓名来自配置，修改域名可更新页面和图片地址', () => {
  const config = structuredClone(WEDDING_CONFIG);
  const share = getShareMetadata(config);
  assert.equal(share.title, '徐旨越❤️赵荣蓉');
  assert.equal(share.url, 'https://wedding-310889-6-1484253371.sh.run.tcloudbase.com/');
  config.share.siteUrl = 'https://invitation.example.com';
  config.groom.name = '新郎';
  config.bride.name = '新娘';
  const changed = getShareMetadata(config);
  assert.equal(changed.title, '新郎❤️新娘');
  assert.equal(changed.url, 'https://invitation.example.com/');
  assert.equal(changed.image, 'https://invitation.example.com/share/wedding-portrait.jpg');
  for (const siteUrl of ['http://example.com', 'https://example.com/?guest=1', 'https://example.com/#page', 'https://name:secret@example.com']) {
    config.share.siteUrl = siteUrl;
    assert.throws(() => getShareMetadata(config));
  }
});

test('家长署名按双方身份生成副标题，分享地址保留参数', () => {
  const groom = getShareMetadata(WEDDING_CONFIG, new URLSearchParams({ side: 'groom', parents: '张先生、李女士', revision: 'test' }));
  assert.equal(groom.description, '张先生、李女士敬邀亲朋，莅临儿子徐旨越与儿媳赵荣蓉的婚礼，共享良辰喜悦。');
  const bride = getShareMetadata(WEDDING_CONFIG, new URLSearchParams({ side: 'bride', parents: '陈女士' }));
  assert.equal(bride.description, '陈女士敬邀亲朋，莅临女儿赵荣蓉与女婿徐旨越的婚礼，共享良辰喜悦。');
  assert.equal(groom.title, bride.title);
  assert.equal(groom.image, bride.image);
  assert.equal(new URL(groom.url).searchParams.get('parents'), '张先生、李女士');
  assert.equal(new URL(groom.url).searchParams.get('side'), 'groom');
  assert.equal(new URL(groom.url).searchParams.has('revision'), false);
  assert.equal(getShareMetadata(WEDDING_CONFIG, '?from=singlemessage').description, WEDDING_CONFIG.share.description);
  for (const search of ['?side=groom', '?parents=张先生', '?side=unknown&parents=张先生', '?side=groom&parents=', '?side=groom&side=bride&parents=张先生', '?side=groom&parents=张先生&parents=李女士', '?side=groom&parents=%3Cscript%3E', '?side=groom&parents=%0A张先生']) {
    assert.throws(() => getShareMetadata(WEDDING_CONFIG, search));
  }
  assert.throws(() => getShareMetadata(WEDDING_CONFIG, new URLSearchParams({ side: 'bride', parents: '名'.repeat(61) })));
});

test('生产 HTML 含完整分享信息，微信配置使用当前地址签名', { timeout: 30000 }, async suite => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const moduleSource = await readFile(new URL('../src/wechat-share.js', import.meta.url));
  const signatureRequests = [];
  let invalidSignature = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/wechat-share.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(moduleSource);
    } else if (url.pathname === '/signature') {
      signatureRequests.push(url.searchParams.get('url'));
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(invalidSignature ? {} : { appId: 'wx-test-fixture', timestamp: 1789040000, nonceStr: 'test-fixture', signature: 'a'.repeat(40) }));
    } else response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html><head><meta charset="UTF-8"><title>测试入口</title></head><body>测试页面</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 MicroMessenger/8.0' });
    await page.goto(origin + '/invitation?guest=1#date');
    await suite.test('分享标签存在于未经脚本处理的 HTML，图片可解码为方图', async () => {
      const data = await page.evaluate(html => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        const content = selector => document.querySelector(selector)?.getAttribute('content');
        return {
          title: document.title,
          shareTitle: content('[property="og:title"]'),
          description: content('[property="og:description"]'),
          pageDescription: content('[name="description"]'),
          image: content('[property="og:image"]'),
          width: content('[property="og:image:width"]'), height: content('[property="og:image:height"]'),
          url: content('[property="og:url"]'), type: content('[property="og:type"]'),
          canonical: document.querySelector('[rel="canonical"]').href,
          twitter: content('[name="twitter:title"]'),
          count: document.querySelectorAll('[property="og:title"]').length,
        };
      }, html);
      assert.equal(data.title, '徐旨越❤️赵荣蓉');
      assert.equal(data.shareTitle, data.title);
      assert.equal(data.twitter, data.title);
      assert.equal(data.count, 1);
      assert.equal(data.description, WEDDING_CONFIG.share.description);
      assert.equal(data.pageDescription, data.description);
      assert.equal(data.url, 'https://wedding-310889-6-1484253371.sh.run.tcloudbase.com/');
      assert.equal(data.canonical, data.url);
      assert.equal(data.image, data.url + 'share/wedding-portrait.jpg');
      assert.equal(data.type, 'website');
      const image = await readFile(new URL('../dist/share/wedding-portrait.jpg', import.meta.url));
      const size = await page.evaluate(async base64 => {
        const blob = await (await fetch('data:image/jpeg;base64,' + base64)).blob();
        const image = await createImageBitmap(blob);
        return [image.width, image.height];
      }, image.toString('base64'));
      assert.deepEqual(size, [600, 600]);
      assert.deepEqual([Number(data.width), Number(data.height)], size);
    });

    await suite.test('未配置公众号签名接口时不请求微信 SDK 或签名', async () => {
      const status = await page.evaluate(async () => {
        const { configureWechatShare } = await import('/wechat-share.js');
        return configureWechatShare({}, '');
      });
      assert.equal(status, 'unconfigured');
      assert.deepEqual(signatureRequests, []);
      assert.equal(await page.locator('script[src*="jweixin"]').count(), 0);
    });

    await suite.test('有效签名后配置好友与朋友圈，配置成功不冒充分享完成', async () => {
      // SDK 为接口契约测试替身；不调用真实微信，不代表真机分享验证。
      await page.evaluate(() => {
        window.shareCalls = [];
        let ready;
        window.wx = {
          ready(callback) { ready = callback; }, error() {},
          config(value) { window.shareConfig = value; queueMicrotask(ready); },
          updateAppMessageShareData(value) { window.shareCalls.push({ target: 'friend', ...value }); value.success(); },
          updateTimelineShareData(value) { window.shareCalls.push({ target: 'timeline', ...value }); value.success(); },
        };
      });
      const share = getShareMetadata(WEDDING_CONFIG);
      const status = await page.evaluate(async share => {
        const { configureWechatShare } = await import('/wechat-share.js');
        return configureWechatShare(share, '/signature');
      }, share);
      assert.equal(status, 'configured');
      assert.deepEqual(signatureRequests, [origin + '/invitation?guest=1']);
      const result = await page.evaluate(() => ({ config: window.shareConfig, calls: window.shareCalls.map(({ success, fail, ...value }) => value) }));
      assert.deepEqual(result.config.jsApiList, ['updateAppMessageShareData', 'updateTimelineShareData']);
      assert.equal(result.config.debug, false);
      assert.equal(result.calls[0].title, '徐旨越❤️赵荣蓉');
      assert.equal(result.calls[0].desc, share.description);
      assert.equal(result.calls[0].link, share.url);
      assert.equal(result.calls[0].imgUrl, share.image);
      assert.equal('desc' in result.calls[1], false, '朋友圈接口不传不存在的副标题字段');
    });

    await suite.test('微信家长版描述与链接一起设置，签名保留当前完整查询参数', async () => {
      const search = new URLSearchParams({ side: 'bride', parents: '陈女士', revision: 'test' });
      await page.evaluate(search => {
        history.replaceState(null, '', '/invitation?' + search + '#date');
        window.shareCalls = [];
      }, search.toString());
      const metadata = getShareMetadata(WEDDING_CONFIG, search);
      const status = await page.evaluate(async metadata => {
        const { configureWechatShare } = await import('/wechat-share.js');
        return configureWechatShare(metadata, '/signature');
      }, metadata);
      assert.equal(status, 'configured');
      assert.equal(signatureRequests.at(-1), origin + '/invitation?' + search);
      const friend = await page.evaluate(() => {
        const { success, fail, ...data } = window.shareCalls.find(call => call.target === 'friend');
        return data;
      });
      assert.equal(friend.desc, '陈女士敬邀亲朋，莅临女儿赵荣蓉与女婿徐旨越的婚礼，共享良辰喜悦。');
      assert.equal(new URL(friend.link).searchParams.get('parents'), '陈女士');
      assert.equal(new URL(friend.link).searchParams.get('side'), 'bride');
      assert.equal(new URL(friend.link).searchParams.has('revision'), false);
    });

    await suite.test('签名与 SDK 失败返回错误，保留页面内容', async () => {
      invalidSignature = true;
      const invalid = await page.evaluate(async () => {
        const { configureWechatShare } = await import('/wechat-share.js');
        try { await configureWechatShare({}, '/signature'); } catch (error) { return error.message; }
      });
      assert.match(invalid, /格式不正确/);
      invalidSignature = false;
      await page.evaluate(() => { delete window.wx; });
      await page.route('https://res.wx.qq.com/open/js/jweixin-1.6.0.js', route => route.abort());
      const failed = await page.evaluate(async () => {
        const { configureWechatShare } = await import('/wechat-share.js');
        try { await configureWechatShare({}, '/signature'); } catch (error) { return error.message; }
      });
      assert.match(failed, /SDK 加载失败/);
      assert.equal(await page.locator('body').innerText(), '测试页面');
    });
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
