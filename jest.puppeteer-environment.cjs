const { readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
// Use Node environment as base for Puppeteer tests
const NodeEnvironment = require('jest-environment-node').default; // Use .default for ESM compatibility

const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');

class PuppeteerEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.testPath = context.testPath;
    console.log(`PuppeteerEnvironment: Initializing for ${this.testPath}`);
  }

  async setup() {
    await super.setup();
    console.log(`PuppeteerEnvironment: Setting up for ${this.testPath}...`);
    // Get the WebSocket endpoint from the file written by global setup
    const wsEndpointPath = path.join(DIR, 'wsEndpoint');
    try {
      const wsEndpoint = await readFile(wsEndpointPath, 'utf8');
      if (!wsEndpoint) {
        throw new Error('wsEndpoint file content is empty.');
      }
      console.log(`PuppeteerEnvironment: Connecting to browser at ${wsEndpoint}...`);
      // Connect Puppeteer to the existing browser instance
      // Expose the browser instance to the tests via the global object
      this.global.__BROWSER__ = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        // Increase the default timeout in case the browser is slow to respond
        slowMo: process.env.SLOWMO ? parseInt(process.env.SLOWMO, 10) : 0,
        defaultViewport: null // Optional: inherit viewport from launched browser
      });
      console.log(`PuppeteerEnvironment: Connected. Browser available as global.__BROWSER__`);
    } catch (error) {
      console.error(`PuppeteerEnvironment: Failed to read wsEndpoint file at ${wsEndpointPath} or connect to browser.`, error);
      throw new Error(`Puppeteer wsEndpoint not found at ${wsEndpointPath}. Did globalSetup run correctly? Error: ${error.message}`);
    }
  }

  async teardown() {
    console.log(`PuppeteerEnvironment: Tearing down for ${this.testPath}...`);
    // Disconnect the specific client, but don't close the browser here
    // The browser is closed in globalTeardown
    if (this.global.__BROWSER__) {
        try {
            await this.global.__BROWSER__.disconnect();
            console.log(`PuppeteerEnvironment: Disconnected from browser.`);
        } catch (disconnectError) {
            // Ignore errors on disconnect, browser might already be closing
            console.warn(`PuppeteerEnvironment: Error disconnecting from browser (might be ok if closing): ${disconnectError.message}`);
        }
    }
    this.global.__BROWSER__ = null; // Clear reference
    await super.teardown();
    console.log(`PuppeteerEnvironment: Teardown complete for ${this.testPath}.`);
  }

  getVmContext() {
    // Important for compatibility with NodeEnvironment
    return super.getVmContext();
  }
}

module.exports = PuppeteerEnvironment;
