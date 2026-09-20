import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const sourceDir = new URL('./chinese/', import.meta.url);
const layout = JSON.parse(await readFile(new URL('portrait-layout.json', sourceDir), 'utf8'));
const source = await readFile(new URL(layout.source, sourceDir));
const canvas = await sharp(source).metadata();
if (canvas.width !== layout.canvas.width || canvas.height !== layout.canvas.height) throw new Error('选定源图尺寸与肖像布局不符');

// 选定成图是导出权威；无损编码保留全画面，不再重绘或合成人脸。
const image = await sharp(source).webp({ lossless: true }).toBuffer();
const thumbnail = await sharp(source).extract(layout.shareCrop).resize(600, 600).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
const output = new URL('../public/assets/chinese/portrait.webp', import.meta.url);
const share = new URL('../public/share/chinese-wedding-portrait.jpg', import.meta.url);
await mkdir(new URL('../public/share/', import.meta.url), { recursive: true });
await writeFile(output, image);
await writeFile(share, thumbnail);
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const shareHash = digest(thumbnail);
await writeFile(new URL('portrait-provenance.json', sourceDir), JSON.stringify({
  source: `design/chinese/${layout.source}`,
  sourceSha256: digest(source),
  output: 'public/assets/chinese/portrait.webp',
  outputSha256: digest(image),
  width: canvas.width,
  height: canvas.height,
  method: '用户选定的内置 image_gen 成图导出为无损 WebP，保留全画面像素；分享图从同一源图裁切。导出过程不执行人脸剪贴、重绘、调色或画面拉伸。',
  share: {
    output: 'public/share/chinese-wedding-portrait.jpg',
    sha256: shareHash,
    width: 600,
    height: 600,
    crop: layout.shareCrop,
  },
}, null, 2) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), share: fileURLToPath(share), shareVersion: shareHash.slice(0, 16) }));
