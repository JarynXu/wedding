/** 按原照眼距等比缩放并平移；面部不做形变、调色或生成式重绘。 */
export async function compositeOriginalFaces(sharp, { source, background, faces, clearRedBackdropAndHair = false }) {
  const patches = [];
  const masks = [];
  const records = [];
  for (const face of faces) {
    const [sourceLeft, sourceRight] = face.sourceEyes;
    const [targetLeft, targetRight] = face.targetEyes;
    const scale = Math.hypot(targetRight[0] - targetLeft[0], targetRight[1] - targetLeft[1]) / Math.hypot(sourceRight[0] - sourceLeft[0], sourceRight[1] - sourceLeft[1]);
    const offset = [0, 1].map(axis => (targetLeft[axis] + targetRight[axis] - scale * (sourceLeft[axis] + sourceRight[axis])) / 2);
    const { left, top, width, height } = face.crop;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}"><path d="${face.outline}" fill="white"/></svg>`;
    const cropped = await sharp(source).extract(face.crop).png().toBuffer();
    const matte = await sharp(Buffer.from(svg)).blur(face.feather ?? 3).ensureAlpha().raw().toBuffer();
    // 较大羽化半径的整数卷积会把不透明区降到 253；恢复峰值，避免五官混入底图。
    let peakAlpha = 0;
    for (let i = 3; i < matte.length; i += 4) peakAlpha = Math.max(peakAlpha, matte[i]);
    if (!peakAlpha) throw new Error(`面部蒙版为空：${face.name}`);
    if (peakAlpha < 255) for (let i = 3; i < matte.length; i += 4) matte[i] = Math.round(matte[i] * 255 / peakAlpha);
    const cleanedBackgroundPixels = clearRedBackdropAndHair
      ? clearConnectedBackdrop(await sharp(cropped).removeAlpha().raw().toBuffer(), matte, width, height) : 0;
    const mask = await sharp(matte, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const masked = await sharp(cropped).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    const input = await sharp(masked).resize({ width: Math.round(width * scale) }).png().toBuffer();
    const position = { left: Math.round(offset[0] + left * scale), top: Math.round(offset[1] + top * scale) };
    patches.push({ input, ...position });
    masks.push({ name: face.name, buffer: mask });
    records.push({ name: face.name, scale, offset, position, croppedWidth: width, renderedWidth: Math.round(width * scale), cleanedBackgroundPixels });
  }
  return { image: await sharp(background).composite(patches).webp({ lossless: true }).toBuffer(), masks, records };
}

/** 仅清除与裁切边界连通的红底和旧长发，保留唇色、眼睛和眉毛。 */
function clearConnectedBackdrop(rgb, matte, width, height) {
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
  return queue.length;
}
