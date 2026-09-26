import { readFileSync } from 'node:fs';
import { WEDDING_CONFIG } from '../src/config.js';
import { resolveInvitationTheme } from '../src/invitation-theme.js';

/** 日历直达页的文字、样式和操作脚本内嵌到 HTML，不引入请柬媒体资源。 */
export function calendarEntry() {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return {
    name: 'calendar-entry',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes('<!-- calendar-entry -->')) return html;
        const config = WEDDING_CONFIG;
        const fields = {
          couple: `${config.groom.name} & ${config.bride.name}`,
          date: `${config.date.formattedFullZh} · ${config.date.dayOfWeekZh}`,
          arrival: config.schedule[0].time,
          ceremony: config.date.ceremonyTime,
          venue: `${config.venue.name} · ${config.venue.hall}`,
          address: config.venue.address,
        };
        for (const [name, value] of Object.entries(fields)) html = html.replaceAll(`{{${name}}}`, escape(value));
        const emblem = read('public/assets/shared/invitation-mark.svg');
        return html
          .replace('<!-- calendar-icon -->', `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${Buffer.from(emblem).toString('base64')}">`)
          .replace('<!-- invitation-mark -->', emblem)
          .replace('<!-- calendar-style -->', `<script>document.documentElement.dataset.theme = (${resolveInvitationTheme.toString()})(location.search);</script><style>${read('src/calendar-entry.css')}</style>`)
          .replace('<!-- calendar-script -->', `<script>${read('src/calendar-entry.js')}</script>`);
      },
    },
  };
}
