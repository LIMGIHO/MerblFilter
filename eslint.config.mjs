import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  js.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['build/*', '.next/*', 'node_modules/*'],
    rules: {
      'no-unused-vars': 'warn',
      '@next/next/no-img-element': 'off',
    },
  },
];
