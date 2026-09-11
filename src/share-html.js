const SHARE_BLOCK = /<!-- share-metadata:start -->[\s\S]*?<!-- share-metadata:end -->/;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** 构建与请求响应共用 HTML 编码，URL 中的署名始终按文本写入属性。 */
export function renderShareMetadata(html, share) {
  if (!SHARE_BLOCK.test(html)) throw new Error('请柬缺少分享信息标记，请重新构建');
  const property = (name, value) => `<meta property="${name}" content="${escape(value)}">`;
  const meta = (name, value) => `<meta name="${name}" content="${escape(value)}">`;
  const tags = [
    meta('description', share.description), property('og:title', share.title),
    property('og:description', share.description), property('og:image', share.image),
    property('og:image:secure_url', share.image), property('og:image:type', 'image/jpeg'),
    property('og:image:width', share.imageWidth), property('og:image:height', share.imageHeight),
    property('og:image:alt', share.imageAlt), property('og:url', share.url),
    property('og:type', 'website'), property('og:locale', 'zh_CN'),
    meta('twitter:card', 'summary'), meta('twitter:title', share.title),
    meta('twitter:description', share.description), meta('twitter:image', share.image),
    meta('twitter:image:alt', share.imageAlt),
    `<link rel="canonical" href="${escape(share.url)}">`,
    `<link rel="image_src" href="${escape(share.image)}">`,
  ];
  return html.replace(/<html\b[^>]*>/, tag => tag.replace(/\sdata-theme="[^"]*"/, '').replace('>', ` data-theme="${share.theme}">`))
    .replace(/<title>.*?<\/title>/, () => `<title>${escape(share.title)}</title>`)
    .replace(SHARE_BLOCK, () => `<!-- share-metadata:start -->\n${tags.join('\n')}\n<!-- share-metadata:end -->`);
}
