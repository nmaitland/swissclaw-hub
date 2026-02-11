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
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/tests/**/*.spec.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'server/**/*.js',
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
