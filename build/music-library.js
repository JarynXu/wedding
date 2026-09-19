import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, cp, writeFile } from 'node:fs/promises';
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

/** 开发环境与构建使用同一目录清单；源目录不写入构建派生文件。 */
export function musicLibrary() {
  let root;
  return {
    name: 'theme-music-library',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url, 'http://vite.local').pathname;
        const match = /\/music\/(classic|chinese)\/playlist\.json$/.exec(path);
        if (!match || !['GET', 'HEAD'].includes(request.method)) return next();
        try {
          const library = await readMusicLibrary(root);
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(library[match[1]]));
        } catch (error) { next(error); }
      });
    },
    async generateBundle() {
      for (const [theme, playlist] of Object.entries(await readMusicLibrary(root))) this.emitFile({ type: 'asset', fileName: `music/${theme}/playlist.json`, source: JSON.stringify(playlist, null, 2) + '\n' });
    },
  };
}

export async function exportMusic(root, output) {
  const library = await readMusicLibrary(root);
  // 每次独立导出，旧文件不会混入新清单，也不会删除已有上传包。
  await mkdir(output, { recursive: false });
  for (const [theme, playlist] of Object.entries(library)) {
    const destination = resolve(output, 'music', theme);
    await mkdir(destination, { recursive: true });
    for (const track of playlist.tracks) await cp(resolve(root, 'public/music', theme, track.file), resolve(destination, track.file));
    await writeFile(resolve(destination, 'playlist.json'), JSON.stringify(playlist, null, 2) + '\n');
  }
  return library;
}
