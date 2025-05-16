import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown, StandardTeardownArgs } from './setup/pwStandardTeardown';
import {
    performRecordingTestPw, // New helper for recording tests
    type PageInfoPw,
    // Media setup functions like setupCameraTestMediaPw, setupMicTestMediaPw
    // are expected to be called by globalSetup in playwright.config.ts
} from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Recording E2E Tests (2 Peers)', () => {
    // Give ample time for media processing, stream establishment, recording, and file processing
    test.setTimeout(PW_TIMEOUT * 20); // Increased timeout for recording and file analysis

    let pageA: PlaywrightPage;
    let contextA: BrowserContext;
    let pageB: PlaywrightPage;
    let contextB: BrowserContext;

    let pageInfoA: PageInfoPw;
    let pageInfoB: PageInfoPw;

    test.beforeAll(async ({ browser }) => {
        const setupResult: StandardSetupResult = await standardSetup(browser);
        pageA = setupResult.pageA;
        contextA = setupResult.contextA;
        pageB = setupResult.pageB;
        contextB = setupResult.contextB;

        pageInfoA = { page: pageA, name: 'Page A' };
        pageInfoB = { page: pageB, name: 'Page B' };

        // It's assumed that globalSetup (in playwright.config.ts) has already run
        // and called setupMicTestMediaPw() and setupCameraTestMediaPw()
    });

    test.afterAll(async () => {
        await standardTeardown({ pageA, contextA, pageB, contextB });
        // Media cleanup (teardownMicTestMediaPw, teardownCameraTestMediaPw)
        // is assumed to be handled by globalTeardown in playwright.config.ts
    });

    test('Page A and Page B should record video and audio, then verify downloaded files', async () => {
        await performRecordingTestPw(pageInfoA, pageInfoB);
        console.log('--- TEST SUCCESS (Playwright): Recording test completed for 2 peers. ---');
    });
});
