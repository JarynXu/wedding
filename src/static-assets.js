/** public 下的相对目录就是请求路径；外部存储只增加地址前缀。 */
export function publicAssetUrl(path, base = globalThis.__WEDDING_STATIC_BASE__ || '') {
  if (!base) return path;
  return new URL(path.replace(/^\.?\//, ''), base).href;
}
