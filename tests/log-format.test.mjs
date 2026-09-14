import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { formatLog, logOptions } from '../server/log-format.js';

test('控制台格式包含服务实例和链路，诊断字段可读，换行不能伪造日志', () => {
  const data = { time: '2026-09-14T00:00:00.000Z', level: 'info', service: 'wedding', instance: 'replica-1', trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), event: 'ai.completed', duration_ms: 321, input_tokens: 40, counts: { jobs: 8 } };
  const line = formatLog(data);
  assert.match(line, /^\[2026-09-14T00:00:00.000Z\] \[INFO\] \[wedding\] \[replica-1\] \[a{32}\] \[b{16}\] - ai.completed duration_ms=321 input_tokens=40 jobs=8\n$/);
  assert.deepEqual(JSON.parse(formatLog(data, { format: 'json' })), data);
  assert.match(formatLog(data, { color: true }), /\x1b\[36m\[INFO\]/);
  const escaped = formatLog({ ...data, instance: 'node\n[ERROR]', reason: '\x1b[31m\rforged' });
  assert.equal(escaped.trimEnd().split('\n').length, 1); assert.doesNotMatch(escaped, /\x1b|\r/);
  assert.equal(logOptions({}, { isTTY: false }).color, false);
  assert.equal(logOptions({ LOG_COLOR: 'always' }, {}).color, true);
  assert.equal(logOptions({ NO_COLOR: '' }, { isTTY: true }).color, false);
  assert.throws(() => logOptions({ LOG_FORMAT: 'wrong' }, {}));
});

test('默认文本日志的 stdout/stderr 分流和敏感字段隔离', async () => {
  const source = `import {log,logError} from './server/observability.js';log('ready',{password:'secret',phone:'13999999999',counts:{jobs:2,password:'bad'}});logError('failed',new Error('private-error-secret'));`;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, LOG_LEVEL: 'info', LOG_FORMAT: 'text', LOG_COLOR: 'never' } });
  assert.match(stdout, /\[INFO\].* - ready jobs=2/); assert.match(stderr, /\[ERROR\].* - failed error_type=Error error_code=UNKNOWN/);
  assert.doesNotMatch(stdout + stderr, /secret|13999999999|password|bad/); assert.match(stderr, /\n    at /);
});
