import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, preview } from 'vite';
import { WEDDING_CONFIG } from '../src/config.js';
import { InvalidInvitationLinkError } from '../src/family-invitation.js';
import { getInvitationEvent, daysUntilEvent } from '../src/invitation-event.js';
import { getCalendarDetails, createAllDayCalendar } from '../src/invitation-calendar.js';
import { getShareMetadata } from '../src/share-metadata.js';
import { createInvitationApp } from '../server/app.js';

test('宴会选择、女方署名与分享链接保留各自语义', () => {
  const original = structuredClone(WEDDING_CONFIG);
  const wedding = getInvitationEvent(WEDDING_CONFIG);
  assert.equal(wedding.date.formattedDate, '2026.10.17');
  assert.equal(wedding.allowGames, true);
  const event = getInvitationEvent(WEDDING_CONFIG, '?event=huimen');
  assert.equal(event.date.formattedDate, '2026.10.25');
  assert.equal(event.allowGames, false);
  assert.equal(event.sessions.length, 2);
  assert.equal(event.sessions[0].venue.amapUrl, 'https://surl.amap.com/1j3Bc9pcbezn');
  assert.equal(event.sessions[1].venue.amapUrl, 'https://surl.amap.com/1j9hnBx4jdeE');
  const share = getShareMetadata(WEDDING_CONFIG, '?event=huimen&theme=chinese&side=bride&parents=赵先生、李女士&page=2&open=1');
  assert.match(share.title, /回门宴/);
  assert.match(share.description, /2026年10月25日.*赵先生、李女士.*爱女与女婿的回门宴/);
  const params = new URL(share.url).searchParams;
  assert.deepEqual(Object.fromEntries(params), { theme: 'chinese', event: 'huimen', side: 'bride', parents: '赵先生、李女士' });
  assert.equal(new URL(getShareMetadata(WEDDING_CONFIG, '?event=wedding').url).search, '');
  for (const search of ['?event=unknown', '?event=', '?event=huimen&event=wedding', '?event=huimen&side=groom&parents=张先生']) {
    assert.throws(() => getShareMetadata(WEDDING_CONFIG, search), InvalidInvitationLinkError);
  }
  assert.deepEqual(WEDDING_CONFIG, original, '选择回门宴不修改婚礼配置');
});

test('回门宴按中国日期计日，不推断开席时刻', () => {
  const event = getInvitationEvent(WEDDING_CONFIG, '?event=huimen');
  assert.equal(daysUntilEvent(event, new Date('2026-10-13T15:59:59Z')), 12);
  assert.equal(daysUntilEvent(event, new Date('2026-10-13T16:00:00Z')), 11);
  assert.equal(daysUntilEvent(event, new Date('2026-10-24T16:00:00Z')), 0);
  assert.equal(daysUntilEvent(event, new Date('2026-10-26T00:00:00Z')), 0);
});

test('两场全天日历保留各自地点，结束日期不包含次日', () => {
  const event = getInvitationEvent(WEDDING_CONFIG, '?event=huimen');
  const file = createAllDayCalendar(WEDDING_CONFIG, event);
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  const unfolded = file.replace(/\r\n /g, '');
  const entries = [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map(match => match[1]);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    assert.match(entry, /DTSTART;VALUE=DATE:20261025\r\n/);
    assert.match(entry, /DTEND;VALUE=DATE:20261026\r\n/);
    assert.doesNotMatch(entry, /待定/);
    assert.doesNotMatch(entry, /DTSTART:|12:08|11:30|嘉臣|婚礼仪式|VALARM/);
  }
  assert.match(entries[0], /SUMMARY:.*回门宴·午宴/);
  assert.match(entries[0], /LOCATION:鑫华酒店（扬州市邗江区杨寿镇回归路2号）/);
  assert.match(entries[1], /SUMMARY:.*回门宴·晚宴/);
  assert.match(entries[1], /LOCATION:海德禧顺·精致淮扬菜·宴会厅（扬州市邗江区邗江北路83号）/);
  const uids = entries.map(entry => entry.match(/UID:(.*)/)[1]);
  assert.equal(new Set(uids).size, 2);
  assert.ok(uids.every(uid => uid.startsWith('huimen-')));
  const details = getCalendarDetails(WEDDING_CONFIG, event);
  assert.match(details.text, /午宴：鑫华酒店/);
  assert.match(details.text, /扬州市邗江区杨寿镇回归路2号/);
  assert.match(details.text, /晚宴：海德禧顺/);
  assert.match(details.text, /扬州市邗江区邗江北路83号/);
  assert.doesNotMatch(details.text, /待定/);
});

for (const mode of ['dev', 'preview', 'production']) test(`${mode} 提供回门宴分享元信息和两场日历`, async () => {
  const server = mode === 'dev'
    ? await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, hmr: false } })
    : mode === 'preview' ? await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port: 0 } })
    : createInvitationApp().listen(0, '127.0.0.1');
  if (mode === 'dev') await server.listen();
  if (mode === 'production' && !server.listening) await new Promise(resolve => server.once('listening', resolve));
  const http = server.httpServer || server;
  const origin = `http://127.0.0.1:${http.address().port}`;
  try {
    const home = await fetch(origin + '/?event=huimen&theme=chinese');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /property="og:title" content="[^"]*回门宴/);
    assert.match(html, /property="og:description" content="[^"]*2026年10月25日/);
    assert.match(html, /property="og:url" content="[^"]*event=huimen/);
    for (const query of ['event=nope', 'event=huimen&event=wedding']) {
      const invalid = await fetch(origin + '/?' + query);
      assert.equal(invalid.status, 400);
      await invalid.text();
    }
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(origin + '/huimen.ics', { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'inline; filename="huimen.ics"');
      assert.equal(await response.text(), method === 'HEAD' ? '' : await readFile('dist/huimen.ics', 'utf8'));
    }
  } finally {
    if (mode === 'dev') await server.close();
    else { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); }
  }
});
