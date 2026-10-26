import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/testSupport/networkListenGuard.setup.ts'],
  },
});
