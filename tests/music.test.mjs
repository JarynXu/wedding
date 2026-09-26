import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import express from 'express';
import { createRequire } from 'node:module';
import { readMusicLibrary, syncMusicLibrary } from '../build/music-library.js';
import { createInvitationApp } from '../server/app.js';
import { WeddingMusic } from '../src/music.js';

test('取消解码会结束预载并释放已创建的音频 Blob', { timeout: 5000 }, async () => {
  const original = { fetch: globalThis.fetch, window: globalThis.window, location: globalThis.location, create: URL.createObjectURL };
  let started; const decoding = new Promise(resolve => { started = resolve; }), urls = [];
  const audio = Object.assign(new EventTarget(), { paused: true, dataset: {}, load() {}, pause() {}, removeAttribute() {} });
  const music = new WeddingMusic({ audio, theme: 'classic' });
  try {
    globalThis.location = { href: 'https://invitation.test/' };
    globalThis.window = { OfflineAudioContext: class { decodeAudioData() { started(); return new Promise(() => {}); } } };
    globalThis.fetch = async url => String(url).endsWith('playlist.json') ? Response.json({ tracks: [{ file: '1.mp3' }] }) : new Response(new Uint8Array([1, 2, 3]));
    URL.createObjectURL = blob => { const url = original.create(blob); urls.push(url); return url; };
    const controller = new AbortController(), prepared = music.prepare(controller.signal, () => {});
    await decoding; controller.abort(); await assert.rejects(prepared, /音乐准备已取消/);
    assert.equal(music.prepared, false); assert.equal(music.tracks.length, 0); assert.equal(urls.length, 1);
    await assert.rejects(original.fetch(urls[0]));
  } finally {
    music.destroy(); globalThis.fetch = original.fetch; URL.createObjectURL = original.create;
    if (original.window === undefined) delete globalThis.window; else globalThis.window = original.window;
    if (original.location === undefined) delete globalThis.location; else globalThis.location = original.location;
  }
});

test('版本音频缓存失败后从网络重试，解码使用重试取得的字节', async () => {
  const previous = { fetch: globalThis.fetch, window: globalThis.window, location: globalThis.location };
  const requests = [], decoded = [];
  const audio = Object.assign(new EventTarget(), { paused: true, dataset: {}, load() {}, pause() {}, removeAttribute() {} });
  const music = new WeddingMusic({ audio, theme: 'classic', preferCache: true });
  try {
    globalThis.location = { href: 'https://invitation.test/' };
    globalThis.window = { OfflineAudioContext: class { async decodeAudioData(bytes) { decoded.push([...new Uint8Array(bytes)]); return { duration: 1 }; } } };
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('playlist.json')) return Response.json({ tracks: [{ file: '1.mp3', version: 'current-content' }] });
      requests.push({ url: String(url), cache: options.cache });
      return requests.length === 1 ? new Response('cached failure', { status: 503 }) : new Response(new Uint8Array([1, 2, 3]));
    };
    await music.prepare(new AbortController().signal, () => {});
    assert.equal(music.prepared, true);
    assert.deepEqual(requests.map(request => request.cache), ['force-cache', 'reload']);
    assert.ok(requests.every(request => request.url.endsWith('/1.mp3?v=current-content')));
    assert.deepEqual(decoded, [[1, 2, 3]]);
  } finally {
    music.destroy(); globalThis.fetch = previous.fetch;
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.location === undefined) delete globalThis.location; else globalThis.location = previous.location;
  }
});

test('public 歌单按编号排序，文件变更更新清单，空中式目录使用默认主题', async () => {
  await mkdir('.temp/tests', { recursive: true });
  const root = await mkdtemp(resolve('.temp/tests/music-'));
  try {
    for (const theme of ['classic', 'chinese']) await mkdir(join(root, 'public/music', theme), { recursive: true });
    for (const file of ['10-尾曲.mp3', '2-第二首.MP3', '01-开场.mp3']) await writeFile(join(root, 'public/music/classic', file), 'test-audio');
    await writeFile(join(root, 'public/music/classic', '说明.md'), 'not a track');
    const library = await syncMusicLibrary(root);
    assert.deepEqual(library.classic.tracks.map(track => track.title), ['开场', '第二首', '尾曲']);
    assert.equal(library.chinese.fallback, 'classic');
    await writeFile(join(root, 'public/music/chinese', '01-喜乐.mp3'), 'chinese-audio');
    await syncMusicLibrary(root);
    const chineseFile = join(root, 'public/music/chinese/playlist.json');
    const chinese = JSON.parse(await readFile(chineseFile, 'utf8'));
    assert.equal(chinese.fallback, undefined); assert.equal(chinese.tracks[0].title, '喜乐');
    assert.equal(await readFile(join(root, 'public/music/chinese/01-喜乐.mp3'), 'utf8'), 'chinese-audio');
    await writeFile(join(root, 'public/music/chinese/01-喜乐.mp3'), 'updated-audio');
    await syncMusicLibrary(root);
    assert.notEqual(JSON.parse(await readFile(chineseFile, 'utf8')).tracks[0].version, chinese.tracks[0].version);
    await rm(join(root, 'public/music/chinese/01-喜乐.mp3'));
    await syncMusicLibrary(root);
    assert.deepEqual(JSON.parse(await readFile(chineseFile, 'utf8')), { tracks: [], fallback: 'classic' });
    await writeFile(join(root, 'public/music/classic', '03-空文件.wav'), '');
    await assert.rejects(readMusicLibrary(root), /音乐文件为空/);
  } finally {
    assert.ok(root.startsWith(resolve('.temp/tests/music-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('真实浏览器歌单预载、暂停换曲、顺序循环、主题与播放许可', { timeout: 90000 }, async suite => {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const tracks = theme => ({ tracks: (theme === 'classic' ? ['A', 'B', 'C'] : ['喜乐', '良辰']).map((title, i) => ({ file: `${i + 1}-${title}.wav`, title })) });
  const requests = []; let held = false, release = null, fail = false, fallback = false;
  const app = express();
  app.get('/music/:theme/playlist.json', (req, res) => res.json(fallback && req.params.theme === 'chinese' ? { tracks: [], fallback: 'classic' } : tracks(req.params.theme)));
  app.get('/music/:theme/:file', (req, res) => {
    requests.push(req.path);
    if (fail && req.params.file.includes('B')) return res.status(503).send('isolated failure');
    const audio = wave(); res.set({ 'Content-Type': 'audio/wav', 'Content-Length': String(audio.length) });
    if (held && req.params.file.includes('B')) { res.write(audio.subarray(0, 2000)); release = () => res.end(audio.subarray(2000)); }
    else res.end(audio);
  });
  app.use(createInvitationApp());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const current = () => page.locator('#bgm').getAttribute('data-track-title');
  const enter = async () => { await page.locator('#preloaderOverlay[data-state="ready"]').waitFor(); await page.locator('#btnEnterInvitation').click(); await page.waitForFunction(() => !document.getElementById('bgm').paused); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await suite.test('必须等当前主题全部曲目完整下载，切歌可离线', async () => {
      held = true; await page.goto(origin);
      for (let count = 0; count < 100 && !release; count++) await page.waitForTimeout(50);
      assert.ok(release); assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), false);
      assert.notEqual(await page.locator('#preloaderPercent').innerText(), '100%');
      held = false; release(); await enter(); assert.equal(await current(), 'A');
      assert.ok(requests.includes('/music/classic/3-C.wav'));
      assert.ok(requests.every(path => path.startsWith('/music/classic/')));
      await page.context().setOffline(true);
      await page.locator('#musicBtn').click(); assert.equal(await page.locator('#bgm').evaluate(audio => audio.paused), true);
      await page.locator('#musicBtn').click(); await page.waitForFunction(() => !document.getElementById('bgm').paused);
      assert.equal(await current(), 'B');
      for (const title of ['C', 'A']) {
        await page.waitForFunction(() => Number.isFinite(document.getElementById('bgm').duration));
        await page.evaluate(() => { const audio = document.getElementById('bgm'); audio.currentTime = audio.duration - 0.1; });
        await page.waitForFunction(title => document.getElementById('bgm').dataset.trackTitle === title && !document.getElementById('bgm').paused, title);
      }
      await page.context().setOffline(false);
    });
    await suite.test('后续曲目失败时禁止进入，不能只等第一首', async () => {
      await page.context().setOffline(false); fail = true; await page.goto(origin);
      await page.locator('#preloaderOverlay[data-state="error"]').waitFor(); assert.equal(await page.locator('#btnEnterInvitation').isEnabled(), false);
      fail = false; await page.reload(); await enter();
    });
    await suite.test('中式音乐与默认目录隔离，空目录明确沿用默认曲目', async () => {
      requests.length = 0; await page.goto(origin + '/?theme=chinese'); await enter();
      assert.equal(await current(), '喜乐'); assert.ok(requests.every(path => path.startsWith('/music/chinese/')));
      await page.locator('#musicBtn').click(); await page.locator('#musicBtn').click();
      await page.waitForFunction(() => document.getElementById('bgm').dataset.trackTitle === '良辰' && !document.getElementById('bgm').paused);
      fallback = true; await page.reload(); await enter(); assert.equal(await current(), 'A'); fallback = false;
    });
    await suite.test('切到下一首被宿主阻止后重试同一首，快速暂停不能被旧请求恢复', async () => {
      await page.goto(origin); await enter(); await page.locator('#musicBtn').click();
      await page.evaluate(() => { const audio = document.getElementById('bgm'); window.savedPlay = audio.play.bind(audio); audio.play = () => { audio.play = window.savedPlay; return Promise.reject(new DOMException('isolated blocked', 'NotAllowedError')); }; });
      await page.locator('#musicBtn').click(); assert.equal(await current(), 'B');
      assert.equal(await page.locator('#bgm').evaluate(audio => audio.paused), true);
      await page.locator('#musicBtn').click(); await page.waitForFunction(() => !document.getElementById('bgm').paused); assert.equal(await current(), 'B');
      await page.locator('#musicBtn').click();
      await page.evaluate(() => { const audio = document.getElementById('bgm'); audio.play = () => new Promise(resolve => { window.finishPendingPlay = resolve; }); });
      await page.locator('#musicBtn').click(); await page.locator('#musicBtn').click();
      await page.evaluate(() => window.finishPendingPlay());
      assert.equal(await page.locator('#bgm').evaluate(audio => audio.paused), true);
      assert.equal(await page.locator('#musicBtn').evaluate(button => button.classList.contains('playing')), false);
    });
    assert.deepEqual(errors, []);
  } finally { release?.(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

function wave() {
  const samples = 22050 * 4, file = Buffer.alloc(44 + samples * 2);
  file.write('RIFF'); file.writeUInt32LE(file.length - 8, 4); file.write('WAVEfmt ', 8); file.writeUInt32LE(16, 16); file.writeUInt16LE(1, 20); file.writeUInt16LE(1, 22); file.writeUInt32LE(22050, 24); file.writeUInt32LE(44100, 28); file.writeUInt16LE(2, 32); file.writeUInt16LE(16, 34); file.write('data', 36); file.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) file.writeInt16LE(Math.round(300 * Math.sin(2 * Math.PI * 440 * i / 22050)), 44 + i * 2);
  return file;
}
