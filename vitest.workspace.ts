import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'samples/taskflurry/vitest.config.ts',
]);
