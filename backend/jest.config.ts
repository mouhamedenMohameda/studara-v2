import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  resetMocks: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/db/**',
    '!src/jobs/**',
    '!src/scripts/**',
    '!src/__tests__/**',
  ],
};

export default config;
