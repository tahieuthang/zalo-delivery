import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/modules/**/*.service.ts', 'src/shared/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/**/*.dto.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@modules': resolve(__dirname, 'src/modules'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@config': resolve(__dirname, 'src/config'),
      '@infra': resolve(__dirname, 'src/infra'),
    },
  },
});
