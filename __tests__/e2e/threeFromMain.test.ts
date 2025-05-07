import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    // CONTROL_PANEL_SELECTOR, // No longer directly used here, handled by helpers
    // CONTROL_PANEL_TOGGLE_SELECTOR, // No longer directly used here, handled by helpers
    CHAT_INPUT_SELECTOR
    // CHAT_OUTPUT_CONTAINER_SELECTOR is used by verifyMessageReceived from shared
} from './setup/testHelpers'; // Import selectors
import { ensurePanelOpen, verifyMessageReceived } from './shared/chatTestHelpers';
import {
    setupTestFiles,
    teardownTestFiles,
    performFileTransferTest,
    preparedTestCases, // Use the populated array
    type TestCaseData
} from './shared/fileTransferTestHelpers';

// Increase timeout if file transfers are involved, especially for larger files.
// JEST_TIMEOUT is already quite generous. If issues arise, this might need adjustment.
// For now, individual file transfer tests have their own dynamic timeouts.
// jest.setTimeout(JEST_TIMEOUT * 5); // Example: if many large files are tested

describe('Three Client E2E Tests (Page A as primary sender)', () => {
    jest.setTimeout(JEST_TIMEOUT * (preparedTestCases.length > 3 ? 3 : 1)); // Adjust timeout based on number of file tests

    let pageA: Page;
    let pageB: Page;
    let pageC: Page;

    beforeAll(async () => {
        const setupResult = await threeClientSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        pageC = setupResult.pageC;
        await setupTestFiles(); // Prepare files needed for transfer tests
    });

    afterAll(async () => {
        await threeClientTeardown({ pageA, pageB, pageC });
        await teardownTestFiles(); // Clean up generated files
    });

    describe('Chat Functionality (A sends, B & C receive)', () => {
        test('Page A should send a message and Page B & C should receive it', async () => {
            const messageFromA = `Hello from Page A! (${Date.now()})`; // Unique message

            console.log(`\n--- Sending message from Page A ---`);
            console.log(`Message: "${messageFromA}"`);

            // 1. Ensure panel is open on Page A
            await ensurePanelOpen(pageA, 'Page A');

            // 2. Find chat input on Page A, type message, and press Enter
            console.log(`Typing message on Page A...`);
            const chatInputA = await pageA.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            if (!chatInputA) {
                throw new Error(`Chat input (${CHAT_INPUT_SELECTOR}) not found on Page A`);
            }
            await chatInputA.type(messageFromA);
            await pageA.keyboard.press('Enter');
            console.log(`Message sent from Page A.`);

            // 3. Verify message received on Page B
            await verifyMessageReceived(pageB, 'Page B', messageFromA);

            // 4. Verify message received on Page C
            await verifyMessageReceived(pageC, 'Page C', messageFromA);

            console.log(`--- Message successfully verified on Page B and Page C ---`);
        });
    });

    describe('File Transfer Functionality (A sends, B & C receive)', () => {
        // Use test.each to run the transfer logic for each prepared test case
        test.each(preparedTestCases)(
            'Page A should send file $fileName ($description) and Page B & C should receive it',
            async (testCase: TestCaseData) => {
                await performFileTransferTest(
                    pageA,
                    'Page A',
                    [pageB, pageC],
                    ['Page B', 'Page C'],
                    testCase
                    // ensurePanelOpen is now imported and used by performFileTransferTest internally
                );
            },
            PUPPETEER_TIMEOUT * 8 // Max timeout for each file transfer test (adjust as needed, base * multiplier is handled in helper)
        );
    });
});
