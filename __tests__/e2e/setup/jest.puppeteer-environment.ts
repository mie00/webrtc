import { TestEnvironment as PuppeteerEnvironment } from 'jest-environment-puppeteer';
import type { Config } from '@jest/types';
import type { EnvironmentContext, JestEnvironmentConfig } from '@jest/environment';
import envSetup from './envSetup';
import envTeardown from './envTeardown';

class CustomPuppeteerEnvironment extends PuppeteerEnvironment {
    constructor(config: JestEnvironmentConfig, context: EnvironmentContext) {
        super(config, context);
    }

    async setup() {
        await super.setup();
        await envSetup.call(this);
    }

    async teardown() {
        await envTeardown.call(this);
        await super.teardown();
    }
}

export default CustomPuppeteerEnvironment; // Use ES6 default export
