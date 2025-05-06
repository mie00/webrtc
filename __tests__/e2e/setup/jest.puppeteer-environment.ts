import { TestEnvironment as PuppeteerEnvironment } from 'jest-environment-puppeteer';
import type { Config } from '@jest/types';
import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';

class CustomPuppeteerEnvironment extends PuppeteerEnvironment {
    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
        super(config, context);
    }

    async setup() {
        await super.setup();
    }

    async teardown() {
        await super.teardown();
    }
}

export default CustomPuppeteerEnvironment; // Use ES6 default export
