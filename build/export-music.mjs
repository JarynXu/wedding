import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportMusic } from './music-library.js';

await mkdir('music-upload', { recursive: true });
const output = resolve('music-upload', new Date().toISOString().replace(/[:.]/g, '-'));
const library = await exportMusic(process.cwd(), output);
console.log(`音乐上传目录：${output}\n默认主题 ${library.classic.tracks.length} 首；中式主题 ${library.chinese.tracks.length} 首。\n上传目录内的 music 文件夹；先上传音频，再更新 playlist.json。`);
