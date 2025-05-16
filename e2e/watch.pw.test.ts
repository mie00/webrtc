import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown } from './setup/pwStandardTeardown';
import {
    setupWatchTestMediaPw,
    teardownWatchTestMediaPw,
    performWatchTestPw,
    type PageInfoPw,
} from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Watch (Share Video File) E2E Test with Playwright (2 Peers)', () => {
    // Increased timeout for media generation, upload, and analysis
    test.setTimeout(PW_TIMEOUT * 12); // Adjusted timeout

    let pageA: PlaywrightPage;
    let contextA: BrowserContext;
    let pageB: PlaywrightPage;
    let contextB: BrowserContext;

    let senderInfo: PageInfoPw;
    let receiverInfo: PageInfoPw[];

    test.beforeAll(async ({ browser }) => {
        // await setupWatchTestMediaPw(); // Moved to globalSetup

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
        // await teardownWatchTestMediaPw(); // Moved to globalTeardown
    });

    test('Page A should share an MP4 file, play on A, and verify audio/video on Page A & Page B', async () => {
        await performWatchTestPw(senderInfo, receiverInfo);
        console.log('--- TEST SUCCESS (Playwright): Watch test completed for 2 peers. ---');
    });
});
