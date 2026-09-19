import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const directory = new URL('../design/classic/', import.meta.url);

test('默认迎宾页五官来自婚纱原照，设计稿中的改绘不能通过核对', async () => {
  const layout = JSON.parse(await readFile(new URL('portrait-layout.json', directory), 'utf8'));
  const record = JSON.parse(await readFile(new URL('portrait-provenance.json', directory), 'utf8'));
  const original = await readFile(new URL(layout.source, directory));
  assert.equal(createHash('sha256').update(original).digest('hex'), record.originalSha256);
  const { data: portrait, info } = await sharp(fileURLToPath(new URL('../public/assets/classic/portrait.webp', import.meta.url))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const reference = await sharp(fileURLToPath(new URL('../design/welcome-reference.png', import.meta.url))).removeAlpha().raw().toBuffer();
  for (const [index, face] of layout.faces.entries()) {
    const stored = record.faces[index];
    const maskFile = fileURLToPath(new URL(`${face.name}-matte.png`, directory));
    const matte = await sharp(maskFile).ensureAlpha().raw().toBuffer();
    const features = [...face.sourceEyes, ...(face.name === 'groom' ? [[3760, 2685], [3755, 2760]] : [[3070, 2920], [3055, 3020]])];
    for (const [x, y] of features) assert.equal(matte[((y - face.crop.top) * face.crop.width + x - face.crop.left) * 4 + 3], 255, `${face.name} 的眼鼻口保留原照`);
    const crop = await sharp(original).extract(face.crop).png().toBuffer();
    const { data: expected, info: resized } = await sharp(crop).resize({ width: stored.renderedWidth }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = await sharp(maskFile).resize({ width: stored.renderedWidth }).ensureAlpha().raw().toBuffer();
    let compared = 0;
    let maximumError = 0;
    let referenceError = 0;
    for (let y = 2; y < resized.height - 2; y++) for (let x = 2; x < resized.width - 2; x++) {
      const p = y * resized.width + x;
      if ([-2, -1, 0, 1, 2].some(d => alpha[(p + d) * 4 + 3] !== 255 || alpha[(p + d * resized.width) * 4 + 3] !== 255)) continue;
      const q = ((stored.position.top + y) * info.width + stored.position.left + x) * 3;
      for (let channel = 0; channel < 3; channel++) {
        maximumError = Math.max(maximumError, Math.abs(expected[p * 3 + channel] - portrait[q + channel]));
        referenceError = Math.max(referenceError, Math.abs(expected[p * 3 + channel] - reference[q + channel]));
      }
      compared++;
    }
    assert.ok(compared > 2000, `${face.name} 须核对面部主体`);
    assert.ok(maximumError <= 2, `${face.name} 五官像素偏差 ${maximumError} 超出取整范围`);
    assert.ok(referenceError > 10, '核对须能识别原设计稿中的人像差异');
  }
});
