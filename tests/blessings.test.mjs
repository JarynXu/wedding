import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBlessing, parseCursor } from '../server/blessings/model.js';
import { readBlessingsConfig } from '../server/blessings/config.js';
import { createInvitationApp } from '../server/app.js';
import { databaseUrl, fixture, payload, post, stream, waitFor } from './blessings-fixture.mjs';

test('祝福边界：文本、礼物、主题、幂等键、游标与显式错误配置', () => {
  assert.equal(validateBlessing(payload({ name: ' ', text: ' 恭喜 ' })).name, '一位亲友');
  assert.equal(validateBlessing(payload({ text: '', gift: 'lantern', theme: 'chinese' })).gift, 'lantern');
  assert.equal(validateBlessing(payload({ text: '💐'.repeat(120) })).text.length, 240);
  for (const bad of [{ text: '', gift: '' }, { text: '字'.repeat(121) }, { name: '名'.repeat(25) }, { gift: 'lantern' }, { gift: 'unknown' }, { clientId: 'bad' }, { requestId: null }, { text: '\u0000' }, { theme: 'unknown' }]) assert.throws(() => validateBlessing(payload(bad)));
  for (const cursor of ['-1', '1e2', '00', '9223372036854775808', '<script>']) assert.throws(() => parseCursor(cursor));
  assert.equal(parseCursor('9223372036854775807'), '9223372036854775807');
  assert.equal(readBlessingsConfig({}), null);
  assert.throws(() => readBlessingsConfig({ BLESSINGS_ENABLED: 'true' }));
  assert.throws(() => readBlessingsConfig({ BLESSINGS_ENABLED: 'yes' }));
});

test('未配置数据库：明确关闭，发送不能伪装成功', async () => {
  const server = createInvitationApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(origin + '/api/blessings/config')).json(), { enabled: false });
    assert.equal((await post(origin, payload())).status, 503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('PostgreSQL：跨实例实时消息、重放、历史、幂等与失败', { skip: !databaseUrl && '需要 BLESSINGS_TEST_DATABASE_URL 指向隔离 PostgreSQL', timeout: 60000 }, async suite => {
  const f = await fixture(); let live;
  try {
    const a = await f.instance(); const b = await f.instance();
    live = await stream(b.origin);
    assert.equal(live.response.headers.get('content-encoding'), null);
    assert.match(live.response.headers.get('content-type'), /text\/event-stream/);
    await live.take(event => event.type === 'sync');
    let first;
    await suite.test('写入实例 A，实例 B 的 SSE 收到一次已保存内容', async () => {
      const message = payload({ name: '<img onerror=alert(1)>', text: '测试祝福 💐', gift: 'rose' });
      const response = await post(a.origin, message); assert.equal(response.status, 201);
      first = (await response.json()).message;
      assert.equal(first.name, message.name);
      const event = await live.take(event => event.type === 'blessing' && event.data.id === first.id);
      assert.equal(event.data.text, message.text);
      assert.deepEqual(Object.keys(event.data).sort(), ['id', 'name', 'text', 'gift', 'giftName', 'theme', 'createdAt'].sort());
      const retry = await post(b.origin, message); assert.equal(retry.status, 200); assert.equal((await retry.json()).message.id, first.id);
      assert.equal((await post(a.origin, { ...message, text: '改变内容' })).status, 409);
      assert.equal((await post(a.origin, payload(), { Origin: 'https://evil.test' })).status, 403);
      assert.equal(live.events.filter(event => event.type === 'blessing' && event.data.id === first.id).length, 1);
    });
    await suite.test('并发写入按提交顺序重放；断线重连无缺失', async () => {
      await live.close();
      const saved = await Promise.all(Array.from({ length: 35 }, (_, i) => post(i % 2 ? a.origin : b.origin, payload({ text: `并发祝福 ${i}` })).then(async response => { assert.equal(response.status, 201); return (await response.json()).message; })));
      live = await stream(b.origin, first.id);
      const sync = await live.take(event => event.type === 'sync');
      assert.equal(sync.data.messages.length, 35);
      assert.deepEqual(sync.data.messages.map(message => message.id), saved.map(message => message.id).sort((a, b) => Number(BigInt(a) - BigInt(b))));
      const history = await (await fetch(a.origin + '/api/blessings/history')).json();
      assert.equal(history.messages.length, 30); assert.equal(history.hasMore, true);
      const older = await (await fetch(b.origin + '/api/blessings/history?before=' + history.next)).json();
      assert.equal(older.messages.length, 6); assert.equal(older.hasMore, false);
      assert.equal(new Set([...history.messages, ...older.messages].map(message => message.id)).size, 36);
      assert.equal((await fetch(a.origin + '/api/blessings/history?before=1&before=2')).status, 400);
    });
    await suite.test('新实例从数据库恢复历史，旧游标与异常游标有明确同步', async () => {
      const c = await f.instance();
      const history = await (await fetch(c.origin + '/api/blessings/history')).json(); assert.equal(history.messages.length, 30);
      const reset = await stream(c.origin, '9223372036854775807');
      try { const event = await reset.take(event => event.type === 'sync'); assert.equal(event.data.reset, true); assert.equal(event.data.messages.length, 6); } finally { await reset.close(); }
      await f.db.query('SELECT pg_terminate_backend($1)', [b.service.hub.listener.processID]);
      await waitFor(() => !b.service.hub.ready);
      await waitFor(() => b.service.hub.ready, 15000);
      const recovered = await post(b.origin, payload({ text: '重连后祝福' })); assert.equal(recovered.status, 201);
    });
    await suite.test('数据库拒绝保存时返回失败，邀请页面仍可访问', async () => {
      const rejected = await fixture({ BLESSINGS_CLIENT_LIMIT: '1', BLESSINGS_MAX_STREAMS: '1' });
      try {
        const server = await rejected.instance(); const message = payload();
        assert.equal((await post(server.origin, message)).status, 201);
        const rate = await post(server.origin, payload({ clientId: message.clientId })); assert.equal(rate.status, 429); assert.ok(rate.headers.get('retry-after')); assert.doesNotMatch((await rate.json()).message, /收到|送达/);
        const connection = await stream(server.origin); try { assert.equal((await fetch(server.origin + '/api/blessings/stream')).status, 503); } finally { await connection.close(); }
        await rejected.db.query('ALTER TABLE wedding_blessings RENAME TO wedding_blessings_temporarily_unavailable');
        try {
          assert.equal((await post(server.origin, payload())).status, 503);
          assert.equal((await fetch(server.origin + '/api/blessings/history')).status, 503);
          assert.equal((await fetch(server.origin + '/')).status, 200);
        } finally { await rejected.db.query('ALTER TABLE wedding_blessings_temporarily_unavailable RENAME TO wedding_blessings'); }
      } finally { await rejected.close(); }
    });
  } finally { await live?.close(); await f.close(); }
});
