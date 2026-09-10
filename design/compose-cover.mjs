import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const source = fileURLToPath(new URL('../src/assets/card01_bg.jpg', import.meta.url));
const destination = fileURLToPath(new URL('../src/assets/cover-portrait-paper.webp', import.meta.url));
const { data: photo, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const output = Buffer.alloc(photo.length);
const mask = Buffer.alloc(width * height);

const smooth = (start, end, value) => {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

let seed = 17102026;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const u = x / width;
    const v = y / height;
    const i = (y * width + x) * 3;
    // 照片主体保持不透明；纸面过渡限于底部 5% 高度。
    const alpha = 1 - smooth(0.745, 0.795, v);
    mask[y * width + x] = Math.round(alpha * 255);

    // 保护肤色与暗部层次；环境的中高亮区域校正黄偏色。
    const bride = Math.hypot((u - 0.405) / 0.145, (v - 0.348) / 0.088);
    const groom = Math.hypot((u - 0.615) / 0.14, (v - 0.293) / 0.078);
    const luminance = photo[i] * 0.2126 + photo[i + 1] * 0.7152 + photo[i + 2] * 0.0722;
    const toneAmount = smooth(0.75, 1.25, Math.min(bride, groom)) * smooth(55, 160, luminance);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed / 4294967296 - 0.5) * 2.6;
    const shade = 2.5 * Math.pow(Math.abs(u - 0.5) * 2, 2);
    const paper = [245 - shade, 237 - shade, 225 - shade];
    const slope = [0.985, 0.995, 1.025];
    for (let channel = 0; channel < 3; channel++) {
      const original = photo[i + channel];
      const graded = original + (original * slope[channel] - original) * toneAmount;
      output[i + channel] = Math.round(Math.min(255, Math.max(0,
        graded * alpha + (paper[channel] + grain) * (1 - alpha),
      )));
    }
  }
}

await sharp(output, { raw: { width, height, channels: 3 } }).webp({ quality: 92 }).toFile(destination);
await sharp(mask, { raw: { width, height, channels: 1 } }).png().toFile(fileURLToPath(new URL('./cover-portrait-mask.png', import.meta.url)));
await writeFile(fileURLToPath(new URL('./cover-composite.json', import.meta.url)), JSON.stringify({
  source: 'src/assets/card01_bg.jpg',
  output: 'src/assets/cover-portrait-paper.webp',
  mask: 'design/cover-portrait-mask.png',
  width,
  height,
  method: '照片主体保留不透明度、肤色及暗部层次；纸面过渡限于底部 74.5%–79.5% 区域；未使用图像生成或人物重绘。',
}, null, 2) + '\n');
console.log(JSON.stringify({ destination, width, height }));
