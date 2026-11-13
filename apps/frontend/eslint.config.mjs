import next from '@next/eslint-plugin-next';
import parser from '@typescript-eslint/parser';

export default [
  { plugins: { '@next/next': next } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser },
    rules: {
      ...next.configs['core-web-vitals'].rules,
      'no-debugger': 'error',
      'no-dupe-else-if': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
    },
  },
];
