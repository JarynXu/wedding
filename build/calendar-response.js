import { WEDDING_CONFIG } from '../src/config.js';
import { getInvitationEvent } from '../src/invitation-event.js';
import { createAllDayCalendar } from '../src/invitation-calendar.js';

/** 开发与预览沿用部署服务的日历响应；静态文件、缓存和范围请求仍由 Vite 处理。 */
export function calendarResponse() {
  const huimenCalendar = createAllDayCalendar(WEDDING_CONFIG, getInvitationEvent(WEDDING_CONFIG, '?event=huimen'));
  const configure = server => {
    const calendarPath = new URL('wedding.ics', new URL(server.config.base, 'http://vite.local/')).pathname;
    const huimenPath = new URL('huimen.ics', new URL(server.config.base, 'http://vite.local/')).pathname;
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url, 'http://vite.local/').pathname;
      if ([calendarPath, huimenPath].includes(pathname) && ['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        response.setHeader('Content-Disposition', `inline; filename="${pathname === huimenPath ? 'huimen' : 'wedding'}.ics"`);
        if (pathname === huimenPath && server.transformIndexHtml) {
          response.setHeader('Cache-Control', 'no-cache');
          response.setHeader('Content-Length', Buffer.byteLength(huimenCalendar));
          response.end(request.method === 'HEAD' ? undefined : huimenCalendar);
          return;
        }
      }
      next();
    });
  };
  return {
    name: 'calendar-response', configureServer: configure, configurePreviewServer: configure,
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'huimen.ics', source: huimenCalendar }); },
  };
}
