import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.CF_PAGES === '1' ? '/' : '/My_Diary/';

  return {
    base,
    plugins: [react()],
  };
});
