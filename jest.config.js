module.exports = {
  // Backend tests run against the real Node/Express server
  testEnvironment: 'node',
  // Run zzz-teardown.test.js last so it can close the pg pool
  testSequencer: '<rootDir>/jest-sequencer.js',
  setupFilesAfterEnv: [],
  globals: {
    TextEncoder: require('util').TextEncoder,
    TextDecoder: require('util').TextDecoder,
  },
  transform: {
    // Extension source files can't be fully type-checked without the real OpenClaw SDK
    '[/\\\\]openclaw-extension[/\\\\].*\\.(ts|tsx)$': ['ts-jest', { diagnostics: false }],
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  moduleNameMapper: {
    '^openclaw/plugin-sdk$': '<rootDir>/tests/__mocks__/openclaw-plugin-sdk.ts',
    // Strip .js extensions so CommonJS Jest can resolve ESM-style imports
    '^(\\.{1,2}/.+)\\.js$': '$1',
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/tests/**/*.spec.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'server/**/*.{js,ts}',
    '!server/models/**',
    '!server/routes/**',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
};
