module.exports = {
  preset: 'ts-jest/presets/js-with-babel',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
  },
  testMatch: ['**/__tests__/**/*.test.(js|ts)'],
  setupFiles: ['./jest.setup.js'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: 'tsconfig.json'
    }
  },
  moduleNameMapper: {
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1'
  },
  collectCoverageFrom: [
    'js/**/*.{js,ts}',
    '!js/thirdparty/**',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true
};
