import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CHAT_INPUT_SELECTOR
} from './setup/testHelpers';
import { verifyMessageReceived } from './shared/chatTestHelpers';
import { ensurePanelOpen, ensurePanelClosed } from './shared/panelUtils';
import {
    setupTestFiles,
    teardownTestFiles,
    performFileTransferTest,
    preparedTestCases,
    type TestCaseData
} from './shared/fileTransferTestHelpers';
import {
    setupMicTestMedia, teardownMicTestMedia, performMicTest,
    setupCameraTestMedia, teardownCameraTestMedia, performCameraTest,
    setupWatchTestMedia, teardownWatchTestMedia, performWatchTest,
    type PageInfo
} from './shared/mediaTestHelpers';

describe('Three Client E2E Tests (Page B as primary sender)', () => {
    jest.setTimeout(JEST_TIMEOUT * 15); // Increased timeout for multiple complex tests

    let pageA: Page, pageB: Page, pageC: Page;
    let senderInfoB: PageInfo;
    let receiversInfoForB: PageInfo[]; // A and C

    beforeAll(async () => {
        const setupResult = await threeClientSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        pageC = setupResult.pageC;

        senderInfoB = { page: pageB, name: 'Page B (Sender)' };
        receiversInfoForB = [
            { page: pageA, name: 'Page A (Receiver)' },
            { page: pageC, name: 'Page C (Receiver)' }
        ];

        await setupTestFiles();
        await setupMicTestMedia();
        await setupCameraTestMedia();
        await setupWatchTestMedia();
    });

    afterAll(async () => {
        await threeClientTeardown({ pageA, pageB, pageC });
        await teardownTestFiles();
        await teardownMicTestMedia();
        await teardownCameraTestMedia();
        await teardownWatchTestMedia();
    });

    describe('Chat Functionality (B sends, A & C receive)', () => {
        test('Page B should send a message and Page A & C should receive it', async () => {
            const messageFromB = `Hello from Page B! (${Date.now()})`;
            console.log(`\n--- Sending message from Page B: "${messageFromB}" ---`);
            await ensurePanelOpen(pageB, 'Page B');
            const chatInputB = await pageB.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(chatInputB).toBeTruthy();
            await chatInputB!.type(messageFromB);
            await pageB.keyboard.press('Enter');
            console.log(`Message sent from Page B.`);
            await verifyMessageReceived(pageA, 'Page A', messageFromB);
            await verifyMessageReceived(pageC, 'Page C', messageFromB);
            console.log(`--- Message successfully verified on Page A and Page C ---`);
        });
    });

    describe('File Transfer Functionality (B sends, A & C receive)', () => {
        test.each(preparedTestCases)(
            'Page B should send file $fileName ($description) and Page A & C should receive it',
            async (testCase: TestCaseData) => {
                await performFileTransferTest(
                    pageB,
                    'Page B',
                    [pageA, pageC],
                    ['Page A', 'Page C'],
                    testCase
                );
            },
            PUPPETEER_TIMEOUT * 8
        );
    });

    describe('Microphone Functionality (B sends, A & C receive)', () => {
        test('Page B should stream audio and Page A & C should receive it', async () => {
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performMicTest(senderInfoB, receiversInfoForB);
            console.log('--- Mic test (B -> A,C) successful ---');
        }, JEST_TIMEOUT * 2); // Individual timeout for this test
    });

    describe('Camera Functionality (B sends, A & C receive)', () => {
        test('Page B should stream video and Page A & C should receive it and verify QR', async () => {
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performCameraTest(senderInfoB, receiversInfoForB);
            console.log('--- Camera test (B -> A,C) successful ---');
        }, JEST_TIMEOUT * 3); // Individual timeout for this test
    });

    describe('Watch Functionality (B shares, A & C receive)', () => {
        test('Page B should share a video file and Page A & C should receive it', async () => {
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performWatchTest(senderInfoB, receiversInfoForB);
            console.log('--- Watch test (B -> A,C) successful ---');
        }, JEST_TIMEOUT * 4); // Individual timeout for this test
    });
});

