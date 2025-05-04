import { TestEnvironment as PuppeteerEnvironment } from 'jest-environment-puppeteer';
import type { Config } from '@jest/types';
import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';
import globalSetup from './globalSetup'; // Assuming default export from TS file
import globalTeardown from './globalTeardown'; // Assuming default export from TS file

class CustomPuppeteerEnvironment extends PuppeteerEnvironment {
    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
        super(config, context);
    }

    async setup() {
        await super.setup();
        // Assuming globalSetup is an async function that might need awaiting
        // If globalSetup doesn't return a promise or isn't async, remove await
        // Pass jestConfig if needed by setup. Accessing it via this.global might be necessary.
        // jest-environment-puppeteer might not automatically pass jestConfig to globalSetup.
        // We might need to adjust how globalSetup accesses config if required.
        await globalSetup.call(this);
        // Note: jest-environment-puppeteer already exposes browser, page etc.
        // to the global scope. globalSetup might leverage these.
    }

    async teardown() {
        // Assuming globalTeardown is an async function
        await globalTeardown.call(this);
        await super.teardown();
    }
}

export default CustomPuppeteerEnvironment; // Use ES6 default export
