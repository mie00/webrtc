import { describe, test, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    setupCameraTestMedia,
    teardownCameraTestMedia,
    performCameraTest,
    type PageInfo,
} from '../shared/mediaTestHelpers'; // Updated import

// --- Jest Test Suite ---
describe('WebRTC Camera E2E Test (2 Peers)', () => {
    jest.setTimeout(JEST_TIMEOUT * 3); // Give more time for video processing and QR decoding

    let pageA: Page;
    let pageB: Page;
    let senderInfo: PageInfo;
    let receiverInfo: PageInfo[];

    beforeAll(async () => {
        await setupCameraTestMedia(); // Use shared media setup

        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;

        senderInfo = { page: pageA, name: 'Page A (Sender)' };
        receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
        await teardownCameraTestMedia(); // Use shared media teardown
    });

    test('Page A should stream video to Page B and QR code movement should be verified on Page B', async () => {
        await performCameraTest(senderInfo, receiverInfo);
        console.log('--- TEST SUCCESS: Camera test completed for 2 peers. ---');
    });
});
