export default {
  preset: 'ts-jest/presets/js-with-babel',
  testEnvironment: 'jest-environment-jsdom-sixteen',
  moduleFileExtensions: ['ts', 'js', 'svelte'],
  transform: {
    '^.+\\.svelte$': ['svelte-jester', {
      preprocess: true
    }],
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  },
  testMatch: ['**/__tests__/**/*.test.(js|ts)'],
  setupFiles: ['./jest.setup.js'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: 'tsconfig.json',
      useESM: true
    }
  },
  moduleNameMapper: {
    // Handle module aliases
    '^\\$lib(.*)$': '<rootDir>/src/lib$1',
    // Handle .js extension in imports when importing .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverageFrom: [
    'src/**/*.{js,ts,svelte}',
    '!**/node_modules/**',
    '!**/thirdparty/**'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true,
  extensionsToTreatAsEsm: ['.ts', '.svelte']
};
