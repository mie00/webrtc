export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset
  // extensionsToTreatAsEsm: ['.ts', '.svelte'], // Remove this line, handled by preset
  testEnvironment: 'jsdom', // Use built-in jsdom environment
  moduleFileExtensions: ['ts', 'js', 'svelte'],
  transform: {
    '^.+\\.js$': 'babel-jest', // Keep babel-jest for JS files if needed, or remove if all JS is handled by ts-jest/preset
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: true, // Re-add this line for ESM preset
      // isolatedModules: true, // Keep if needed, often default/handled by tsconfig
    }],
    '^.+\\.svelte$': ['svelte-jester', { preprocess: true }] // Ensure svelte-jester uses preprocess
  },
  testMatch: ['**/__tests__/**/*.test.(js|ts)'],
  setupFiles: ['./jest.setup.js'],
  // globals section is deprecated for ts-jest config
  moduleNameMapper: {
    // Handle module aliases for ESM
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    // Handle .js extension in imports when importing .ts files (ESM needs explicit extensions)
    // '^(\\.{1,2}/.*)\\.js$': '$1' // This might not be needed with ESM preset, test carefully
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
