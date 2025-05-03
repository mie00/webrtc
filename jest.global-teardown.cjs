const { rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');

module.exports = async function () {
  console.log('\nJest Global Teardown: Closing Puppeteer...');
  // Close the browser instance that was saved in global setup
  if (global.__BROWSER_GLOBAL__) {
    await global.__BROWSER_GLOBAL__.close();
    console.log('Jest Global Teardown: Puppeteer closed.');
  } else {
    console.warn('Jest Global Teardown: Global browser instance not found.');
  }

  // Clean up the temporary directory
  try {
    await rm(DIR, { recursive: true, force: true });
    console.log(`Jest Global Teardown: Cleaned up ${DIR}.`);
  } catch (error) {
    console.error(`Jest Global Teardown: Error cleaning up ${DIR}:`, error);
  }
};
