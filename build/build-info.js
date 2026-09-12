import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const sourceDirectories = ['src', 'server', 'build', 'public'];
const sourceFiles = ['index.html', 'calendar.html', 'game.html', 'vite.config.js', 'package.json', 'package-lock.json', 'Dockerfile'];

/** 构建产物记录应用源码指纹与生成时间，不读取环境文件。 */
export function buildInfo() {
  let root;
  let artifact;
  return {
    name: 'build-info',
    configResolved(config) { root = config.root; },
    buildStart() {
      const digest = sourceDigest(root);
      artifact = { buildId: `content-sha256:${digest}`, buildTime: new Date().toISOString(), buildSource: 'content_fingerprint', commit: process.env.APP_BUILD_COMMIT || process.env.GIT_COMMIT || 'unknown' };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.build-info.json', source: `${JSON.stringify(artifact)}\n` });
    },
  };
}

function sourceDigest(root) {
  const paths = new Set(sourceFiles.map(file => resolve(root, file)));
  for (const directory of sourceDirectories) collect(resolve(root, directory), paths);
  const hash = createHash('sha256');
  for (const path of [...paths].filter(isSourceFile).sort()) {
    hash.update(relative(root, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function collect(directory, paths) {
  if (!isDirectory(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.env')) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path, paths);
    else paths.add(path);
  }
}

function isSourceFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
