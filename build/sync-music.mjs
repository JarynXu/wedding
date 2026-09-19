import { syncMusicLibrary } from './music-library.js';

const library = await syncMusicLibrary(process.cwd());
console.log(`已更新 public/music 下的歌单：默认主题 ${library.classic.tracks.length} 首，中式主题 ${library.chinese.tracks.length} 首。`);
