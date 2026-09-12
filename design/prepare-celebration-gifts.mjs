import { createRequire } from 'node:module';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const source = process.argv[2];
if (!source) throw new Error('请传入透明礼物素材图路径');
await mkdir('design/celebration', { recursive: true });
await copyFile(source, 'design/celebration/gifts-source.png');
// 生成器的主体 alpha 峰值为 254；保持玻璃与光点的半透明过渡。
await sharp(source).resize(768, 512).webp({ quality: 90, alphaQuality: 100 }).toFile('src/assets/celebration-gifts.webp');
await writeFile('design/celebration/gifts-provenance.json', JSON.stringify({ source: 'gifts-source.png', method: 'ImageGen 生成透明六宫格，等比缩小编码 WebP', cells: ['玫瑰', '香槟', '烟花', '喜灯', '同心结', '双喜'], columns: 3, rows: 2 }, null, 2) + '\n');
