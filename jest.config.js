export default {
  // preset: 'ts-jest/presets/js-with-babel', // Remove preset
  extensionsToTreatAsEsm: ['.ts', '.svelte'], // Add this line
  testEnvironment: 'jsdom', // Use built-in jsdom environment
  moduleFileExtensions: ['ts', 'js', 'svelte'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json', // Move tsconfig here
      // useESM: true, // Remove this line
      // isolatedModules: true, // Keep if needed, often default/handled by tsconfig
    }],
    '^.+\\.svelte$': 'svelte-jester'
  },
  testMatch: ['**/__tests__/**/*.test.(js|ts)'],
  setupFiles: ['./jest.setup.js'],
  // globals section is deprecated for ts-jest config
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
  verbose: true
};
