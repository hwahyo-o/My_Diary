import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  eslint.configs.recommended,
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      globals: {
        crypto: 'readonly',
        TextEncoder: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommended,
);
