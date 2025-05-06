import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR,
    CHAT_INPUT_SELECTOR,
    CHAT_OUTPUT_CONTAINER_SELECTOR
} from './setup/testHelpers'; // Import selectors

describe('Three Client Chat E2E Test (B sends, A & C receive)', () => { // Changed description
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;
    let pageC: Page;

    beforeAll(async () => {
        const setupResult = await threeClientSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        pageC = setupResult.pageC;
    });

    afterAll(async () => {
        await threeClientTeardown({ pageA, pageB, pageC });
    });

    // Helper function to ensure the control panel (containing chat) is open
    async function ensurePanelOpen(page: Page, pageName: string) {
        console.log(`Checking if control panel is open on ${pageName}...`);
        const panel = await page.$(CONTROL_PANEL_SELECTOR);
        if (!panel) {
            throw new Error(`Control panel element (${CONTROL_PANEL_SELECTOR}) not found on ${pageName}`);
        }
        // Check if the panel is visually hidden using the 'left-full' class (like in chat.test.ts)
        const panelIsClosed = await panel.evaluate(el => el.classList.contains('left-full'));

        if (panelIsClosed) {
            console.log(`Control panel is closed on ${pageName}, attempting to open...`);
            // Find and click the toggle button using the imported selector
            const toggleButton = await page.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            if (!toggleButton) {
                throw new Error(`Control panel toggle button (${CONTROL_PANEL_TOGGLE_SELECTOR}) not found on ${pageName}`);
            }
            await toggleButton.click();
            // Wait for panel to be open by checking that 'left-full' class is removed from the panel
            await page.waitForFunction(
                (panelSelector) => {
                    const el = document.querySelector(panelSelector);
                    return el && !el.classList.contains('left-full'); // Check class is removed
                },
                { timeout: PUPPETEER_TIMEOUT },
                CONTROL_PANEL_SELECTOR // Pass the panel selector ID
            );
            console.log(`Control panel opened on ${pageName}.`);
        } else {
            console.log(`Control panel is already open on ${pageName}.`);
        }
    }

    // Helper function to verify message reception
    async function verifyMessageReceived(receiverPage: Page, receiverName: string, expectedMessage: string) {
        console.log(`Verifying message "${expectedMessage}" appears in ${CHAT_OUTPUT_CONTAINER_SELECTOR} on ${receiverName}...`);
        await ensurePanelOpen(receiverPage, receiverName); // Ensure panel is open

        try {
            // Wait for the message text to appear within the container
            await receiverPage.waitForFunction(
                (containerSelector, expectedText) => {
                    const container = document.querySelector(containerSelector);
                    return container?.textContent?.includes(expectedText) ?? false;
                },
                { timeout: PUPPETEER_TIMEOUT * 2 }, // Increased timeout
                CHAT_OUTPUT_CONTAINER_SELECTOR,
                expectedMessage
            );
            console.log(`Message "${expectedMessage}" found in container on ${receiverName}.`);
        } catch (error) {
            console.error(`Error waiting for message "${expectedMessage}" in container on ${receiverName}:`, error);
            // Capture page state for debugging
            const messagesHtml = await receiverPage.$eval(CHAT_OUTPUT_CONTAINER_SELECTOR, el => el.innerHTML).catch(() => 'Could not get chat messages HTML');
            console.error(`Current messages on ${receiverName}:\n${messagesHtml}`);
            throw new Error(`Message "${expectedMessage}" not found in container on ${receiverName} within timeout.`);
        }
    }


    test('Page B should send a message and Page A & C should receive it', async () => { // Changed test description
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
