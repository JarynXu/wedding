import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp');
const directory = new URL('../design/chinese/', import.meta.url);

test('中式肖像保留原照面部像素并清除两侧红底和旧发丝', async () => {
  const layout = JSON.parse(await readFile(new URL('portrait-layout.json', directory), 'utf8'));
  const record = JSON.parse(await readFile(new URL('portrait-provenance.json', directory), 'utf8'));
  const original = await readFile(new URL(layout.source, directory));
  assert.equal(createHash('sha256').update(original).digest('hex'), record.originalSha256);
  const { data: portrait, info } = await sharp(fileURLToPath(new URL('../src/assets/chinese/portrait.webp', import.meta.url))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [index, face] of layout.faces.entries()) {
    const stored = record.faces[index];
    const maskFile = fileURLToPath(new URL(`${face.name}-matte.png`, directory));
    const matte = await sharp(maskFile).ensureAlpha().raw().toBuffer();
    for (const [x, y] of face.sourceEyes) assert.equal(matte[((y - face.crop.top) * face.crop.width + x - face.crop.left) * 4 + 3], 255, `${face.name} 的眼睛完整保留`);
    const originalCrop = await sharp(original).extract(face.crop).png().toBuffer();
    // 取自原照两侧红底／旧发丝的已核对位置；唇色不能按颜色当成红底。
    const edgePoints = face.name === 'groom' ? [[1110, 480], [1115, 500], [1390, 475], [1380, 500]] : [[490, 540], [500, 575], [525, 615], [743, 560]];
    for (const [x, y] of edgePoints) assert.equal(matte[((y - face.crop.top) * face.crop.width + x - face.crop.left) * 4 + 3], 0, `${face.name} 清除面颊两侧残留`);
    const lip = face.name === 'groom' ? [1300, 474] : [660, 585];
    assert.equal(matte[((lip[1] - face.crop.top) * face.crop.width + lip[0] - face.crop.left) * 4 + 3], 255, `${face.name} 保留原照唇部`);
    const { data: expected, info: resized } = await sharp(originalCrop).resize({ width: stored.renderedWidth }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = await sharp(maskFile).resize({ width: stored.renderedWidth }).ensureAlpha().raw().toBuffer();
    let compared = 0;
    let maximumError = 0;
    for (let y = 2; y < resized.height - 2; y++) for (let x = 2; x < resized.width - 2; x++) {
      const p = y * resized.width + x;
      // 羽化只用于轮廓；此检查取远离羽化边缘的面部内部。
      if ([-2, -1, 0, 1, 2].some(d => alpha[(p + d) * 4 + 3] !== 255 || alpha[(p + d * resized.width) * 4 + 3] !== 255)) continue;
      const q = ((stored.position.top + y) * info.width + stored.position.left + x) * 3;
      for (let channel = 0; channel < 3; channel++) maximumError = Math.max(maximumError, Math.abs(expected[p * 3 + channel] - portrait[q + channel]));
      compared++;
    }
    assert.ok(compared > 2000, `${face.name} 的核对区域须包含面部主体`);
    assert.ok(maximumError <= 2, `${face.name} 面部像素偏差 ${maximumError} 超出图像管线取整范围`);
  }
});
