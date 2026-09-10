import { defineConfig } from 'vite';
import { criticalWelcome } from './build/critical-welcome.js';
import { calendarResponse } from './build/calendar-response.js';

export default defineConfig({
  base: './',
  plugins: [criticalWelcome(), calendarResponse()],
});
