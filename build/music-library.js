import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const themes = ['classic', 'chinese'];
const audioFile = /\.(mp3|m4a|aac|ogg|wav)$/i;

/** 文件编号定义顺序；未提供中式曲目时使用已有默认歌单。 */
export async function readMusicLibrary(root) {
  const library = {};
  for (const theme of themes) {
    const directory = resolve(root, 'public/music', theme);
    const files = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile() && audioFile.test(entry.name)).map(entry => entry.name);
    files.sort((a, b) => {
      const order = name => Number(/^(\d+)/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER);
      return order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
    const tracks = await Promise.all(files.map(async file => {
      const data = await readFile(resolve(directory, file));
      if (!data.length) throw new Error(`音乐文件为空：${theme}/${file}`);
      return { file, title: file.replace(audioFile, '').replace(/^\d+[\s._-]*/, ''), bytes: data.length, version: createHash('sha256').update(data).digest('hex').slice(0, 16) };
    }));
    library[theme] = { tracks, ...(!tracks.length && theme === 'chinese' ? { fallback: 'classic' } : {}) };
  }
  if (!library.classic.tracks.length) throw new Error('public/music/classic 至少需要一首音乐');
  return library;
}

/** 歌单是公开资源的一部分，public 的副本无需依赖构建产物。 */
export async function syncMusicLibrary(root) {
  const library = await readMusicLibrary(root);
  for (const [theme, playlist] of Object.entries(library)) {
    const file = resolve(root, 'public/music', theme, 'playlist.json');
    const content = JSON.stringify(playlist, null, 2) + '\n';
    const previous = await readFile(file, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (previous !== content) await writeFile(file, content);
  }
  return library;
}

/** 开发与构建先更新 public 歌单；Vite 负责原样复制公开文件。 */
export function musicLibrary() {
  let root;
  return {
    name: 'theme-music-library',
    async configResolved(config) { root = config.root; await syncMusicLibrary(root); },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url, 'http://vite.local').pathname;
        const match = /\/music\/(classic|chinese)\/playlist\.json$/.exec(path);
        if (!match || !['GET', 'HEAD'].includes(request.method)) return next();
        try {
          const library = await syncMusicLibrary(root);
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(library[match[1]]));
        } catch (error) { next(error); }
      });
    },
  };
}
