import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR, // Used by ensurePanelOpen
    CHAT_INPUT_SELECTOR,
    CHAT_OUTPUT_CONTAINER_SELECTOR // Used by verifyMessageReceived
} from './setup/testHelpers'; // Import selectors from helpers
import { verifyMessageReceived } from './shared/chatTestHelpers';
import { ensurePanelOpen } from './shared/panelUtils';

// --- Jest Test Suite ---
describe('WebRTC Chat E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
    });

    // ensurePanelOpen is now imported from ../shared/chatTestHelpers

    // Helper function to send a message and verify receipt
    async function sendMessageAndVerify(senderPage: Page, receiverPage: Page, message: string, senderName: string, receiverName: string) {
        console.log(`\n--- Sending message from ${senderName} to ${receiverName} ---`);
        console.log(`Message: "${message}"`);

        // 1. Ensure panel is open on sender
        await ensurePanelOpen(senderPage, senderName);

        // 2. Find chat input, type message, and press Enter
        console.log(`Typing message on ${senderName}...`);
        const chatInput = await senderPage.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
        await chatInput?.type(message);
        await senderPage.keyboard.press('Enter');
        console.log(`Message sent from ${senderName}.`);

        // 3. Ensure panel is open on receiver (already done by verifyMessageReceived)
        // await ensurePanelOpen(receiverPage, receiverName); // This call is now part of verifyMessageReceived

        // 4. Use the shared verifyMessageReceived function
        await verifyMessageReceived(receiverPage, receiverName, message);

        // 5. Verification is handled by verifyMessageReceived

        // Optional: Verify sender name (might need more specific selectors depending on structure)
        // const senderNameSelector = `...selector for sender name near the message...`;
        // await receiverPage.waitForSelector(senderNameSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
        // console.log(`Sender name verified on ${receiverName}.`);

        console.log(`--- Message successfully verified on ${receiverName} ---`);
    }

    test('should send a message from Page A to Page B', async () => {
        const message = `Hello from Page A! ${Date.now()}`;
        await sendMessageAndVerify(pageA, pageB, message, 'Page A', 'Page B');
    });

    test('should send a message from Page B to Page A', async () => {
        const message = `Reply from Page B! ${Date.now()}`;
        await sendMessageAndVerify(pageB, pageA, message, 'Page B', 'Page A');
    });

    test('should handle multiple messages back and forth', async () => {
        const message1 = `Test message 1 (A->B) ${Date.now()}`;
        await sendMessageAndVerify(pageA, pageB, message1, 'Page A', 'Page B');

        const message2 = `Test message 2 (B->A) ${Date.now()}`;
        await sendMessageAndVerify(pageB, pageA, message2, 'Page B', 'Page A');

        const message3 = `Test message 3 (A->B) ${Date.now()}`;
        await sendMessageAndVerify(pageA, pageB, message3, 'Page A', 'Page B');
    });
});
