import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const sourceDir = new URL('./chinese/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('portrait-layout.json', sourceDir), 'utf8'));
const source = await readFile(new URL(layout.source, sourceDir));
const garments = await readFile(new URL(layout.garments, sourceDir));
const canvas = await sharp(garments).metadata();
if (canvas.width !== layout.canvas.width || canvas.height !== layout.canvas.height) throw new Error('礼服底图尺寸与面部定位不符');

const patches = [];
const records = [];
for (const face of layout.faces) {
  const [sourceLeft, sourceRight] = face.sourceEyes;
  const [targetLeft, targetRight] = face.targetEyes;
  // 眼距确定等比缩放，眼睛中点确定平移；不改变脸部比例、五官或肤色。
  const scale = Math.hypot(targetRight[0] - targetLeft[0], targetRight[1] - targetLeft[1]) / Math.hypot(sourceRight[0] - sourceLeft[0], sourceRight[1] - sourceLeft[1]);
  const offset = [0, 1].map(axis => (targetLeft[axis] + targetRight[axis] - scale * (sourceLeft[axis] + sourceRight[axis])) / 2);
  const { left, top, width, height } = face.crop;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}"><path d="${face.outline}" fill="white"/></svg>`;
  const cropped = await sharp(source).extract(face.crop).png().toBuffer();
  const rgb = await sharp(cropped).removeAlpha().raw().toBuffer();
  const matte = await sharp(Buffer.from(svg)).blur(3).ensureAlpha().raw().toBuffer();
  // 红底和旧长发只从裁切边界连通清除，嘴唇、眼睛及眉毛不作为背景处理。
  const removed = new Uint8Array(width * height);
  const queue = [];
  const enqueue = index => {
    if (removed[index]) return;
    const [r, g, b] = rgb.subarray(index * 3, index * 3 + 3);
    const redBackdrop = r > 60 && g < 60 && b < 60 && r > 2.5 * g && r > 2.5 * b;
    const oldHair = Math.max(r, g, b) < 90;
    if (!redBackdrop && !oldHair) return;
    removed[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    if (index % width) enqueue(index - 1);
    if (index % width < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < width * height) enqueue(index + width);
  }
  for (let index = 0; index < removed.length; index++) if (removed[index]) matte[index * 4 + 3] = 0;
  const mask = await sharp(matte, { raw: { width, height, channels: 4 } }).png().toBuffer();
  await writeFile(new URL(`${face.name}-matte.png`, sourceDir), mask);
  const masked = await sharp(cropped).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const input = await sharp(masked).resize({ width: Math.round(width * scale) }).png().toBuffer();
  const position = { left: Math.round(offset[0] + left * scale), top: Math.round(offset[1] + top * scale) };
  patches.push({ input, ...position });
  records.push({ name: face.name, scale, offset, position, croppedWidth: width, renderedWidth: Math.round(width * scale), cleanedBackgroundPixels: queue.length });
}
const output = new URL('../src/assets/chinese/portrait.webp', import.meta.url);
await sharp(garments).composite(patches).webp({ lossless: true }).toFile(fileURLToPath(output));
const share = new URL('../public/share/chinese-wedding-portrait.jpg', import.meta.url);
await mkdir(new URL('../public/share/', import.meta.url), { recursive: true });
await sharp(fileURLToPath(output)).extract(layout.shareCrop).resize(600, 600).jpeg({ quality: 92, mozjpeg: true }).toFile(fileURLToPath(share));
await writeFile(new URL('portrait-provenance.json', sourceDir), JSON.stringify({
  originalSha256: createHash('sha256').update(source).digest('hex'),
  output: 'src/assets/chinese/portrait.webp',
  method: '中式礼服与盘发使用图像工具制作；脸部由原始合照等比缩放并平移合成，轮廓清除与边界连通的红底和旧发丝，仅轮廓边缘羽化，未调整五官或肤色；最终肖像使用无损 WebP。',
  faces: records,
}, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), share: fileURLToPath(share), faces: records }));
