// 显式启动受 1C2G 限制的容器，测试业务 HTTP 轮询与 SSE；供应商使用本机替身。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, request as requestHttp } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import assert from 'node:assert/strict';
import { gameFixture, gameTestDatabase } from './game-fixture.mjs';

if (!process.argv.includes('--run') || !gameTestDatabase || new URL(gameTestDatabase).hostname !== '127.0.0.1') throw Error('需要 --run 和本机 BLESSINGS_TEST_DATABASE_URL');
const execute = promisify(execFile);
const docker = async (...args) => (await execute('docker', args, { maxBuffer: 32 * 1024 * 1024 })).stdout.trim();
const image = process.env.CAPACITY_IMAGE || 'wedding-capacity:current';
const replicas = Number(process.env.CAPACITY_REPLICAS || 1), visitors = 100, offload = process.env.CAPACITY_OFFLOAD === 'true';
assert.ok([1, 2].includes(replicas));
const answersPerVisitor = Number(process.env.CAPACITY_ANSWERS || 1); assert.ok(Number.isInteger(answersPerVisitor) && answersPerVisitor >= 1 && answersPerVisitor <= 6);
const f = await gameFixture(), directory = await mkdtemp(join(tmpdir(), 'wedding-capacity-')), containers = [], ports = [], streams = [], logs = [];
const samples = [], httpTimes = [], modelDelayMs = 750; let active = 0, modelPeak = 0, modelCalls = 0, failures = 0, bytes = 0, staticBytes = 0, rotation = 0;
const provider = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw), system = body.messages[0].content;
  active++; modelPeak = Math.max(modelPeak, active); modelCalls++; await delay(modelDelayMs);
  let result;
  if (system.includes('入口审查员')) result = { intent: 'answer', summary: '', reason: 'isolated simulator', choiceIndex: null };
  else if (system.includes('阅卷员')) result = { verdict: 'correct', reason: 'isolated simulator', evidence: JSON.parse(body.messages.at(-1).content).untrustedAnswer };
  else if (system.includes('keepMessages')) result = { keepMessages: [0, 1], keepQuickReplies: [], questionMessage: 1, unansweredRequests: [] };
  else result = { messages: ['收到这份默契啦。', '{{question}}'], variant: 0, help: 'none', quickReplies: [] };
  active--; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }));
});
const relay = createServer((req, res) => {
  const port = ports[rotation++ % ports.length]; if (!port) return res.writeHead(503).end();
  const upstream = requestHttp({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  res.on('close', () => upstream.destroy()); req.pipe(upstream);
});
const staticApp = express(); staticApp.use((_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); }); staticApp.use(express.static(resolve('dist')));
const storage = createServer(staticApp);
const listen = server => new Promise(resolve => server.listen({ port: 0, host: '0.0.0.0', backlog: 4096 }, resolve));
await listen(provider); await listen(relay); await listen(storage);
const origin = 'http://127.0.0.1:' + relay.address().port, cdnOrigin = 'http://127.0.0.1:' + storage.address().port, scope = 'capacity-' + randomUUID();
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
async function consume(path, cookie, body) {
  const start = performance.now(), isAsset = /^\/(assets|music)\//.test(path);
  const response = await fetch((isAsset && offload ? cdnOrigin : origin) + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'Accept-Encoding': 'gzip', traceparent: `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01` }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) }).catch(error => { throw new Error(`HTTP ${path}: ${error.cause?.message || error.message}`, { cause: error }); });
  if (!response.ok) { failures++; throw Error(`${path}: ${response.status} ${await response.text()}`); }
  if (path.startsWith('/api/')) { const data = await response.json(); httpTimes.push(performance.now() - start); return data; }
  for await (const chunk of response.body) { if (isAsset) staticBytes += chunk.length; if (!isAsset || !offload) bytes += chunk.length; }
}
async function waitTurn(cookie, id) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const snapshot = await consume('/api/game/conversation', cookie);
    const turn = snapshot.turns.find(turn => turn.id === id);
    if (turn?.state === 'complete') { assert.ok(!turn.reply?.retryable, '对话处理不能以失败回复结束'); return; }
    await delay(800);
  }
  throw Error('聊天完成超时');
}
let background = [], polling = false; const backgroundErrors = [];
const track = task => { const tracked = task.catch(error => { backgroundErrors.push(error); }); background.push(tracked); return tracked; };
try {
  await f.pool.query(await readFile(new URL('../server/blessings/schema.sql', import.meta.url), 'utf8'));
  const people = []; for (let i = 0; i < visitors; i++) people.push(await f.participant(2000 + i));
  await f.pool.query("UPDATE wedding_game_question_voice SET deck=jsonb_build_object('phrasings',jsonb_build_array(title),'hints','[]'::jsonb,'choices','[]'::jsonb,'source','isolated') WHERE room_id=$1", [f.room]);
  for (let i = 0; i < replicas; i++) {
    const name = `wedding-capacity-${Date.now()}-${i}`;
    const envFile = join(directory, `instance-${i}.env`);
    const env = { NODE_ENV: 'production', NODE_OPTIONS: '--import=/probe.mjs', LOG_LEVEL: 'info', LOG_FORMAT: 'text', LOG_COLOR: 'never', INSTANCE_ID: name, PORT: '8080', WEDDING_MAX_INSTANCES: '2', BLESSINGS_DB_POOL_SIZE: '3', BLESSINGS_DATABASE_URL: gameTestDatabase.replace('127.0.0.1', 'host.docker.internal'), BLESSINGS_DB_SSL: 'false', BLESSINGS_ROOM: f.room, BLESSINGS_RATE_SECRET: 'isolated-capacity-secret-32-characters', BLESSINGS_PUBLIC_ORIGIN: origin, GAME_ENABLED: 'true', GAME_DATA_KEY: f.runtime.dataKey.toString('hex'), GAME_SESSION_SECRET: f.runtime.sessionSecret, GAME_AI_PROVIDER: 'deepseek', GAME_AI_BASE_URL: 'http://host.docker.internal:' + provider.address().port, GAME_AI_API_KEY: 'isolated-not-a-real-key', GAME_AI_MODEL: 'isolated-model', GAME_AI_REVIEW_MODEL: 'isolated-model', GAME_AI_ACCOUNT_SCOPE: scope, GAME_AI_MAX_INFLIGHT: '120', GAME_AI_CONCURRENCY: process.env.CAPACITY_WORKERS || '8', STATIC_ASSET_BASE_URL: offload ? 'http://host.docker.internal:' + storage.address().port + '/' : '' };
    await writeFile(envFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'));
    await docker('run', '-d', '--name', name, '--cpus=1', '--memory=2g', '--memory-swap=2g', '--env-file', envFile, '-v', resolve('tests/capacity-probe.mjs') + ':/probe.mjs:ro', '-p', '127.0.0.1::8080', image); containers.push(name);
    const inspection = JSON.parse(await docker('inspect', name))[0];
    assert.equal(inspection.HostConfig.Memory, 2147483648); assert.equal(inspection.HostConfig.NanoCpus, 1000000000);
    const port = Number(inspection.NetworkSettings.Ports['8080/tcp'][0].HostPort); ports.push(port);
    let ready = false; for (let n = 0; n < 80; n++) { try { const response = await fetch(`http://127.0.0.1:${port}/api/blessings/history`); if (response.ok) { ready = true; break; } } catch {} await delay(250); }
    assert.ok(ready, '容器须完成数据库初始化');
  }
  await delay(3000); const loadedAt = Date.now();
  for (const person of people) {
    const abort = new AbortController(); streams.push(abort);
    const response = await fetch(origin + '/api/blessings/stream', { signal: abort.signal }); assert.equal(response.status, 200);
    track((async () => { try { for await (const _chunk of response.body) {} if (!abort.signal.aborted) throw Error('SSE 连接在负载期间中断'); } catch (error) { if (!abort.signal.aborted) throw error; } })());
  }
  polling = true;
  for (const [index, person] of people.entries()) track((async () => { await delay(index * 40); while (polling) { await consume('/api/game/config'); await consume('/api/game/me', 'wedding_game=' + person.token); await delay(4000); } })());
  const assets = await readdir('dist/assets'), patterns = ['invitation-.*\\.js$', 'game-.*\\.js$', 'invitation-.*\\.css$', 'game-.*\\.css$', 'cover-welcome-art', 'card_02_hd', 'card_03_hd', 'card_04_hd', 'rose-petals', 'prize-plush'];
  const paths = ['/', '/game.html', '/music/classic/01-Close%20to%20You-Olivia%20Ong.mp3', ...patterns.map(pattern => { const file = assets.find(file => new RegExp(pattern).test(file)); assert.ok(file, pattern); return '/assets/' + encodeURIComponent(file); })];
  const staticRun = track(Promise.all(people.map(async () => { for (const path of paths) await consume(path); })));
  const answerTimes = [];
  const conversations = await Promise.allSettled(people.map(async person => {
    const cookie = 'wedding_game=' + person.token;
    const start = await consume('/api/game/conversation/start', cookie, { requestId: randomUUID() }); await waitTurn(cookie, start.id);
    for (let question = 1; question <= answersPerVisitor; question++) {
      const before = performance.now(); const answer = await consume('/api/game/conversation/messages', cookie, { requestId: randomUUID(), text: `测试答案 ${question}` });
      await waitTurn(cookie, answer.id); answerTimes.push(performance.now() - before);
    }
  }));
  const rejected = conversations.find(result => result.status === 'rejected'); if (rejected) throw rejected.reason;
  await staticRun; const finishedAt = Date.now(); polling = false; streams.forEach(stream => stream.abort()); await Promise.all(background); background = [];
  assert.deepEqual(backgroundErrors, []);
  await delay(10000);
  assert.equal(Number((await f.pool.query("SELECT count(*) FROM wedding_game_answers WHERE room_id=$1 AND status='correct'", [f.room])).rows[0].count), visitors * answersPerVisitor);
  for (const name of containers) {
    const { stdout, stderr } = await execute('docker', ['logs', name], { maxBuffer: 64 * 1024 * 1024 });
    logs.push(stdout + stderr);
    const rows = stdout.split('\n').filter(line => line.startsWith('{"event":"capacity.sample"')).map(JSON.parse);
    assert.ok(rows.length > 10);
    samples.push({ instance: name, idle: rows.filter(row => row.time < loadedAt).at(-1), load: rows.filter(row => row.time >= loadedAt && row.time <= finishedAt), recovery: rows.at(-1) });
  }
  const mib = value => Math.round(value / 1048576 * 10) / 10;
  const report = { generatedAt: new Date().toISOString(), image, scope: '每容器限制 1 CPU/2 GiB，无 swap；100 个真实 HTTP 会话、100 条 SSE、800ms 聊天轮询及4秒状态轮询；真实本机 PostgreSQL，AI每次750ms替身，未调用短信或真实模型。', replicas, workersPerInstance: Number(process.env.CAPACITY_WORKERS || 8), offload, visitors, answersPerVisitor, modelDelayMs, modelCalls, modelPeak, failures, dynamicRequests: httpTimes.length, servedPageAndAssetBytes: bytes, downloadedAssetBytes: staticBytes, elapsedMs: finishedAt - loadedAt, apiMs: { p50: quantile(httpTimes, .5), p95: quantile(httpTimes, .95), max: Math.max(...httpTimes) }, answerMs: { p50: quantile(answerTimes, .5), p95: quantile(answerTimes, .95), max: Math.max(...answerTimes) }, instances: samples.map(({ instance, idle, load, recovery }) => ({ instance, idleRssMiB: mib(idle.memory.rss), peakRssMiB: mib(Math.max(...load.map(row => row.memory.rss))), peakHeapMiB: mib(Math.max(...load.map(row => row.memory.heapUsed))), peakExternalMiB: mib(Math.max(...load.map(row => row.memory.external))), peakCgroupMiB: mib(Math.max(...load.map(row => row.cgroupBytes))), recoveryRssMiB: mib(recovery.memory.rss), eventLoopP99Ms: quantile(load.map(row => row.eventLoopP99Ms), .95), processCpuPercent: (recovery.cpu.user + recovery.cpu.system - idle.cpu.user - idle.cpu.system) / ((recovery.time - idle.time) * 10), memoryEvents: recovery.memoryEvents, cpuStat: recovery.cpuStat })), passed: true };
  await writeFile(process.env.CAPACITY_REPORT || 'docs/container-capacity-report.json', JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(directory, 'service.log'), logs.join('\n')); console.log(JSON.stringify({ ...report, diagnosticLog: join(directory, 'service.log') }));
} catch (error) {
  for (const name of containers) { const captured = await execute('docker', ['logs', name], { maxBuffer: 64 * 1024 * 1024 }).catch(() => ({ stdout: '', stderr: '' })); await writeFile(join(directory, `${name}.failed.log`), captured.stdout + captured.stderr); }
  console.error(JSON.stringify({ failed: error.message, origin, cdnOrigin, ports, diagnosticDirectory: directory })); throw error;
} finally {
  polling = false; streams.forEach(stream => stream.abort()); await Promise.allSettled(background);
  for (const name of containers) { await docker('stop', '-t', '10', name).catch(() => {}); await docker('rm', name).catch(() => {}); }
  for (const server of [relay, provider, storage]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await f.pool.query('DELETE FROM wedding_ai_leases WHERE scope=$1', [scope]); await f.pool.query('DELETE FROM wedding_ai_controls WHERE scope=$1', [scope]); await f.close();
  for (let i = 0; i < replicas; i++) await rm(join(directory, `instance-${i}.env`), { force: true });
}
