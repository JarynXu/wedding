import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer, preview } from 'vite';
import { createInvitationApp } from '../server/app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const distDir = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const groomQuery = new URLSearchParams({ side: 'groom', parents: '张先生、李女士' }).toString();
const brideQuery = new URLSearchParams({ side: 'bride', parents: '陈女士' }).toString();

for (const mode of ['dev', 'preview', 'production']) {
  test(`${mode} 原始响应按家长参数生成分享信息`, { timeout: 30000 }, async () => {
    const config = { root, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, hmr: false }, preview: { host: '127.0.0.1', port: 0 } };
    let server;
    let close;
    if (mode === 'dev') {
      const vite = await createServer(config);
      await vite.listen(); server = vite.httpServer; close = () => vite.close();
    } else if (mode === 'preview') {
      const vite = await preview(config);
      server = vite.httpServer;
      close = () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
    } else {
      server = createInvitationApp({ distDir }).listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      close = () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
    }
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    try {
      const page = await browser.newPage({ javaScriptEnabled: false });
      for (const [query, expected] of [
        [groomQuery, '张先生、李女士敬邀亲朋参加爱子与儿媳的婚礼，共享良辰喜悦。'],
        [brideQuery, '陈女士敬邀亲朋参加爱女与女婿的婚礼，共享良辰喜悦。'],
      ]) {
        const response = await page.goto(`${origin}/?${query}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        assert.equal(response.headers()['cache-control'], mode === 'dev' ? 'no-cache' : 'no-store');
        assert.equal(await page.locator('[property="og:description"]').getAttribute('content'), expected);
        assert.equal(await page.locator('[name="description"]').getAttribute('content'), expected);
        assert.equal(await page.locator('[name="twitter:description"]').getAttribute('content'), expected);
        const canonical = new URL(await page.locator('[rel="canonical"]').getAttribute('href'));
        assert.equal(canonical.search, '?' + query);
        assert.equal(await page.locator('[property="og:url"]').getAttribute('content'), canonical.href);
        assert.equal(await page.title(), '徐旨越❤️赵荣蓉');
      }
      const escaped = new URLSearchParams({ side: 'groom', parents: '张"先生 & 李女士' });
      await page.goto(`${origin}/?${escaped}`, { waitUntil: 'domcontentloaded' });
      assert.match(await page.locator('[property="og:description"]').getAttribute('content'), /^张"先生 & 李女士敬邀/);
      assert.equal(await page.locator('[property="og:description"]').count(), 1);
      assert.equal(await page.locator('head [onerror]:not(link), head [onload]:not(link)').count(), 0);

      const plain = await (await fetch(origin + '/')).text();
      const parent = await (await fetch(origin + '/?' + groomQuery)).text();
      assert.equal(parent.slice(parent.indexOf('<body')), plain.slice(plain.indexOf('<body')), '父母署名仅改变分享信息，不改请柬正文');
      const invalid = await fetch(origin + '/?side=groom');
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /side.*parents/);
      const head = await fetch(origin + '/?'+ brideQuery, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');

      const variants = await Promise.all([groomQuery, brideQuery, groomQuery, brideQuery].map(async query => (await fetch(origin + '/?' + query)).text()));
      assert.ok(variants[0].includes('张先生、李女士敬邀'));
      assert.ok(variants[1].includes('陈女士敬邀'));
      assert.ok(variants[2].includes('张先生、李女士敬邀'));
      assert.ok(variants[3].includes('陈女士敬邀'));

      if (mode === 'production') {
        const health = await fetch(origin + '/healthz');
        assert.equal(await health.text(), 'ok\n');
        const calendar = await fetch(origin + '/wedding.ics');
        assert.equal(calendar.headers.get('content-type'), 'text/calendar; charset=utf-8');
        assert.equal(calendar.headers.get('content-disposition'), 'inline; filename="wedding.ics"');
        assert.deepEqual(Buffer.from(await calendar.arrayBuffer()), await readFile(path.join(distDir, 'wedding.ics')));
        const audioName = (await readdir(path.join(distDir, 'assets'))).find(name => name.endsWith('.mp3'));
        const audio = await fetch(origin + '/assets/' + encodeURIComponent(audioName), { headers: { Range: 'bytes=0-511' } });
        assert.equal(audio.status, 206);
        assert.match(audio.headers.get('content-range'), /^bytes 0-511\//);
        assert.deepEqual(Buffer.from(await audio.arrayBuffer()), (await readFile(path.join(distDir, 'assets', audioName))).subarray(0, 512));
        assert.match(audio.headers.get('cache-control'), /immutable/);
        const missing = await fetch(origin + '/missing-photo.jpg');
        assert.equal(missing.status, 404);
        const compressed = await fetch(origin + '/?' + groomQuery, { headers: { 'accept-encoding': 'gzip' } });
        assert.equal(compressed.headers.get('content-encoding'), 'gzip');
        await compressed.arrayBuffer();
      }
    } finally { await browser.close(); await close(); }
  });
}
