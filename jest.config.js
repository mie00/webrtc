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
      isolatedModules: true
    }
  }
};
