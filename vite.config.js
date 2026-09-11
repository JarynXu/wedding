import { defineConfig } from 'vite';
import { criticalWelcome } from './build/critical-welcome.js';
import { calendarResponse } from './build/calendar-response.js';
import { shareMetadata } from './build/share-metadata.js';

export default defineConfig({
  base: './',
  plugins: [shareMetadata(), criticalWelcome(), calendarResponse()],
});
