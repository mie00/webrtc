const { mkdir } = require('node:fs/promises');
const { writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');

module.exports = async function () {
  console.log('\nJest Global Setup: Launching Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  // Store the browser instance in the global scope (only available in global teardown)
  global.__BROWSER_GLOBAL__ = browser;

  // Expose the WebSocket endpoint via a temporary file
  await mkdir(DIR, { recursive: true });
  const wsEndpoint = browser.wsEndpoint();
  await writeFile(path.join(DIR, 'wsEndpoint'), wsEndpoint);
  console.log(`Jest Global Setup: Puppeteer launched with endpoint: ${wsEndpoint}`);
};
