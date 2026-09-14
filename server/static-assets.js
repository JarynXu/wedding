/** 存储地址只读取部署配置，不能由宾客 URL 参数指定。 */
export function readStaticAssetBase(env = process.env) {
  const value = env.STATIC_ASSET_BASE_URL?.trim();
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('STATIC_ASSET_BASE_URL 须为完整的 HTTPS 目录地址'); }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) {
    throw new Error('STATIC_ASSET_BASE_URL 须为不含凭据、查询参数和片段的 HTTPS 目录地址');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** 只替换构建产物标签中的静态引用；内联首屏、页面链接和接口地址保持各自职责。 */
export function renderStaticAssets(html, base) {
  if (!base) return html;
  const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;');
  const rendered = html.replace(/\b(src|href)=(['"])(?:\.\/|\/)?((?:assets|share|vendor)\/[^'"<>]+)\2/g,
    (_match, name, quote, path) => `${name}=${quote}${attribute(new URL(path, base).href)}${quote}`);
  const serialized = JSON.stringify(base).replaceAll('<', '\\u003c');
  return rendered.replace(/<head\b[^>]*>/i, match => `${match}<script>globalThis.__WEDDING_STATIC_BASE__=${serialized};</script>`);
}
