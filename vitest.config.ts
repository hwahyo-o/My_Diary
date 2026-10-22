import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // RecoveryKey derivation and IndexedDB encryption tests exceed 5s on shared CI workers.
    testTimeout: 15_000,
  },
});
