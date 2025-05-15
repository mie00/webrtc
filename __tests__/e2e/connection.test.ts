import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { checkConnectionEstablished, JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup'; // Import standardSetup
import { standardTeardown } from './setup/standardTeardown'; // Import standardTeardown


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

    test('should re-establish connection after one peer goes offline and comes back online', async () => {
        console.log('--- Test: Simulating Page B offline and online ---');

        // 1. Take Page B offline
        console.log('Setting Page B to offline mode...');
        await pageB.setOfflineMode(true);
        console.log('Page B is offline.');

        // 2. Wait for 5 seconds
        console.log('Waiting for 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('5 seconds passed.');

        // 3. Bring Page B back online
        console.log('Setting Page B back to online mode...');
        await pageB.setOfflineMode(false);
        console.log('Page B is online.');

        // 4. Wait a bit for reconnection to occur and propagate
        //    (ICE negotiation, etc. might take a moment)
        console.log('Waiting for 2 seconds for reconnection...');
        await new Promise(resolve => setTimeout(resolve, 2000));


        // 5. Verify connection is re-established on both pages
        console.log('Verifying connection on Page A...');
        await expect(checkConnectionEstablished(pageA, 'Page A (after Page B reconnect)')).resolves.toBeUndefined();
        console.log('Verifying connection on Page B...');
        await expect(checkConnectionEstablished(pageB, 'Page B (after reconnect)')).resolves.toBeUndefined();

        console.log('--- TEST SUCCESS: Connection re-established after offline/online cycle ---');
    });
});
