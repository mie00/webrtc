import { describe, test, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    setupMicTestMedia,
    teardownMicTestMedia,
    performMicTest,
    type PageInfo,
} from './shared/mediaTestHelpers'; // Updated import

// --- Jest Test Suite ---
describe('WebRTC Microphone E2E Test (2 Peers)', () => {
    jest.setTimeout(JEST_TIMEOUT * 2); // Allow time for audio generation and analysis

    let pageA: Page;
    let pageB: Page;
    let senderInfo: PageInfo;
    let receiverInfo: PageInfo[];

    beforeAll(async () => {
        await setupMicTestMedia(); // Use shared media setup

        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;

        senderInfo = { page: pageA, name: 'Page A (Sender)' };
        receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
        await teardownMicTestMedia(); // Use shared media teardown
    });

    test('Page A should stream audio to Page B, verify frequencies on B, then verify Page A is effectively muted for self-analysis', async () => {
        await performMicTest(senderInfo, receiverInfo, true); // Pass true for checkSenderMutedState
        console.log('--- TEST SUCCESS: Mic test completed for 2 peers. ---');
    });
});
