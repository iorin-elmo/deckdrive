import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, workspaceRoot, '');
  return {
    envDir: workspaceRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@deck-drive/card-definitions': fileURLToPath(
          new URL('../../packages/card-definitions/src/index.ts', import.meta.url),
        ),
        '@deck-drive/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: environment.VITE_API_PROXY || 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
