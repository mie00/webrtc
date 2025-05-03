// Using .cjs extension for CommonJS compatibility

module.exports = {
  // Inherit defaults from ts-jest, but override specific settings
  preset: 'ts-jest/presets/default-esm', // Use ESM preset suitable for TypeScript and ES Modules
  testEnvironment: './jest.puppeteer-environment.cjs', // Use our custom Puppeteer environment
  globalSetup: './jest.global-setup.cjs',
  globalTeardown: './jest.global-teardown.cjs',
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    // Example: '^@components/(.*)$': '<rootDir>/src/components/$1',
    // Handle Svelte imports if needed for other tests (may not be needed for pure E2E)
    '^\\$app/(.*)$': [
        '<rootDir>/.svelte-kit/dev/runtime/app/$1',
        '<rootDir>/.svelte-kit/build/runtime/app/$1',
    ],
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
  },
  transform: {
    // Use ts-jest for JS/TS files (needed for ts-jest preset)
    '^.+\\.(t|j)sx?$': ['ts-jest', { useESM: true }],
    // Add transform for Svelte files if testing components directly elsewhere
    '^.+\\.svelte$': ['svelte-jester', { preprocess: true }],
  },
  moduleFileExtensions: ['js', 'ts', 'svelte', 'json', 'cjs'], // Added cjs
  extensionsToTreatAsEsm: ['.ts', '.svelte'], // Treat .ts and .svelte as ES Modules
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Keep your existing setup file if needed
  testMatch: [ // Ensure it finds tests in all specified directories
    '**/__tests__/unit/**/*.test.[jt]s?(x)',
    '**/__tests__/integration/**/*.test.[jt]s?(x)',
    '**/__tests__/e2e/**/*.test.[jt]s?(x)',
  ],
  // Add timeout for Puppeteer operations if needed globally, though we set it per suite too
  // testTimeout: 30000,
};
