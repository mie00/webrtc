import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR,
    CHAT_INPUT_SELECTOR,
    CHAT_OUTPUT_CONTAINER_SELECTOR
} from './setup/testHelpers'; // Import selectors from helpers

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

    // Helper function to ensure the control panel is open
    async function ensurePanelOpen(page: Page, pageName: string) {
        console.log(`Checking if control panel is open on ${pageName}...`);
        const panel = await page.$(CONTROL_PANEL_SELECTOR);
        if (!panel) {
            throw new Error(`Control panel element not found on ${pageName}`);
        }
        const panelIsClosed = await panel.evaluate(el => el.classList.contains('left-full'));

        if (panelIsClosed) {
            console.log(`Control panel is closed on ${pageName}, opening...`);
            // Use the imported selector constant
            const toggleButton = await page.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            await toggleButton?.click();
            // Wait for the panel to slide open (check class change on the panel itself)
            await page.waitForFunction(
                (panelSelector) => !document.querySelector(panelSelector)?.classList.contains('left-full'),
                { timeout: PUPPETEER_TIMEOUT },
                CONTROL_PANEL_SELECTOR
            );
            console.log(`Control panel opened on ${pageName}.`);
        } else {
            console.log(`Control panel is already open on ${pageName}.`);
        }
    }

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

        // 3. Ensure panel is open on receiver
        await ensurePanelOpen(receiverPage, receiverName);

        // 4. Wait for the message to appear on the receiver's side by checking container content
        console.log(`Waiting for message "${message}" to appear in ${CHAT_OUTPUT_CONTAINER_SELECTOR} on ${receiverName}...`);
        await receiverPage.waitForFunction(
            (containerSelector, expectedText) => {
                const container = document.querySelector(containerSelector);
                // Check if the container exists and its text content includes the message
                return container?.textContent?.includes(expectedText) ?? false;
            },
            { timeout: PUPPETEER_TIMEOUT }, // Use appropriate timeout
            CHAT_OUTPUT_CONTAINER_SELECTOR,
            message
        );
        console.log(`Message "${message}" found in container on ${receiverName}.`);

        // 5. Verification is implicitly done by waitForFunction succeeding

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
