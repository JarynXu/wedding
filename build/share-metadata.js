import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WEDDING_CONFIG } from '../src/config.js';
import { getShareMetadata } from '../src/share-metadata.js';
import { InvalidInvitationLinkError } from '../src/family-invitation.js';
import { renderShareMetadata } from '../src/share-html.js';

/** 分享标签进入原始 HTML，抓取方无需执行页面脚本。 */
export function shareMetadata() {
  const handleRequest = (server, preview) => {
    const base = new URL(server.config.base, 'http://vite.local/').pathname;
    const htmlPath = preview ? resolve(server.config.root, server.config.build.outDir, 'index.html') : null;
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url, 'http://vite.local/');
      if (![base, base + 'index.html'].includes(url.pathname) || !['GET', 'HEAD'].includes(request.method)) return next();
      try {
        const share = getShareMetadata(WEDDING_CONFIG, url.search);
        if (!preview) return next();
        response.setHeader('Cache-Control', 'private, no-cache');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(request.method === 'HEAD' ? undefined : renderShareMetadata(readFileSync(htmlPath, 'utf8'), share));
      } catch (error) {
        if (!(error instanceof InvalidInvitationLinkError)) return next(error);
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(error.message);
      }
    });
  };
  return {
    name: 'share-metadata',
    configureServer: server => handleRequest(server, false),
    configurePreviewServer: server => handleRequest(server, true),
    transformIndexHtml(html, context) {
      if (html.includes('<!-- calendar-entry -->') || !html.includes('<!-- share-metadata:start -->')) return html;
      const search = new URL(context.originalUrl || '/', 'http://vite.local/').search;
      return renderShareMetadata(html, getShareMetadata(WEDDING_CONFIG, search));
    },
  };
}
