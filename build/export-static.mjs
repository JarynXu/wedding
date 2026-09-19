import { cp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const source = resolve(process.argv[2] || 'dist');
const build = JSON.parse(await readFile(resolve(source, '.build-info.json'), 'utf8'));
// 每次导出独立目录，旧包不会被清理；文件名和资源根路径来自当前构建。
const digest = /^content-sha256:([a-f0-9]{64})$/.exec(build.buildId || '')?.[1];
if (!digest) throw new Error('构建标识缺失，请执行 npm run build');
const release = `sha256-${digest.slice(0, 16)}`;
const output = resolve('static-upload', release);
await mkdir(output, { recursive: true });
const files = [];
for (const directory of ['assets', 'share', 'vendor', 'music']) {
  const root = resolve(source, directory);
  await cp(root, resolve(output, directory), { recursive: true, force: true, filter: path => !path.endsWith('.map') });
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && !entry.name.endsWith('.map')) {
        const data = await readFile(file);
        files.push({ path: relative(source, file).replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      }
    }
  }
  await visit(root);
}
await writeFile(resolve('static-upload', `${release}.manifest.json`), JSON.stringify({ build: build.buildId, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) }, null, 2) + '\n');
console.log(`静态资源目录：${output}\n压缩该目录内的 assets、share、vendor、music 文件夹。配置地址须对应它们的上一级目录。\n文件数：${files.length}；大小：${(files.reduce((sum, file) => sum + file.bytes, 0) / 1048576).toFixed(2)} MiB`);
