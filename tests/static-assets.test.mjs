import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readStaticAssetBase, renderStaticAssets } from '../server/static-assets.js';
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
  const html = '<head><script src="./assets/app.js"></script><link href="./assets/app.css"></head><a href="./game.html">游戏</a><a href="./wedding.ics">日历</a>';
  assert.equal(renderStaticAssets(html, ''), html);
  const changed = renderStaticAssets(html, base);
  assert.match(changed, /https:\/\/cdn.example.com\/releases\/v1\/assets\/app.js/);
  assert.match(changed, /href=".\/game.html"/); assert.match(changed, /href=".\/wedding.ics"/);
  const share = getShareMetadata(WEDDING_CONFIG, '?theme=chinese&side=groom&parents=张先生', base);
  assert.match(share.image, /^https:\/\/cdn.example.com\/releases\/v1\/share\//);
  assert.match(share.url, /^https:\/\/wedding.jaryn.com.cn\//); assert.match(share.description, /张先生/);
});

test('生产包跨域加载两种主题、游戏和日历，业务接口留在本站', { timeout: 90000 }, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const external = express(); const received = [];
  external.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
  external.use('/release', express.static(resolve('dist')));
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
    for (const suffix of ['.js', '.css', '.woff2', '.mp3', '.webp']) assert.ok(received.some(url => url.startsWith(base) && url.endsWith(suffix)), suffix);
    assert.equal(received.filter(url => url.startsWith(origin + '/assets/')).length, 0);
    assert.ok(received.some(url => url.startsWith(origin + '/api/')));
    assert.equal(received.filter(url => url.startsWith(base) && url.includes('/api/')).length, 0);
    const range = await fetch(base + 'share/wedding-portrait.jpg', { headers: { Range: 'bytes=0-9' } });
    assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 10);
  } finally { await browser.close(); server.closeAllConnections(); cdn.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => cdn.close(resolve))]); }
});
