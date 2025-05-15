import { describe, test, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    setupWatchTestMedia,
    teardownWatchTestMedia,
    performWatchTest,
    type PageInfo,
} from '../shared/mediaTestHelpers'; // Updated import

// --- Jest Test Suite ---
describe('WebRTC Watch (Share Video File) E2E Test (2 Peers)', () => {
    jest.setTimeout(JEST_TIMEOUT * 4); // Increased timeout for media generation, upload, and analysis

    let pageA: Page;
    let pageB: Page;
    let senderInfo: PageInfo;
    let receiverInfo: PageInfo[];

    beforeAll(async () => {
        await setupWatchTestMedia(); // Use shared media setup

        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;

        senderInfo = { page: pageA, name: 'Page A (Sender)' };
        receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
        await teardownWatchTestMedia(); // Use shared media teardown
    });

    test('Page A should share an MP4 file, play on A, and verify audio/video on Page A & Page B', async () => {
        await performWatchTest(senderInfo, receiverInfo);
        console.log('--- TEST SUCCESS: Watch test completed for 2 peers. ---');
    });
});
