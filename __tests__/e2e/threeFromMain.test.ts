import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CHAT_INPUT_SELECTOR
} from './setup/testHelpers';
import { ensurePanelOpen, verifyMessageReceived } from './shared/chatTestHelpers';
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


describe('Three Client E2E Tests (Page A as primary sender)', () => {
    jest.setTimeout(JEST_TIMEOUT * 15); // Increased timeout for multiple complex tests

    let pageA: Page, pageB: Page, pageC: Page;
    let senderInfoA: PageInfo;
    let receiversInfoForA: PageInfo[]; // B and C

    beforeAll(async () => {
        const setupResult = await threeClientSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        pageC = setupResult.pageC;

        senderInfoA = { page: pageA, name: 'Page A (Sender)' };
        receiversInfoForA = [
            { page: pageB, name: 'Page B (Receiver)' },
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

    describe('Chat Functionality (A sends, B & C receive)', () => {
        test('Page A should send a message and Page B & C should receive it', async () => {
            const messageFromA = `Hello from Page A! (${Date.now()})`;
            console.log(`\n--- Sending message from Page A: "${messageFromA}" ---`);
            await ensurePanelOpen(pageA, 'Page A');
            const chatInputA = await pageA.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(chatInputA).toBeTruthy();
            await chatInputA!.type(messageFromA);
            await pageA.keyboard.press('Enter');
            console.log(`Message sent from Page A.`);
            await verifyMessageReceived(pageB, 'Page B', messageFromA);
            await verifyMessageReceived(pageC, 'Page C', messageFromA);
            console.log(`--- Message successfully verified on Page B and Page C ---`);
        });
    });

    describe('File Transfer Functionality (A sends, B & C receive)', () => {
        test.each(preparedTestCases)(
            'Page A should send file $fileName ($description) and Page B & C should receive it',
            async (testCase: TestCaseData) => {
                await performFileTransferTest(
                    pageA,
                    'Page A',
                    [pageB, pageC],
                    ['Page B', 'Page C'],
                    testCase
                );
            },
            PUPPETEER_TIMEOUT * 8
        );
    });

    describe('Microphone Functionality (A sends, B & C receive)', () => {
        test('Page A should stream audio and Page B & C should receive it', async () => {
            await performMicTest(senderInfoA, receiversInfoForA);
            console.log('--- Mic test (A -> B,C) successful ---');
        }, JEST_TIMEOUT * 2);
    });

    describe('Camera Functionality (A sends, B & C receive)', () => {
        test('Page A should stream video and Page B & C should receive it and verify QR', async () => {
            await performCameraTest(senderInfoA, receiversInfoForA);
            console.log('--- Camera test (A -> B,C) successful ---');
        }, JEST_TIMEOUT * 3);
    });

    describe('Watch Functionality (A shares, B & C receive)', () => {
        test('Page A should share a video file and Page B & C should receive it', async () => {
            await performWatchTest(senderInfoA, receiversInfoForA);
            console.log('--- Watch test (A -> B,C) successful ---');
        }, JEST_TIMEOUT * 4);
    });
});
