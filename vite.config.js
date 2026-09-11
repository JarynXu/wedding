import { defineConfig } from 'vite';
import { criticalWelcome } from './build/critical-welcome.js';
import { calendarResponse } from './build/calendar-response.js';
import { shareMetadata } from './build/share-metadata.js';
import { calendarEntry } from './build/calendar-entry.js';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [shareMetadata(), criticalWelcome(), calendarResponse(), calendarEntry()],
  build: {
    rollupOptions: {
      input: {
        invitation: fileURLToPath(new URL('./index.html', import.meta.url)),
        calendar: fileURLToPath(new URL('./calendar.html', import.meta.url)),
      },
    },
  },
});
