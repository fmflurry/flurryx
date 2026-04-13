import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sampleRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: sampleRoot,
  test: {
    name: 'taskflurry',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
});
