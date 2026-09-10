import { defineConfig } from 'vite';
import { criticalWelcome } from './build/critical-welcome.js';

export default defineConfig({
  base: './',
  plugins: [criticalWelcome()],
});
