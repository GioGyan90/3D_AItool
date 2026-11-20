import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const pages = mode === 'pages';
  const apiKey = pages ? '' : loadEnv(mode, '.', '').GEMINI_API_KEY;
  return {
    base: pages ? './' : '/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    build: pages ? {outDir: 'docs/studio'} : undefined,
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
