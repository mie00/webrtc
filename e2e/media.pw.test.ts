import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown, StandardTeardownArgs } from './setup/pwStandardTeardown';
import {
    performCameraTestPw,
    performMicTestPw,
    performCombinedMediaTestPw, // New helper for combined tests
    type PageInfoPw,
} from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Media E2E Tests (2 Peers)', () => {
    // Give more time for media processing, stream establishment, and QR decoding
    test.setTimeout(PW_TIMEOUT * 10);

    let pageA: PlaywrightPage;
    let contextA: BrowserContext;
    let pageB: PlaywrightPage;
    let contextB: BrowserContext;

    let senderInfo: PageInfoPw;
    let receiverInfo: PageInfoPw[];

    test.beforeAll(async ({ browser }) => {
        // Media generation (e.g., setupCameraTestMediaPw, setupMicTestMediaPw)
        // is expected to be handled by globalSetup in playwright.config.ts

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
        // Media cleanup (e.g., teardownCameraTestMediaPw, teardownMicTestMediaPw)
        // is expected to be handled by globalTeardown in playwright.config.ts
    });

    test('Page A should stream video to Page B and QR code movement should be verified on Page B (Camera Test)', async () => {
        await performCameraTestPw(senderInfo, receiverInfo);
        console.log('--- TEST SUCCESS (Playwright): Camera test completed for 2 peers. ---');
    });

    test('Page A should stream audio to Page B, verify frequencies on B, then verify Page A is effectively muted for self-analysis (Mic Test)', async () => {
        await performMicTestPw(senderInfo, receiverInfo, true); // Pass true for checkSenderMutedState
        console.log('--- TEST SUCCESS (Playwright): Mic test completed for 2 peers. ---');
    });

    test('Page A should stream audio then video to Page B, verifying both streams (Combined Test: Audio First)', async () => {
        await performCombinedMediaTestPw(senderInfo, receiverInfo, 'audioFirst');
        console.log('--- TEST SUCCESS (Playwright): Combined (Audio First) test completed for 2 peers. ---');
    });

    test('Page A should stream video then audio to Page B, verifying both streams (Combined Test: Video First)', async () => {
        await performCombinedMediaTestPw(senderInfo, receiverInfo, 'videoFirst');
        console.log('--- TEST SUCCESS (Playwright): Combined (Video First) test completed for 2 peers. ---');
    });
});
