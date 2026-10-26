import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Which commit this build came from, so it's easy to tell which version is live.
  define: { __COMMIT__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)) },
  server: { port: 5173, open: true, proxy: { '/api': 'http://localhost:8787' } },
});
