import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [{
  files: ['**/*.ts'],
  languageOptions: { parser },
  plugins: { '@typescript-eslint': typescript },
  rules: {
    'no-debugger': 'error',
    'no-dupe-else-if': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    '@typescript-eslint/no-duplicate-enum-values': 'error',
  },
}];
