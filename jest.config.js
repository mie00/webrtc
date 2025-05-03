export default {
  preset: 'ts-jest/presets/default-esm', // Use ESM preset
  // extensionsToTreatAsEsm: ['.ts', '.svelte'], // Remove this line, handled by preset
  testEnvironment: 'jsdom', // Use built-in jsdom environment
  moduleFileExtensions: ['ts', 'js', 'svelte'],
  transform: {
    // Remove babel-jest transform
    // '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': ['ts-jest', {
      // tsconfig: 'tsconfig.json', // Remove this line, ts-jest finds it by default
      useESM: true, // Required by the ESM preset
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
  // Ensure svelte and potentially other ESM modules in node_modules are transformed
  transformIgnorePatterns: [
    // Default is /node_modules/, so we need to whitelist svelte and its dependencies if they use ESM
    '/node_modules/(?!svelte)', // Allow transforming files directly within node_modules/svelte/
    // If svelte internally depends on other ESM packages not transformed by default, add them here too.
    // e.g., '/node_modules/(?!svelte|another-esm-pkg)'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,ts,svelte}',
    '!**/node_modules/**',
    '!**/thirdparty/**'
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testPathIgnorePatterns: ['/node_modules/'],
  verbose: true
};
