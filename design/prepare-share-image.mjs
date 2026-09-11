import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { WEDDING_CONFIG } from '../src/config.js';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const source = fileURLToPath(new URL('../src/assets/cover-welcome-art.webp', import.meta.url));
const destination = fileURLToPath(new URL(`../public${WEDDING_CONFIG.share.image}`, import.meta.url));
const { width, height } = await sharp(source).metadata();
if (width !== 941 || height !== 1672) throw new Error('分享裁切坐标对应当前 941 × 1672 的迎宾照');

// 保留原照的面部、姿态与色彩；方图以两人头部和上半身为中心，不叠加小字。
const crop = { left: 135, top: 330, width: 670, height: 670 };
await mkdir(dirname(destination), { recursive: true });
const result = await sharp(source).extract(crop)
  .resize(WEDDING_CONFIG.share.imageWidth, WEDDING_CONFIG.share.imageHeight)
  .jpeg({ quality: 88, mozjpeg: true }).toFile(destination);
const layout = { source: 'src/assets/cover-welcome-art.webp', output: `public${WEDDING_CONFIG.share.image}`, crop, width: result.width, height: result.height, bytes: result.size, method: '原照裁切与缩放，未重绘人物或调整肤色' };
await writeFile(new URL('./share-image-layout.json', import.meta.url), JSON.stringify(layout, null, 2) + '\n');
console.log(JSON.stringify(layout));
