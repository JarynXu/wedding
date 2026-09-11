import { WEDDING_CONFIG } from '../src/config.js';
import { getShareMetadata } from '../src/share-metadata.js';

/** 分享标签进入原始 HTML，抓取方无需执行页面脚本。 */
export function shareMetadata() {
  return {
    name: 'share-metadata',
    transformIndexHtml(html) {
      const share = getShareMetadata(WEDDING_CONFIG);
      const property = (name, content) => ({ tag: 'meta', attrs: { property: name, content: String(content) }, injectTo: 'head' });
      const meta = (name, content) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
      const title = share.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      return { html: html.replace(/<title>.*?<\/title>/, () => `<title>${title}</title>`), tags: [
        meta('description', share.description),
        property('og:title', share.title),
        property('og:description', share.description),
        property('og:image', share.image),
        property('og:image:secure_url', share.image),
        property('og:image:type', 'image/jpeg'),
        property('og:image:width', share.imageWidth),
        property('og:image:height', share.imageHeight),
        property('og:image:alt', share.imageAlt),
        property('og:url', share.url),
        property('og:type', 'website'),
        property('og:locale', 'zh_CN'),
        meta('twitter:card', 'summary'),
        meta('twitter:title', share.title),
        meta('twitter:description', share.description),
        meta('twitter:image', share.image),
        meta('twitter:image:alt', share.imageAlt),
        { tag: 'link', attrs: { rel: 'canonical', href: share.url }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'image_src', href: share.image }, injectTo: 'head' },
      ] };
    },
  };
}
