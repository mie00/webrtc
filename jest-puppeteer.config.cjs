// Using .cjs extension for CommonJS compatibility
module.exports = {
  // Puppeteer launch options
  launch: {
    headless: process.env.DEBUG_WAIT?false:'new', // Set to false to run in non-headless mode
    slowMo: 50, // Optional: Slow down operations to observe better
    args: [
      `--use-fake-device-for-media-stream`,
      `--use-fake-ui-for-media-stream`,
      `--use-file-for-fake-video-capture=./__tests__/e2e/setup/camera.mjpeg`,
      '--window-size=2540,1080',
    ],
  },
  maxWorkers: 2,
  // Using jest-puppeteer preset is often simpler for E2E with Puppeteer
  preset: 'jest-puppeteer', // Recommended preset for Puppeteer tests
  // testEnvironment is usually handled by the preset, but keep if custom logic exists
  testEnvironment: './__tests__/e2e/setup/jest.puppeteer-environment.ts', // Keep custom env for page setup
  globalSetup: '<rootDir>/__tests__/e2e/setup/globalSetup.ts', // Use TS file for global setup
  globalTeardown: '<rootDir>/__tests__/e2e/setup/globalTeardown.ts', // Use TS file for global teardown
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    // Example: '^@components/(.*)$': '<rootDir>/src/components/$1',
    // Handle Svelte imports if needed for other tests (may not be needed for pure E2E)
    '^\\$app/(.*)$': [
        '<rootDir>/.svelte-kit/dev/runtime/app/$1',
        '<rootDir>/.svelte-kit/build/runtime/app/$1',
    ],
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    "^(\\.{1,2}/.*)\\.js$": "$1",
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
