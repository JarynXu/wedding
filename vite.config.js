import { defineConfig } from 'vite';
import { criticalWelcome } from './build/critical-welcome.js';
import { calendarResponse } from './build/calendar-response.js';
import { shareMetadata } from './build/share-metadata.js';
import { calendarEntry } from './build/calendar-entry.js';
import { blessingsApi } from './build/blessings-api.js';
import { buildInfo } from './build/build-info.js';
import { musicLibrary } from './build/music-library.js';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  cacheDir: '.temp/vite',
  plugins: [blessingsApi(), shareMetadata(), criticalWelcome(), calendarResponse(), calendarEntry(), musicLibrary(), buildInfo()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'app/[name]-[hash].js',
        chunkFileNames: 'app/[name]-[hash].js',
        assetFileNames: 'app/[name]-[hash][extname]',
      },
      input: {
        invitation: fileURLToPath(new URL('./index.html', import.meta.url)),
        calendar: fileURLToPath(new URL('./calendar.html', import.meta.url)),
        game: fileURLToPath(new URL('./game.html', import.meta.url)),
      },
    },
  },
});
