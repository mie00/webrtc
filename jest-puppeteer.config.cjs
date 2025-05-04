// Using .cjs extension for CommonJS compatibility
module.exports = {
  // Using jest-puppeteer preset is often simpler for E2E with Puppeteer
  preset: 'jest-puppeteer', // Recommended preset for Puppeteer tests
  // testEnvironment is usually handled by the preset, but keep if custom logic exists
  testEnvironment: './jest.puppeteer-environment.cjs',
  // globalSetup: '<rootDir>/__tests__/e2e/setup/globalSetup.ts', // Point to the ts file
  // globalTeardown: '<rootDir>/__tests__/e2e/setup/globalTeardown.ts', // Point to the CJS file
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
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json', // Explicitly point to tsconfig
      useESM: true
    }],
    // Add transform for Svelte files if testing components directly elsewhere
    '^.+\\.svelte$': ['svelte-jester', { preprocess: true }],
  },
  moduleFileExtensions: ['js', 'ts', 'svelte', 'json', 'cjs'], // Added cjs
  extensionsToTreatAsEsm: ['.ts', '.svelte'], // Treat .ts and .svelte as ES Modules
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Keep your existing setup file if needed
  testMatch: [ // Ensure it finds tests in all specified directories
    '**/__tests__/unit/**/*.test.[jt]s?(x)',
    '**/__tests__/integration/**/*.test.[jt]s?(x)',
    '**/__tests__/e2e/**/*.test.[jt]s?(x)',
  ],
  // Add timeout for Puppeteer operations if needed globally, though we set it per suite too
  // testTimeout: 30000,
};
