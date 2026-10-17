/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

// base './' keeps asset URLs relative so the build works under any
// GitHub Pages sub-path (https://<user>.github.io/<repo>/).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: mode === 'singlefile' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { include: ['src/core/**'] },
  },
}));
