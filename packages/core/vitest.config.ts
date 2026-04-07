import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: packageRoot,
  test: {
    globals: true,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
