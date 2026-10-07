import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './scripts/service-worker.mjs';

// Relative asset paths let the build run from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    include: ['test/**/*.test.{js,jsx}'],
    setupFiles: ['test/setup.js']
  }
});
