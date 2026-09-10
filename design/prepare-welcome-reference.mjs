import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const source = fileURLToPath(new URL('./welcome-reference.png', import.meta.url));
const asset = name => fileURLToPath(new URL(`../src/assets/${name}`, import.meta.url));
const { data: original, info: { width, height } } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
if (width !== 941 || height !== 1672) throw new Error('蒙版坐标对应 941 × 1672 的选定方案');

const isGold = (r, g, b) => r - g > 10 && g - b > 12 && (r + g + b) / 3 < 218;
const isType = (r, g, b) => r - g > 10 && 0.21 * r + 0.72 * g + 0.07 * b < 208;

// 角花从参考图提取，页面边框根据屏幕比例独立排布。
const corner = { left: 832, top: 0, width: 109, height: 110 };
const cornerPixels = Buffer.alloc(corner.width * corner.height * 4);
for (let y = 0; y < corner.height; y++) {
  for (let x = 0; x < corner.width; x++) {
    const i = ((y + corner.top) * width + x + corner.left) * 3;
    const [r, g, b] = original.subarray(i, i + 3);
    const j = (y * corner.width + x) * 4;
    cornerPixels[j] = 177;
    cornerPixels[j + 1] = 137;
    cornerPixels[j + 2] = 82;
    cornerPixels[j + 3] = isGold(r, g, b) ? Math.min(255, Math.round((242 - (r + g + b) / 3) * 2.6)) : 0;
  }
}
await sharp(cornerPixels, { raw: { width: corner.width, height: corner.height, channels: 4 } }).webp({ lossless: true }).toFile(asset('cover-frame-corner.webp'));

const seedMask = new Uint8Array(width * height);
function mark([left, top, right, bottom], predicate) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 3;
      if (predicate(original[i], original[i + 1], original[i + 2])) seedMask[y * width + x] = 1;
    }
  }
}

// 文字区域与人物区域分离；保留底部迎宾牌及分隔饰线。
for (const bounds of [
  [331, 138, 625, 174],
  [269, 189, 685, 246],
  [328, 300, 619, 331],
  [356, 334, 630, 357],
  [225, 1273, 749, 1430],
  [328, 1430, 647, 1463],
  [307, 1501, 637, 1544],
]) mark(bounds, isType);

// 独立花瓣及其投影来自原图；花束和左下的散焦枝叶保留。
const staticPetals = [
  [813, 62, 895, 151],
  [47, 509, 125, 592],
  [763, 414, 841, 486],
  [839, 982, 1004, 1133],
  [-45, 1232, 102, 1345],
  [2, 1315, 113, 1412],
  [789, 1481, 923, 1623],
  [20, 1522, 220, 1668],
];
for (const [left, top, right, bottom] of staticPetals) {
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) for (let x = Math.max(0, left); x < Math.min(width, right); x++) {
    if (((x - cx) / ((right - left) / 2)) ** 2 + ((y - cy) / ((bottom - top) / 2)) ** 2 <= 1) {
      seedMask[y * width + x] = 1;
    }
  }
}

// 扩展两像素清理文字抗锯齿边缘。
const mask = new Uint8Array(seedMask.length);
for (let i = 0; i < seedMask.length; i++) {
  if (!seedMask[i]) continue;
  const x = i % width;
  const y = Math.floor(i / width);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) mask[(y + dy) * width + x + dx] = 1;
  }
}
const pixels = new Float32Array(original);
const known = Uint8Array.from(mask, value => 1 - value);
const marked = [];
const neighbours = i => {
  const x = i % width;
  const y = Math.floor(i / width);
  return [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1].filter(value => value >= 0);
};
let front = [];
for (let i = 0; i < mask.length; i++) if (mask[i]) {
  marked.push(i);
  if (neighbours(i).some(j => known[j])) front.push(i);
}
// 从邻接背景向笔画内部补色，迭代只作用于蒙版内。
const queued = new Set(front);
for (let cursor = 0; cursor < front.length; cursor++) {
  const i = front[cursor];
  const adjacent = neighbours(i).filter(j => known[j]);
  if (!adjacent.length) throw new Error('修补区域缺少背景边界');
  for (let channel = 0; channel < 3; channel++) pixels[i * 3 + channel] = adjacent.reduce((sum, j) => sum + pixels[j * 3 + channel], 0) / adjacent.length;
  known[i] = 1;
  for (const j of neighbours(i)) if (!known[j] && !queued.has(j)) { queued.add(j); front.push(j); }
}
for (let pass = 0; pass < 100; pass++) {
  for (const i of marked) {
    const adjacent = neighbours(i);
    for (let channel = 0; channel < 3; channel++) pixels[i * 3 + channel] = adjacent.reduce((sum, j) => sum + pixels[j * 3 + channel], 0) / adjacent.length;
  }
}
const output = Buffer.from(pixels.map(value => Math.round(value)));
// 花瓣曾覆盖金框，修补区域内重绘细线，避免把红色投影误保留为金色。
function restoreGold(x, y, alpha) {
  const i = y * width + x;
  if (!mask[i]) return;
  const gold = [179, 141, 91];
  for (let channel = 0; channel < 3; channel++) output[i * 3 + channel] = Math.round(output[i * 3 + channel] * (1 - alpha) + gold[channel] * alpha);
}
for (const [x, alpha] of [[19, 0.8], [20, 0.32], [27, 0.35], [28, 0.82], [29, 0.3], [912, 0.84], [913, 0.34], [920, 0.35], [921, 0.75]]) {
  for (let y = 45; y <= 1641; y++) restoreGold(x, y, alpha);
}
for (const [y, alpha] of [[1632, 0.35], [1633, 0.75], [1641, 0.84], [1642, 0.3]]) {
  for (let x = 28; x <= 912; x++) restoreGold(x, y, alpha);
}
for (let y = 0; y < corner.height; y++) for (let x = 0; x < corner.width; x++) {
  restoreGold(corner.width - 1 - x, height - 1 - y, cornerPixels[(y * corner.width + x) * 4 + 3] / 255);
  restoreGold(width - corner.width + x, height - 1 - y, cornerPixels[(y * corner.width + x) * 4 + 3] / 255);
}
await sharp(output, { raw: { width, height, channels: 3 } }).webp({ quality: 94 }).toFile(asset('cover-welcome-art.webp'));
await sharp(Buffer.from(mask.map(value => value * 255)), { raw: { width, height, channels: 1 } }).png().toFile(fileURLToPath(new URL('./welcome-cleanup-mask.png', import.meta.url)));
const portraitRegions = [[270, 474, 456, 706], [445, 375, 645, 665], [200, 600, 795, 1240]];
const protectedPortrait = marked.every(i => !portraitRegions.some(([left, top, right, bottom]) => i % width >= left && i % width <= right && Math.floor(i / width) >= top && Math.floor(i / width) <= bottom));
if (!protectedPortrait) throw new Error('清理蒙版侵入人物保护区');
await writeFile(fileURLToPath(new URL('./welcome-reference-layout.json', import.meta.url)), JSON.stringify({ width, height, source: 'welcome-reference.png', background: 'src/assets/cover-welcome-art.webp', modifiedPixels: marked.length, textIsLiveHtml: true, removedStaticPetals: staticPetals, protectedPortrait }, null, 2) + '\n');
console.log(JSON.stringify({ width, height, modifiedPixels: marked.length, removedStaticPetals: staticPetals.length, protectedPortrait }));
