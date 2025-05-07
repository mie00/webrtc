import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    // CONTROL_PANEL_SELECTOR, // No longer directly used here
    // CONTROL_PANEL_TOGGLE_SELECTOR, // No longer directly used here
    CHAT_INPUT_SELECTOR
    // CHAT_OUTPUT_CONTAINER_SELECTOR is used by verifyMessageReceived from shared
} from './setup/testHelpers'; // Import selectors
import { ensurePanelOpen, verifyMessageReceived } from './shared/chatTestHelpers';
import {
    setupTestFiles,
    teardownTestFiles,
    performFileTransferTest,
    preparedTestCases, // Use the populated array
    TestCaseData
} from './shared/fileTransferTestHelpers';

// jest.setTimeout(JEST_TIMEOUT * 5); // Example if file tests are long

describe('Three Client E2E Tests (Page B as primary sender)', () => {
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

    describe('Chat Functionality (B sends, A & C receive)', () => {
        test('Page B should send a message and Page A & C should receive it', async () => {
            const messageFromB = `Hello from Page B! (${Date.now()})`; // Unique message, changed sender

            console.log(`\n--- Sending message from Page B ---`); // Changed sender
            console.log(`Message: "${messageFromB}"`);

            // 1. Ensure panel is open on Page B (Sender)
            await ensurePanelOpen(pageB, 'Page B'); // Changed sender page

            // 2. Find chat input on Page B, type message, and press Enter
            console.log(`Typing message on Page B...`); // Changed sender page
            const chatInputB = await pageB.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT }); // Changed sender page variable
            if (!chatInputB) {
                throw new Error(`Chat input (${CHAT_INPUT_SELECTOR}) not found on Page B`); // Changed sender page
            }
            await chatInputB.type(messageFromB);
            await pageB.keyboard.press('Enter'); // Changed sender page
            console.log(`Message sent from Page B.`); // Changed sender page

            // 3. Verify message received on Page A (Receiver)
            await verifyMessageReceived(pageA, 'Page A', messageFromB); // Changed receiver page

            // 4. Verify message received on Page C (Receiver)
            await verifyMessageReceived(pageC, 'Page C', messageFromB); // Kept receiver page C

            console.log(`--- Message successfully verified on Page A and Page C ---`); // Changed receiver pages
        });
    });

    describe('File Transfer Functionality (B sends, A & C receive)', () => {
        // Use test.each to run the transfer logic for each prepared test case
        test.each(preparedTestCases)(
            'Page B should send file $fileName ($description) and Page A & C should receive it',
            async (testCase: TestCaseData) => {
                await performFileTransferTest(
                    pageB,
                    'Page B',
                    [pageA, pageC],
                    ['Page A', 'Page C'],
                    testCase
                    // ensurePanelOpen is now imported and used by performFileTransferTest internally
                );
            },
            PUPPETEER_TIMEOUT * 8 // Max timeout for each file transfer test
        );
    });
});
        console.log(`Message: "${messageFromB}"`);

        // 1. Ensure panel is open on Page B (Sender)
        await ensurePanelOpen(pageB, 'Page B'); // Changed sender page

        // 2. Find chat input on Page B, type message, and press Enter
        console.log(`Typing message on Page B...`); // Changed sender page
        const chatInputB = await pageB.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT }); // Changed sender page variable
        if (!chatInputB) {
            throw new Error(`Chat input (${CHAT_INPUT_SELECTOR}) not found on Page B`); // Changed sender page
        }
        await chatInputB.type(messageFromB);
        await pageB.keyboard.press('Enter'); // Changed sender page
        console.log(`Message sent from Page B.`); // Changed sender page

        // 3. Verify message received on Page A (Receiver)
        await verifyMessageReceived(pageA, 'Page A', messageFromB); // Changed receiver page

        // 4. Verify message received on Page C (Receiver)
        await verifyMessageReceived(pageC, 'Page C', messageFromB); // Kept receiver page C

        console.log(`--- Message successfully verified on Page A and Page C ---`); // Changed receiver pages
    });
});
