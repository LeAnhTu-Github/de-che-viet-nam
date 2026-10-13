import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Monorepo: bundle TRỰC TIẾP source TS của @aoe-vn/sim (tránh rắc rối
    // interop CJS/ESM của dist). tsc vẫn resolve types qua dist/*.d.ts.
    alias: {
      '@aoe-vn/sim': path.resolve(__dirname, '../../packages/sim/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev: client gọi /api -> server game (khi cần REST sau này)
      '/api': 'http://localhost:2567',
    },
  },
});
