import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { checkConnectionEstablished } from './setup/pwTestHelpers'; // Playwright version
import { standardSetup } from './setup/pwStandardSetup';         // Playwright version
import { standardTeardown } from './setup/pwStandardTeardown';   // Playwright version

test.describe('WebRTC Peer Connection E2E Test (Playwright)', () => {
    let pageA: Page;
    let pageB: Page;
    let contextA: BrowserContext;
    let contextB: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        // Run the standard Playwright setup and store pages and contexts
        const setupResult = await standardSetup(browser);
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        contextA = setupResult.contextA;
        contextB = setupResult.contextB;
    });

    test.afterAll(async () => {
        // Run the standard Playwright teardown
        await standardTeardown({ pageA, contextA, pageB, contextB });
    });

    test('should establish a WebRTC connection between two peers', async () => {
        console.log('--- Verifying connection established in standard setup (Playwright) ---');

        // The setup already established the connection, just verify it here.
        await checkConnectionEstablished(pageA, 'Page A (verify)');
        await checkConnectionEstablished(pageB, 'Page B (verify)');

        console.log('--- TEST SUCCESS: Connection verified post-setup (Playwright) ---');
    });

    // // DOES NOT WORK
    // test('should re-establish connection after one peer goes offline and comes back online', async () => {
    //     console.log('--- Test: Simulating Page B offline and online (Playwright) ---');

    //     // 1. Take Page B offline (using context)
    //     console.log('Setting Page B (context) to offline mode...');
    //     const client = await contextB.newCDPSession(pageB);

    //     // enable Network and Socket domains
    //     const wfd = client.send('Page.waitForDebugger');

    //     // 2. Wait for 5 seconds
    //     console.log('Waiting for 5 seconds...');
    //     await pageB.waitForTimeout(5000); // Playwright's way to wait
    //     console.log('5 seconds passed.');

    //     // 3. Bring Page B back online (using context)
    //     console.log('Setting Page B (context) back to online mode...');
    //     // 1) To clear the block list:
    //     await client.send('Runtime.runIfWaitingForDebugger');
    //     // 2) (Optional) If you don’t need any socket instrumentation any more:
    //     await wfd;
    //     console.log('Page B (context) is online.');

    //     // 4. Wait a bit for reconnection to occur
    //     console.log('Waiting for 2 seconds for reconnection...');
    //     await pageA.waitForTimeout(2000); // Give some time for ICE to re-negotiate


    //     // 5. Verify connection is re-established on both pages
    //     console.log('Verifying connection on Page A...');
    //     await checkConnectionEstablished(pageA, 'Page A (after Page B reconnect)');
    //     console.log('Verifying connection on Page B...');
    //     await checkConnectionEstablished(pageB, 'Page B (after reconnect)');

    //     console.log('--- TEST SUCCESS: Connection re-established after offline/online cycle (Playwright) ---');
    // });
});
