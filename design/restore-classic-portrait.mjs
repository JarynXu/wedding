import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compositeOriginalFaces } from './portrait-composite.mjs';

/** 文字和花瓣清理完成后，从原始婚纱照恢复人像，避免重建素材时退回设计稿五官。 */
export async function restoreClassicPortrait(sharp, background) {
  const directory = new URL('./classic/', import.meta.url);
  const layout = JSON.parse(await readFile(new URL('portrait-layout.json', directory), 'utf8'));
  const dimensions = await sharp(background).metadata();
  if (dimensions.width !== layout.canvas.width || dimensions.height !== layout.canvas.height) throw new Error('法式底图尺寸与人像定位不符');
  const source = await readFile(new URL(layout.source, directory));
  const result = await compositeOriginalFaces(sharp, { source, background, faces: layout.faces });
  for (const mask of result.masks) await writeFile(new URL(`${mask.name}-matte.png`, directory), mask.buffer);
  await writeFile(new URL('portrait-provenance.json', directory), JSON.stringify({
    source: 'design/迎宾照.jpg',
    originalSha256: createHash('sha256').update(source).digest('hex'),
    output: 'src/assets/cover-welcome-art.webp',
    method: '从高分辨率婚纱原照取出面部及相邻颈部，按眼距等比缩放和平移，仅轮廓边缘羽化；保留迎宾图发型、头纱和服装，未重绘、调色或改变五官比例；最终图片为无损 WebP。',
    faces: result.records,
  }, null, 2) + '\n');
  return result.image;
}
