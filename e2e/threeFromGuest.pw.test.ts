import { test, expect, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { pwThreeClientSetup, ThreeClientSetupResult } from './setup/pwThreeClientSetup';
import { pwThreeClientTeardown } from './setup/pwThreeClientTeardown';
import {
    PW_TIMEOUT,
    CHAT_INPUT_SELECTOR
} from './setup/pwTestHelpers';
import { verifyMessageReceived } from './shared/pwChatTestHelpers';
import { ensurePanelOpen, ensurePanelClosed } from './shared/pwPanelUtils';
import {
    setupTestFiles,
    teardownTestFiles,
    performFileTransferTest,
    preparedTestCases, // Assuming preparedTestCases is compatible or a Pw version exists
    type TestCaseData // Assuming TestCaseData is compatible
} from './shared/pwFileTransferTestHelpers'; // Or from a shared data file if pure data
import {
    setupMicTestMediaPw, teardownMicTestMediaPw, performMicTestPw,
    setupCameraTestMediaPw, teardownCameraTestMediaPw, performCameraTestPw,
    setupWatchTestMediaPw, teardownWatchTestMediaPw, performWatchTestPw,
    type PageInfoPw
} from './shared/pwMediaTestHelpers';

test.describe('Three Client E2E Tests with Playwright (Page B as primary sender)', () => {
    test.setTimeout(PW_TIMEOUT * 20); // Increased timeout for multiple complex tests

    let pageA: PlaywrightPage, pageB: PlaywrightPage, pageC: PlaywrightPage;
    let contextA: BrowserContext, contextB: BrowserContext, contextC: BrowserContext;
    let senderInfoB: PageInfoPw;
    let receiversInfoForB: PageInfoPw[]; // A and C

    test.beforeAll(async ({ browser }) => {
        const setupResult: ThreeClientSetupResult = await pwThreeClientSetup(browser);
        pageA = setupResult.pageA; contextA = setupResult.contextA;
        pageB = setupResult.pageB; contextB = setupResult.contextB;
        pageC = setupResult.pageC; contextC = setupResult.contextC;

        senderInfoB = { page: pageB, name: 'Page B (Sender)' };
        receiversInfoForB = [
            { page: pageA, name: 'Page A (Receiver)' },
            { page: pageC, name: 'Page C (Receiver)' }
        ];

        await setupTestFiles(); // Moved to globalSetup
        // await setupMicTestMediaPw(); // Moved to globalSetup
        // await setupCameraTestMediaPw(); // Moved to globalSetup
        // await setupWatchTestMediaPw(); // Moved to globalSetup
    });

    test.afterAll(async () => {
        await pwThreeClientTeardown({ pageA, contextA, pageB, contextB, pageC, contextC });
        // await teardownTestFiles(); // Moved to globalTeardown
        // await teardownMicTestMediaPw(); // Moved to globalTeardown
        // await teardownCameraTestMediaPw(); // Moved to globalTeardown
        // await teardownWatchTestMediaPw(); // Moved to globalTeardown
    });

    test.describe('Chat Functionality (B sends, A & C receive)', () => {
        test('Page B should send a message and Page A & C should receive it', async () => {
            const messageFromB = `Hello from Page B (Playwright)! (${Date.now()})`;
            console.log(`\n--- Sending message from Page B: "${messageFromB}" ---`);
            await ensurePanelOpen(pageB, 'Page B');
            const chatInputB = pageB.locator(CHAT_INPUT_SELECTOR);
            await chatInputB.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
            await expect(chatInputB).toBeVisible();
            await chatInputB.fill(messageFromB);
            await pageB.keyboard.press('Enter');
            console.log(`Message sent from Page B.`);
            await verifyMessageReceived(pageA, 'Page A', messageFromB);
            await verifyMessageReceived(pageC, 'Page C', messageFromB);
            console.log(`--- Message successfully verified on Page A and Page C (Playwright) ---`);
        });
    });

    test.describe('File Transfer Functionality (B sends, A & C receive)', () => {
        for (const testCase of preparedTestCases) {
            test(`Page B should send file ${testCase.fileName} (${testCase.description}) and Page A & C should receive it ${testCase.tag || ''}`, async () => {
                test.skip(testCase.sizeBytes >= 1024*1024*1024, 'Still working on it');
                await performFileTransferTest(
                    pageB,
                    'Page B',
                    [pageA, pageC],
                    ['Page A', 'Page C'],
                    testCase as TestCaseData
                );
            });
        }
    });

    test.describe('Microphone Functionality (B sends, A & C receive) @media', () => {
        test('Page B should stream audio and Page A & C should receive it', async () => {
            test.setTimeout(PW_TIMEOUT * 4);
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performMicTestPw(senderInfoB, receiversInfoForB);
            console.log('--- Mic test (B -> A,C) successful (Playwright) ---');
        });
    });

    test.describe('Camera Functionality (B sends, A & C receive) @media', () => {
        test('Page B should stream video and Page A & C should receive it and verify QR', async () => {
            test.setTimeout(PW_TIMEOUT * 6);
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performCameraTestPw(senderInfoB, receiversInfoForB);
            console.log('--- Camera test (B -> A,C) successful (Playwright) ---');
        });
    });

    test.describe('Watch Functionality (B shares, A & C receive) @media', () => {
        test.skip(({ browserName }) => browserName === 'webkit', 'Watch tests are skipped on WebKit browsers (Safari/iOS)');
        test('Page B should share a video file and Page A & C should receive it', async () => {
            test.setTimeout(PW_TIMEOUT * 8);
            await ensurePanelClosed(pageA, 'Page A');
            await ensurePanelClosed(pageB, 'Page B');
            await ensurePanelClosed(pageC, 'Page C');
            await performWatchTestPw(senderInfoB, receiversInfoForB);
            console.log('--- Watch test (B -> A,C) successful (Playwright) ---');
        });
    });
});
