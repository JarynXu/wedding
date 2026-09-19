import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createInvitationApp } from '../server/app.js';
import { readMusicLibrary } from '../build/music-library.js';

async function files(directory, includeHidden = false) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!includeHidden && entry.name.startsWith('.')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path, includeHidden));
    else result.push(path);
  }
  return result;
}
const digest = data => createHash('sha256').update(data).digest('hex');

test('public 包含可上传的完整歌单，构建保留公开文件的路径与内容', async () => {
  for (const [theme, playlist] of Object.entries(await readMusicLibrary(process.cwd()))) {
    assert.deepEqual(JSON.parse(await readFile(`public/music/${theme}/playlist.json`, 'utf8')), playlist);
  }
  for (const source of await files(resolve('public'))) {
    const path = relative(resolve('public'), source);
    assert.equal(digest(await readFile(resolve('dist', path))), digest(await readFile(source)), path);
  }
  const compiled = await files(resolve('dist/app'));
  assert.ok(compiled.some(path => path.endsWith('.js')) && compiled.some(path => path.endsWith('.css')));
  assert.ok(compiled.every(path => /\.(js|css)$/.test(path)), '媒体与字体不应重新混入编译文件目录');
  for (const root of ['public', 'dist']) for (const file of await files(root, true)) {
    const path = relative(resolve(root), file).replaceAll('\\', '/');
    assert.doesNotMatch(path, /(?:^|\/)(?:\.temp|design|src|server|\.env)|\.map$/);
  }
});

test('正式素材具有运行或构建消费者，保留字体许可证', async () => {
  const sources = [...await files('src'), ...await files('build'), ...['index.html', 'game.html', 'calendar.html'].map(resolveFile)].filter(path => /\.(js|mjs|css|html)$/.test(path));
  const content = (await Promise.all(sources.map(path => readFile(path, 'utf8')))).join('\n');
  for (const file of await files('public/assets')) {
    const path = relative(resolve('public'), file).replaceAll('\\', '/');
    if (/(?:LICENSE|-OFL)\.txt$/.test(path)) continue;
    const used = path.startsWith('assets/fonts/welcome/') ? content.includes(path.split('/').at(-1)) && content.includes('assets/fonts/welcome/') : content.includes(path);
    assert.ok(used, `正式素材未被引用：${path}`);
  }
});

function resolveFile(file) { return resolve(file); }

test('容器工作目录叫 app 时，固定路径的素材仍需验证缓存', async () => {
  await mkdir('.temp/tests', { recursive: true });
  const directory = await mkdtemp(resolve('.temp/tests/resource-cache-'));
  const distDir = resolve(directory, 'app/dist');
  await mkdir(resolve(distDir, 'app'), { recursive: true });
  await mkdir(resolve(distDir, 'assets'), { recursive: true });
  await writeFile(resolve(distDir, 'index.html'), await readFile('dist/index.html'));
  await writeFile(resolve(distDir, 'app/runtime-abcd1234.js'), 'export default 1;');
  await writeFile(resolve(distDir, 'assets/portrait.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const server = createInvitationApp({ distDir }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    const image = await fetch(origin + '/assets/portrait.svg');
    assert.equal(image.status, 200); assert.equal(image.headers.get('cache-control'), 'no-cache'); await image.arrayBuffer();
    const script = await fetch(origin + '/app/runtime-abcd1234.js');
    assert.equal(script.status, 200); assert.match(script.headers.get('cache-control'), /immutable/); await script.arrayBuffer();
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.ok(directory.startsWith(resolve('.temp/tests/resource-cache-')));
    await rm(directory, { recursive: true, force: true });
  }
});
