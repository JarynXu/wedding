import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const calendar = await readFile(new URL('../public/wedding.ics', import.meta.url));

for (const mode of ['dev', 'preview']) {
  for (const base of ['/', '/invitation/']) {
    test(`${mode} ${base} 日历响应与参考服务保持一致`, async () => {
      const options = { root, base, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, hmr: false }, preview: { host: '127.0.0.1', port: 0 } };
      const server = mode === 'dev' ? await createServer(options) : await preview(options);
      try {
        if (mode === 'dev') await server.listen();
        const url = `http://127.0.0.1:${server.httpServer.address().port}${base}`;
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(url + 'wedding.ics?source=calendar', { method });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
          assert.equal(response.headers.get('content-disposition'), 'inline; filename="wedding.ics"');
          const body = Buffer.from(await response.arrayBuffer());
          assert.deepEqual(body, method === 'HEAD' ? Buffer.alloc(0) : calendar);
        }
        const home = await fetch(url);
        assert.match(home.headers.get('content-type'), /^text\/html/);
        assert.equal(home.headers.get('content-disposition'), null);
        await home.arrayBuffer();
      } finally {
        if (mode === 'dev') await server.close();
        else {
          server.httpServer.closeAllConnections();
          await new Promise(resolve => server.httpServer.close(resolve));
        }
      }
    });
  }
}
