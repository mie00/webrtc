import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown, StandardTeardownArgs } from './setup/pwStandardTeardown';
import {
    setupMicTestMediaPw,
    teardownMicTestMediaPw,
    performMicTestPw,
    type PageInfoPw,
} from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Microphone E2E Test with Playwright (2 Peers)', () => {
    // Playwright's default test timeout is 30s.
    // This test involves media generation and analysis, so might need more.
    // test.slow() triples the timeout. Or use test.setTimeout().
    test.setTimeout(PW_TIMEOUT * 10); // Example: 70 seconds

    let pageA: PlaywrightPage;
    let contextA: BrowserContext;
    let pageB: PlaywrightPage;
    let contextB: BrowserContext;

    let senderInfo: PageInfoPw;
    let receiverInfo: PageInfoPw[];

    test.beforeAll(async ({ browser }) => {
        // await setupMicTestMediaPw(); // Moved to globalSetup

        const setupResult: StandardSetupResult = await standardSetup(browser);
        pageA = setupResult.pageA;
        contextA = setupResult.contextA;
        pageB = setupResult.pageB;
        contextB = setupResult.contextB;

        senderInfo = { page: pageA, name: 'Page A (Sender)' };
        receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];
    });

    test.afterAll(async () => {
        await standardTeardown({ pageA, contextA, pageB, contextB });
        // await teardownMicTestMediaPw(); // Moved to globalTeardown
    });

    test('Page A should stream audio to Page B, verify frequencies on B, then verify Page A is effectively muted for self-analysis', async () => {
        await performMicTestPw(senderInfo, receiverInfo, true); // Pass true for checkSenderMutedState
        console.log('--- TEST SUCCESS (Playwright): Mic test completed for 2 peers. ---');
    });
});
