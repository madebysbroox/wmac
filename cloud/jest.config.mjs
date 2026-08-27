export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.mjs'],
  collectCoverageFrom: [
    'src/**/*.mjs',
    '!src/**/*.test.mjs'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true
};
