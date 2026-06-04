import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.test.js'],
    setupFiles: ['__tests__/setup.js'],
    reporters: ['verbose'],
    coverage: {
      include: [
        'data/**',
        'login/authState.js',
        'login/login.js',
        'navbar/navbar.js',
        'platform/platform.js',
        'shared/ctaRouter.js',
        'index.js',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 90,
        branches:   85,
        functions:  100,
      },
    },
  },
});
