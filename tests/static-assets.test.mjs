import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readStaticAssetBase, renderStaticAssets, renderStaticStylesheet } from '../server/static-assets.js';
import { publicAssetUrl } from '../src/static-assets.js';
import { createInvitationApp } from '../server/app.js';
import { getShareMetadata } from '../src/share-metadata.js';
import { WEDDING_CONFIG } from '../src/config.js';

test('静态地址校验、目录前缀和页面边界', () => {
  assert.equal(readStaticAssetBase({}), '');
  const base = readStaticAssetBase({ STATIC_ASSET_BASE_URL: 'https://cdn.example.com/releases/v1' });
  assert.equal(publicAssetUrl('/share/portrait.jpg?v=1', base), 'https://cdn.example.com/releases/v1/share/portrait.jpg?v=1');
  assert.equal(publicAssetUrl('./vendor/sdk.js'), './vendor/sdk.js');
  for (const value of ['javascript:alert(1)', 'http://cdn.example.com', 'https://user:password@cdn.example.com', 'https://cdn.example.com/?key=1', 'https://cdn.example.com/#x']) assert.throws(() => readStaticAssetBase({ STATIC_ASSET_BASE_URL: value }));
  const html = '<head><script src="./app/main.js"></script><link rel="stylesheet" href="./app/main.css"><link rel="icon" href="./assets/icon.svg"></head><a href="./game.html">游戏</a><a href="./wedding.ics">日历</a>';
  assert.equal(renderStaticAssets(html, ''), html);
  const changed = renderStaticAssets(html, base);
  assert.match(changed, /https:\/\/cdn.example.com\/releases\/v1\/assets\/icon.svg/);
  assert.match(changed, /src="\.\/app\/main.js"/);
  assert.match(changed, /href="\.\/app\/main.css\?static=[a-f0-9]+"/);
  assert.match(changed, /href=".\/game.html"/); assert.match(changed, /href=".\/wedding.ics"/);
  const share = getShareMetadata(WEDDING_CONFIG, '?theme=chinese&side=groom&parents=张先生', base);
  assert.match(share.image, /^https:\/\/cdn.example.com\/releases\/v1\/share\//);
  assert.match(share.url, /^https:\/\/wedding.jaryn.com.cn\//); assert.match(share.description, /张先生/);
});

test('CSS 中的字体和背景使用静态域名，保留其他 URL 语义', () => {
  const css = '@font-face{src:url(../assets/fonts/中文.woff2?v=2)}.photo{background:url("/assets/photo (1).webp")}';
  const unchanged = '.a{filter:url(#mask);background:url(data:image/png;base64,AAAA)}.b{background:url(https://example.com/photo.webp)}.c{background:url(/api/avatar)}';
  assert.equal(renderStaticStylesheet(css, '/app/main.css', ''), css);
  assert.equal(renderStaticStylesheet(css, '/app/main.css', 'https://static.example.com/sub/'),
    '@font-face{src:url("https://static.example.com/sub/assets/fonts/%E4%B8%AD%E6%96%87.woff2?v=2")}.photo{background:url("https://static.example.com/sub/assets/photo%20(1).webp")}');
  assert.equal(renderStaticStylesheet(unchanged, '/app/main.css', 'https://static.example.com/'), unchanged);
});

test('更换静态配置更新 CSS 地址与缓存校验，清空配置使用磁盘原件', async () => {
  const file = (await readdir('dist/app')).find(file => /^invitation-.*\.css$/.test(file));
  assert.ok(file);
  const original = await readFile(resolve('dist/app', file), 'utf8');
  let previousHref, previousEtag;
  for (const base of ['https://static.example.com/', 'https://static.example.com/wedding/v2/', '']) {
    const server = createInvitationApp({ staticAssetBase: base }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const html = await (await fetch(origin)).text();
      const href = /href="([^"<>]*app\/invitation-[^"<>]+\.css(?:\?[^"<>]*)?)"/.exec(html)?.[1];
      assert.ok(href); assert.notEqual(href, previousHref);
      const stylesheet = await fetch(new URL(href, origin), { headers: previousEtag ? { 'If-None-Match': previousEtag } : {} });
      assert.equal(stylesheet.status, 200);
      assert.match(stylesheet.headers.get('content-type'), /text\/css/);
      const content = await stylesheet.text();
      if (base) {
        assert.ok(content.includes(base + 'assets/classic/location.jpg'));
        assert.equal(stylesheet.headers.get('cache-control'), 'no-cache');
        const cached = await fetch(new URL(href, origin), { cache: 'no-cache', headers: { 'If-None-Match': stylesheet.headers.get('etag') } });
        assert.equal(cached.status, 304);
      } else assert.equal(content, original);
      previousHref = href; previousEtag = stylesheet.headers.get('etag');
    } finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
  }
  assert.equal(await readFile(resolve('dist/app', file), 'utf8'), original);
});

test('静态服务仅托管 public 原样内容，两种主题的素材跨域，应用与接口留在本站', { timeout: 90000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const external = express(); const received = [];
  external.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
  external.use('/release', express.static(resolve('public')));
  const cdn = external.listen(0, '127.0.0.1'); await new Promise(resolve => cdn.once('listening', resolve));
  const base = `http://127.0.0.1:${cdn.address().port}/release/`;
  const server = createInvitationApp({ staticAssetBase: base }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const theme of ['classic', 'chinese']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors = [];
      page.on('request', req => received.push(req.url())); page.on('pageerror', e => errors.push(e.message));
      page.on('response', res => { if (res.status() >= 400 && res.url().startsWith(base)) errors.push(`${res.status()} ${res.url()}`); });
      await page.goto(`${origin}/?theme=${theme}`);
      await page.locator('#preloaderOverlay[data-state="ready"]').waitFor({ timeout: 30000 });
      assert.ok(await page.evaluate(() => document.fonts.status === 'loaded'));
      assert.ok((await page.locator('meta[property="og:image"]').getAttribute('content')).startsWith(base));
      await page.locator('#btnEnterInvitation').click();
      await page.goto(`${origin}/game.html?theme=${theme}`);
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/api/game/config')));
      await page.goto(`${origin}/calendar.html?theme=${theme}`);
      assert.ok((await page.locator('#calendarOpen').getAttribute('href')).includes('wedding.ics'));
      assert.deepEqual(errors, []); await page.close();
    }
    for (const suffix of ['.woff2', '.mp3', '.webp']) assert.ok(received.some(url => url.startsWith(base) && new URL(url).pathname.endsWith(suffix)), suffix);
    for (const suffix of ['.js', '.css']) assert.ok(received.some(url => url.startsWith(origin + '/app/') && new URL(url).pathname.endsWith(suffix)), suffix);
    assert.equal(received.filter(url => url.startsWith(base + 'app/')).length, 0);
    assert.equal(received.filter(url => url.startsWith(origin) && /^\/(assets|music|share|vendor)\//.test(new URL(url).pathname)).length, 0);
    for (const path of ['assets/classic/portrait.webp', 'assets/chinese/portrait.webp', 'assets/classic/location.jpg', 'assets/chinese/location.webp', 'music/classic/playlist.json', 'music/chinese/playlist.json']) {
      assert.ok(received.includes(base + path), `请求路径与上传目录一致：${path}`);
    }
    assert.ok(received.some(url => url.startsWith(origin + '/api/')));
    assert.equal(received.filter(url => url.startsWith(base) && url.includes('/api/')).length, 0);
    const range = await fetch(base + 'share/wedding-portrait.jpg', { headers: { Range: 'bytes=0-9' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 10);
  } finally { await browser.close(); server.closeAllConnections(); cdn.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => cdn.close(resolve))]); }
});
