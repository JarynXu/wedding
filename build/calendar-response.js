/** 开发与预览沿用部署服务的日历响应；静态文件、缓存和范围请求仍由 Vite 处理。 */
export function calendarResponse() {
  const configure = server => {
    const calendarPath = new URL('wedding.ics', new URL(server.config.base, 'http://vite.local/')).pathname;
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url, 'http://vite.local/').pathname;
      if (pathname === calendarPath && ['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        response.setHeader('Content-Disposition', 'inline; filename="wedding.ics"');
      }
      next();
    });
  };
  return { name: 'calendar-response', configureServer: configure, configurePreviewServer: configure };
}
