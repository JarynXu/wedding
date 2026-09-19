import { readFileSync } from 'node:fs';
import { resolveInvitationTheme } from '../src/invitation-theme.js';

const read = relative => readFileSync(new URL(`../${relative}`, import.meta.url));
const dataUrl = (relative, type) => `data:${type};base64,${read(relative).toString('base64')}`;

/** 开场的样式、字形和预览图进入 HTML，首帧不依赖资源请求。 */
export function criticalWelcome() {
  return {
    name: 'critical-welcome',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes('<!-- critical-welcome -->')) return html;
        const fonts = [
          ['Welcome Serif', 'welcome-serif.woff2'],
          ['Welcome Capitals', 'welcome-capitals.woff2'],
          ['Welcome Script', 'welcome-script.woff2'],
        ].map(([family, file]) => `@font-face{font-family:"${family}";src:url("${dataUrl(`public/assets/fonts/welcome/${file}`, 'font/woff2')}") format("woff2");font-weight:400;font-style:normal;font-display:block}`).join('\n');
        const css = `${fonts}\n${read('src/shell.css')}\n${read('src/glass.css')}\n:root{--welcome-preview:url("${dataUrl('public/assets/classic/loading-preview.webp', 'image/webp')}")}\n${read('src/welcome.css')}\n.invitation-loading #app > :not(#preloaderOverlay){visibility:hidden}.invitation-loading #app > #petalsCanvas[data-state="ready"]{visibility:visible}.invitation-loading > :not(#app){display:none}`;
        const chineseCss = `:root[data-theme="chinese"]{--welcome-preview:url("${dataUrl('public/assets/chinese/loading-preview.webp', 'image/webp')}")}\n${read('src/themes/chinese-welcome.css')}`;
        const themeBootstrap = `document.documentElement.dataset.theme = (${resolveInvitationTheme.toString()})(location.search);`;
        const bootstrap = read('src/bootstrap.js');
        return html
          .replace('<!-- critical-welcome -->', `<script>${themeBootstrap}</script><style id="welcome-critical">${css}\n${chineseCss}</style><script>${bootstrap}</script>`)
          .replace('<!-- invitation-mark -->', read('public/assets/shared/invitation-mark.svg').toString())
          .replace(/<link\b(?=[^>]*rel="stylesheet")[^>]*>/g, tag => tag.replace('<link', '<link data-invitation-styles media="print" onload="this.media=\'all\';this.dataset.loaded=\'true\'" onerror="this.dataset.failed=\'true\';window.invitationBootFailed()"'));
      },
    },
  };
}
