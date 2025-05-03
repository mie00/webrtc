export default {
  // preset: 'ts-jest/presets/default-esm', // Remove preset, configure manually
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'ts', 'svelte'], // Ensure 'js' is first or present
  transform: {
    // Use ts-jest for .ts files, configured for ESM
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.json' // Explicitly point to tsconfig
    }],
    // Use svelte-jester for .svelte files
    '^.+\\.svelte$': ['svelte-jester', {
      preprocess: true
    }]
    // Note: No transform for .js files needed unless you have JS files using non-standard syntax
  },
  // Ignore transformations for node_modules, common for ESM setups
  // Adjust if specific node_modules need transformation (e.g., are ESM)
  transformIgnorePatterns: [
    '/node_modules/',
    '\\.pnp\\.[^\\/]+$' // Add default pattern from Jest docs
  ],
  testMatch: ['**/__tests__/**/*.test.(js|ts)'], // Keep this
  // Add this section to indicate which file extensions should be treated as ESM
  extensionsToTreatAsEsm: ['.ts', '.svelte'],
  // setupFiles runs before the environment is set up. Use setupFilesAfterEnv for mocks.
  setupFilesAfterEnv: ['./jest.setup.js'],
  // globals section is deprecated for ts-jest config
  moduleNameMapper: {
    // Handle module aliases for ESM
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    // Map .js imports to .ts files for ESM module resolution in tests
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Remove transformIgnorePatterns - let the preset and transformers handle it
  // transformIgnorePatterns: [ ... ],
  collectCoverageFrom: [
    'src/**/*.{js,ts,svelte}',
    '!**/node_modules/**',
    '!**/thirdparty/**'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true
};
