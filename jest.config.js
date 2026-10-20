module.exports = {
  testEnvironment: 'node',
  // Load env overrides BEFORE the app modules under test are required.
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Shared test DB: run files one at a time to avoid cross-file interference.
  maxWorkers: 1,
  testTimeout: 20000
};
