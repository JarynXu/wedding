import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compositeOriginalFaces } from './portrait-composite.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const sourceDir = new URL('./chinese/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('portrait-layout.json', sourceDir), 'utf8'));
const source = await readFile(new URL(layout.source, sourceDir));
const garments = await readFile(new URL(layout.garments, sourceDir));
const canvas = await sharp(garments).metadata();
if (canvas.width !== layout.canvas.width || canvas.height !== layout.canvas.height) throw new Error('礼服底图尺寸与面部定位不符');

const { image, records, masks } = await compositeOriginalFaces(sharp, { source, background: garments, faces: layout.faces, clearRedBackdropAndHair: true });
for (const mask of masks) await writeFile(new URL(`${mask.name}-matte.png`, sourceDir), mask.buffer);
const output = new URL('../public/assets/chinese/portrait.webp', import.meta.url);
await writeFile(output, image);
const share = new URL('../public/share/chinese-wedding-portrait.jpg', import.meta.url);
await mkdir(new URL('../public/share/', import.meta.url), { recursive: true });
await sharp(fileURLToPath(output)).extract(layout.shareCrop).resize(600, 600).jpeg({ quality: 92, mozjpeg: true }).toFile(fileURLToPath(share));
await writeFile(new URL('portrait-provenance.json', sourceDir), JSON.stringify({
  originalSha256: createHash('sha256').update(source).digest('hex'),
  output: 'public/assets/chinese/portrait.webp',
  method: '中式礼服与盘发使用图像工具制作；脸部由原始合照等比缩放并平移合成，轮廓清除与边界连通的红底和旧发丝，仅轮廓边缘羽化，未调整五官或肤色；最终肖像使用无损 WebP。',
  faces: records,
}, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), share: fileURLToPath(share), faces: records }));
