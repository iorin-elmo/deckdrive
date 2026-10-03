import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  return {
    envDir: root,
    base: env.VITE_ADMIN_BASE || (mode === 'production' ? '/admin/' : '/'),
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: env.VITE_API_PROXY || 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
  };
});
