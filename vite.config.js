import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './scripts/service-worker.mjs';
import { liveFile } from './scripts/live-file.mjs';

// Relative asset paths let the build run from any GitHub Pages sub-path.
// `npm run live` (mode "live") or FERROPRINT_LIVE=<file> keeps the open tab in step with a file. See docs/LIVE.md.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), serviceWorker(), liveFile(process.env.FERROPRINT_LIVE || (mode === 'live' ? 'live/diagram.json' : ''))],
  test: {
    include: ['test/**/*.test.{js,jsx}'],
    setupFiles: ['test/setup.js']
  }
}));
