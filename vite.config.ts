import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repository as a project site under /AudioWithEqualizer/.
  base: command === 'build' ? '/AudioWithEqualizer/' : '/',
  plugins: [react()],
  server: { allowedHosts: true }
}));
