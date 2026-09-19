import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

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

/** public 素材使用外部地址；应用文件与页面链接使用本站地址。 */
export function renderStaticAssets(html, base) {
  if (!base) return html;
  const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;');
  const revision = createHash('sha256').update(base).digest('hex').slice(0, 16);
  const rendered = html.replace(/\b(src|href)=(['"])(?:\.\/|\/)?((?:assets|share|vendor|music)\/[^'"<>]+)\2/g,
    (_match, name, quote, path) => `${name}=${quote}${attribute(new URL(path, base).href)}${quote}`)
    // 地址配置变化须避开浏览器中按构建文件名缓存的旧样式。
    .replace(/\bhref=(['"])((?:\.\/|\/)?app\/[^'"<>?]+\.css)\1/g,
      (_match, quote, path) => `href=${quote}${path}?static=${revision}${quote}`);
  const serialized = JSON.stringify(base).replaceAll('<', '\\u003c');
  return rendered.replace(/<head\b[^>]*>/i, match => `${match}<script>globalThis.__WEDDING_STATIC_BASE__=${serialized};</script>`);
}

/** CSS 的相对路径以样式文件为基准；数据 URL、站外资源和片段引用保留原值。 */
export function renderStaticStylesheet(css, stylesheetPath, base) {
  if (!base) return css;
  const stylesheetUrl = new URL(stylesheetPath, 'https://invitation.invalid/');
  return css.replace(/url\(\s*(?:(["'])(.*?)\1|([^'"\s)]+))\s*\)/gi, (match, _quote, quoted, bare) => {
    const value = quoted ?? bare;
    if (!value || value.startsWith('#')) return match;
    const url = new URL(value, stylesheetUrl);
    if (url.origin !== stylesheetUrl.origin || !/^\/(assets|share|vendor|music)\//.test(url.pathname)) return match;
    const target = new URL(url.pathname.slice(1) + url.search + url.hash, base);
    return `url(${JSON.stringify(target.href)})`;
  });
}

/** 启动时装配部署地址，磁盘构建文件保留同源版本。 */
export function readStaticStyles(distDir, base) {
  const styles = new Map();
  const appDir = resolve(distDir, 'app');
  if (!base || !existsSync(appDir)) return styles;
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        const path = '/' + relative(distDir, file).replaceAll('\\', '/');
        styles.set(path, renderStaticStylesheet(readFileSync(file, 'utf8'), path, base));
      }
    }
  }
  visit(appDir);
  return styles;
}
