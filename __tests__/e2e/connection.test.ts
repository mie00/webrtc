import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { checkConnectionEstablished, JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/envSetup'; // Import standardSetup
import { standardTeardown } from './setup/envTeardown'; // Import standardTeardown


// --- Jest Test Suite ---
describe('WebRTC Peer Connection E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        // Run the standard setup and store the pages
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
    });

    afterAll(async () => {
        // Run the standard teardown, passing the pages
        await standardTeardown({ pageA, pageB });
    });

    test('should establish a WebRTC connection between two peers', async () => {
        console.log('--- Verifying connection established in standard setup ---');

        // The setup already established the connection, just verify it here.
        // This confirms the state persists from globalSetup.
        await expect(checkConnectionEstablished(pageA, 'Page A (verify)')).resolves.toBeUndefined();
        await expect(checkConnectionEstablished(pageB, 'Page B (verify)')).resolves.toBeUndefined();

        console.log('--- TEST SUCCESS: Connection verified post-globalSetup ---');
    });

    // Add more tests here that rely on the existing connection if needed
});
