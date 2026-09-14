/** public 目录资源使用运行时地址；Vite 资源随入口模块和样式的相对路径加载。 */
export function publicAssetUrl(path, base = globalThis.__WEDDING_STATIC_BASE__ || '') {
  if (!base) return path;
  return new URL(path.replace(/^\.?\//, ''), base).href;
}
