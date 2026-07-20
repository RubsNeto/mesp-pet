import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

// Vite + React + Electron config.
// vite-plugin-electron/simple builds main and preload to dist-electron/.
export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: true,
              rollupOptions: {
                external: ['electron', '@homebridge/node-pty-prebuilt-multiarch'],
              },
            },
          },
        },
        preload: {
          input: path.join(__dirname, 'electron/preload.ts'),
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: 'inline',
              rollupOptions: {
                external: ['electron', '@homebridge/node-pty-prebuilt-multiarch'],
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      assetsInlineLimit: 0,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (!normalized.includes('/node_modules/')) return undefined;
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
            if (normalized.includes('/node_modules/@xterm/')) return 'terminal-vendor';
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    clearScreen: false,
  };
});
