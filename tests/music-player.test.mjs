import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import express from 'express';
import { createInvitationApp } from '../server/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

test('播放器长按歌单、点选播放与手势边界', { timeout: 90000 }, async suite => {
  const app = express(), audio = wave();
  let trackCount = 3;
  app.get('/music/:theme/playlist.json', (request, response) => response.json({ tracks: Array.from({ length: trackCount }, (_, index) => ({ file: `${index}.wav`, title: trackCount > 3 ? `第 ${index + 1} 首测试曲目 · 较长的歌曲名称与演唱者` : `${request.params.theme} 曲目 ${index + 1}` })) }));
  app.get('/music/:theme/:file', (_request, response) => response.type('audio/wav').send(audio));
  app.use(createInvitationApp());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const enter = async page => {
    await page.goto(`${origin}/?theme=chinese`);
    await page.locator('#preloaderOverlay[data-state="ready"]').waitFor();
    await page.locator('#btnEnterInvitation').click();
    await page.locator('#preloaderOverlay').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.getElementById('bgm').paused);
  };
  const state = page => page.locator('#bgm').evaluate(audio => ({ index: audio.dataset.trackIndex, paused: audio.paused }));
  const holdMouse = async page => {
    const box = await page.locator('#musicBtn').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.locator('#musicPlaylist[open]').waitFor({ timeout: 2000 });
    await page.mouse.up();
  };
  try {
    await suite.test('长按不暂停，松手保持歌单；点选与暂停后选当前曲目不误跳下一首', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 752 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        await enter(page);
        assert.doesNotMatch(await page.locator('.music-player').textContent(), /长按选歌/);
        assert.doesNotMatch(await page.locator('#musicBtn').getAttribute('title'), /长按/);
        assert.equal(await page.locator('#musicTip').evaluate(tip => tip.classList.contains('fade-out')), true);
        const before = await state(page);
        await holdMouse(page);
        assert.equal(await page.locator('#musicBtn').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#musicPlaylist .music-track').count(), 3);
        assert.deepEqual(await state(page), before);
        await page.locator('button[data-track-index="2"]').click();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '2' && !document.getElementById('bgm').paused);
        assert.equal(await page.locator('button[data-track-index="2"]').getAttribute('aria-current'), 'true');
        await page.keyboard.press('Escape');
        await page.locator('#musicPlaylist[open]').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.activeElement.id), 'musicBtn');
        assert.equal(await page.locator('#musicTip').evaluate(tip => tip.classList.contains('fade-out')), true);
        await page.locator('#musicBtn').click();
        assert.deepEqual(await state(page), { index: '2', paused: true });
        await holdMouse(page);
        assert.deepEqual(await state(page), { index: '2', paused: true });
        await page.locator('button[data-track-index="2"]').click();
        await page.waitForFunction(() => !document.getElementById('bgm').paused);
        assert.equal((await state(page)).index, '2');
        await page.locator('.music-playlist-close').click();
        await page.locator('#musicPlaylist[open]').waitFor({ state: 'hidden' });
        await page.locator('#musicBtn').click();
        assert.equal((await state(page)).paused, true);
        await page.locator('#musicBtn').click();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '0' && !document.getElementById('bgm').paused);
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });

    await suite.test('真实触摸长按与移动取消；关闭后普通点按仍可用', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 752 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      try {
        await enter(page);
        const session = await page.context().newCDPSession(page);
        const box = await page.locator('#musicBtn').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await page.locator('#musicPlaylist[open]').waitFor({ timeout: 2000 });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('#musicPlaylist').evaluate(dialog => dialog.open), true);
        assert.deepEqual(await state(page), { index: '0', paused: false });
        await page.locator('button[data-track-index="1"]').tap();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '1' && !document.getElementById('bgm').paused);
        await page.touchscreen.tap(5, 600);
        await page.locator('#musicPlaylist[open]').waitFor({ state: 'hidden' });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 35, y: y + 30, id: 1 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // 覆盖长按阈值，确认已取消的计时器不会再打开窗口。
        await page.waitForTimeout(650);
        assert.equal(await page.locator('#musicPlaylist').evaluate(dialog => dialog.open), false);
        assert.deepEqual(await state(page), { index: '1', paused: false });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }, { x: x - 80, y: y + 40, id: 2 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(650);
        assert.equal(await page.locator('#musicPlaylist').evaluate(dialog => dialog.open), false);
        assert.deepEqual(await state(page), { index: '1', paused: false });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.waitForTimeout(650);
        assert.equal(await page.locator('#musicPlaylist').evaluate(dialog => dialog.open), false);
        await page.locator('#musicBtn').tap();
        assert.equal((await state(page)).paused, true);
        await session.detach();
      } finally { await page.close(); }
    });

    await suite.test('键盘选曲、播放失败与重试保留当前选择，切歌可离线', async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 752 }, reducedMotion: 'reduce' });
      try {
        await enter(page);
        await page.locator('#musicBtn').focus(); await page.keyboard.press('ArrowDown');
        await page.locator('#musicPlaylist[open]').waitFor();
        assert.equal(await page.evaluate(() => document.activeElement.dataset.trackIndex), '0');
        await page.evaluate(() => {
          const audio = document.getElementById('bgm'), play = audio.play.bind(audio);
          audio.play = () => { audio.play = play; return Promise.reject(new DOMException('isolated blocked playback', 'NotAllowedError')); };
        });
        await page.locator('button[data-track-index="1"]').focus(); await page.keyboard.press('Enter');
        await page.locator('.music-playlist-feedback:not([hidden])').waitFor();
        assert.match(await page.locator('button[data-track-index="1"]').textContent(), /未播放/);
        assert.deepEqual(await state(page), { index: '1', paused: true });
        await page.context().setOffline(true);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.getElementById('bgm').paused);
        assert.equal((await state(page)).index, '1');
        assert.equal(await page.locator('.music-playlist-feedback').isVisible(), false);
        await page.locator('button[data-track-index="2"]').click();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '2' && !document.getElementById('bgm').paused);
        await page.evaluate(() => {
          const audio = document.getElementById('bgm'), play = audio.play.bind(audio);
          audio.play = () => { audio.play = play; return new Promise(resolve => { window.finishPreviousSelection = resolve; }); };
        });
        await page.locator('button[data-track-index="0"]').click();
        await page.locator('button[data-track-index="2"]').click();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '2' && !document.getElementById('bgm').paused);
        await page.evaluate(() => window.finishPreviousSelection());
        assert.deepEqual(await state(page), { index: '2', paused: false });
        await page.keyboard.press('Escape');
      } finally { await page.context().setOffline(false); await page.close(); }
    });

    await suite.test('长歌单在手机与桌面内滚动，选中曲目和关闭按钮可触达', async () => {
      trackCount = 12;
      const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' });
      try {
        await enter(page); await holdMouse(page);
        for (const [width, height] of [[320, 568], [390, 420], [430, 932], [1440, 1000]]) {
          await page.setViewportSize({ width, height });
          const layout = await page.locator('#musicPlaylist').evaluate(dialog => {
            const rect = dialog.getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect(), close = dialog.querySelector('.music-playlist-close').getBoundingClientRect(), list = dialog.querySelector('ol');
            return { fits: rect.left >= app.left && rect.right <= app.right && rect.top >= app.top && rect.bottom <= Math.min(app.bottom, innerHeight), closeFits: close.top >= rect.top && close.bottom <= rect.bottom, scrolls: list.scrollHeight > list.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth };
          });
          assert.deepEqual(layout, { fits: true, closeFits: true, scrolls: true, overflow: false });
        }
        await page.locator('button[data-track-index="11"]').click();
        await page.waitForFunction(() => document.getElementById('bgm').dataset.trackIndex === '11' && !document.getElementById('bgm').paused);
        if (process.env.WEDDING_QA_DIR) await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, 'music-playlist-many.png') });
      } finally { await page.close(); }
    });
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

function wave() {
  const samples = 22050 * 60, file = Buffer.alloc(44 + samples * 2);
  file.write('RIFF'); file.writeUInt32LE(file.length - 8, 4); file.write('WAVEfmt ', 8); file.writeUInt32LE(16, 16); file.writeUInt16LE(1, 20); file.writeUInt16LE(1, 22); file.writeUInt32LE(22050, 24); file.writeUInt32LE(44100, 28); file.writeUInt16LE(2, 32); file.writeUInt16LE(16, 34); file.write('data', 36); file.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) file.writeInt16LE(Math.round(300 * Math.sin(2 * Math.PI * 440 * index / 22050)), 44 + index * 2);
  return file;
}
