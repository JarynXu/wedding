import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { WEDDING_CONFIG } from '../src/config.js';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const directory = new URL('../design/chinese/', import.meta.url);
const approvedSourceSha256 = 'fac6de04eef9e2677e302a1ee63f0ec92e9e1976a301f82c7ad1ce5ded1ce532';
const digest = data => createHash('sha256').update(data).digest('hex');

test('中式迎宾图保留选定生成稿的全画面像素与原生尺寸', async () => {
  const layout = JSON.parse(await readFile(new URL('portrait-layout.json', directory), 'utf8'));
  const record = JSON.parse(await readFile(new URL('portrait-provenance.json', directory), 'utf8'));
  assert.equal(layout.source, 'portrait-source.png');
  assert.deepEqual(layout.canvas, { width: 1024, height: 1536 });
  assert.equal(record.source, 'design/chinese/portrait-source.png');
  assert.equal(record.output, 'public/assets/chinese/portrait.webp');

  const source = await readFile(new URL(layout.source, directory));
  const output = await readFile(new URL('../public/assets/chinese/portrait.webp', import.meta.url));
  assert.equal(digest(source), approvedSourceSha256, '源稿须为用户选定的生成图');
  assert.equal(record.sourceSha256, digest(source));
  assert.equal(record.outputSha256, digest(output));
  assert.equal(record.width, 1024);
  assert.equal(record.height, 1536);

  const { data: expected, info: sourceInfo } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: portrait, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(sourceInfo.width, 1024);
  assert.equal(sourceInfo.height, 1536);
  assert.equal(info.width, sourceInfo.width);
  assert.equal(info.height, sourceInfo.height);
  assert.equal(info.channels, sourceInfo.channels);
  assert.ok(portrait.equals(expected), '无损导出须保留脸部、身材、衣饰与地毯的全部像素');
});

test('中式分享缩略图记录来源裁切，分享地址使用实际图片的内容版本', async () => {
  const layout = JSON.parse(await readFile(new URL('portrait-layout.json', directory), 'utf8'));
  const record = JSON.parse(await readFile(new URL('portrait-provenance.json', directory), 'utf8'));
  const share = await readFile(new URL('../public/share/chinese-wedding-portrait.jpg', import.meta.url));
  const shareUrl = new URL(WEDDING_CONFIG.share.chineseImage, WEDDING_CONFIG.share.siteUrl);
  assert.deepEqual(layout.shareCrop, { left: 280, top: 100, width: 500, height: 500 });
  assert.equal(record.share.output, 'public/share/chinese-wedding-portrait.jpg');
  assert.deepEqual(record.share.crop, layout.shareCrop);
  assert.equal(record.share.sha256, digest(share));
  assert.equal(record.share.width, 600);
  assert.equal(record.share.height, 600);
  assert.equal(shareUrl.pathname, '/share/chinese-wedding-portrait.jpg');
  assert.equal(shareUrl.searchParams.get('v'), digest(share).slice(0, 16));
  const thumbnail = await sharp(share).metadata();
  assert.equal(thumbnail.width, 600);
  assert.equal(thumbnail.height, 600);
});

test('迎宾装饰保留花簇与灯笼，中央人物区域透明', async () => {
  const frame = await readFile(new URL('../public/assets/chinese/portrait-frame.png', import.meta.url));
  const record = JSON.parse(await readFile(new URL('portrait-frame-provenance.json', directory), 'utf8'));
  const reference = await readFile(new URL('portrait-frame-reference.webp', directory));
  assert.equal(record.sourceSha256, digest(reference));
  assert.equal(record.outputSha256, digest(frame));
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 887);
  assert.equal(info.height, 1774);
  const alpha = (x, y) => data[(y * info.width + x) * info.channels + 3];
  for (let y = 370; y < 1420; y++) for (let x = 220; x < 770; x++) {
    // 8 位透明通道允许一个量化级；旧人物的可见像素不能留在装饰层。
    assert.ok(alpha(x, y) <= 1, `旧人物区域须透明：${x},${y}`);
  }
  for (const [x, y] of [[65, 105], [851, 125], [60, 595], [678, 212], [860, 440], [60, 1650], [774, 1658]]) {
    assert.ok(alpha(x, y) > 200, `花簇、木框和灯笼须保留：${x},${y}`);
  }
});
