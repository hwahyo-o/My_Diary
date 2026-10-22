import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Crypto-intensive recovery and multi-runtime IndexedDB tests can exceed
    // 15 seconds under shared CI runner load. Keep an explicit bounded timeout.
    testTimeout: 45_000,
  },
});
