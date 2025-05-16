import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown } from './setup/pwStandardTeardown';
import {
    setupCameraTestMediaPw,
    teardownCameraTestMediaPw,
    performCameraTestPw,
    type PageInfoPw,
} from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Camera E2E Test with Playwright (2 Peers)', () => {
    // Give more time for video processing and QR decoding
    test.setTimeout(PW_TIMEOUT * 10); // Increased timeout for media tests

    let pageA: PlaywrightPage;
    let contextA: BrowserContext;
    let pageB: PlaywrightPage;
    let contextB: BrowserContext;

    let senderInfo: PageInfoPw;
    let receiverInfo: PageInfoPw[];

    test.beforeAll(async ({ browser }) => {
        await setupCameraTestMediaPw();

        const setupResult: StandardSetupResult = await standardSetup(browser);
        pageA = setupResult.pageA;
        contextA = setupResult.contextA;
        pageB = setupResult.pageB;
        contextB = setupResult.contextB;

        senderInfo = { page: pageA, name: 'Page A (Sender)' };
        receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];
    });

    test.afterAll(async () => {
        // Pass contextA and contextB to standardTeardown
        await standardTeardown({ pageA, contextA, pageB, contextB });
        await teardownCameraTestMediaPw();
    });

    test('Page A should stream video to Page B and QR code movement should be verified on Page B', async () => {
        await performCameraTestPw(senderInfo, receiverInfo);
        console.log('--- TEST SUCCESS (Playwright): Camera test completed for 2 peers. ---');
    });
});