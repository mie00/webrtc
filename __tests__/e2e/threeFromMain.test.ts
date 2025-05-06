import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import { JEST_TIMEOUT, PUPPETEER_TIMEOUT } from './setup/testHelpers';

// Selectors needed for chat functionality (similar to chat.test.ts)
const CONTROL_PANEL_SELECTOR = '#control-panel'; // Adjust if your ID is different
const CHAT_INPUT_SELECTOR = '#chat-input'; // Adjust if your ID is different
const CHAT_MESSAGES_SELECTOR = '#chat-messages'; // Adjust if your ID is different
const CHAT_MESSAGE_SELECTOR = `${CHAT_MESSAGES_SELECTOR} > div`; // Selector for individual messages
const CONTROL_PANEL_TOGGLE_SELECTOR = '#toggle-control-panel'; // Selector for the panel toggle button

describe('Three Client Chat E2E Test (A sends, B & C receive)', () => {
    jest.setTimeout(JEST_TIMEOUT); // Use timeout from helpers

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
            // Find and click the toggle button using the defined selector
            const toggleButton = await page.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            if (!toggleButton) {
                throw new Error(`Control panel toggle button (${CONTROL_PANEL_TOGGLE_SELECTOR}) not found on ${pageName}`);
            }
            await toggleButton.click();
            // Wait for panel to be open by checking that 'left-full' class is removed
            await page.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && !el.classList.contains('left-full'); // Check class is removed
                },
                { timeout: PUPPETEER_TIMEOUT },
                CONTROL_PANEL_SELECTOR // Pass the panel selector itself
            );
            console.log(`Control panel opened on ${pageName}.`);
        } else {
            console.log(`Control panel is already open on ${pageName}.`);
        }
    }

    // Helper function to verify message reception
    async function verifyMessageReceived(receiverPage: Page, receiverName: string, expectedMessage: string) {
        console.log(`Verifying message "${expectedMessage}" on ${receiverName}...`);
        await ensurePanelOpen(receiverPage, receiverName); // Ensure panel is open to see messages

        const messageSelector = `${CHAT_MESSAGE_SELECTOR} ::-p-text(${expectedMessage})`; // Use Puppeteer's text selector

        try {
            await receiverPage.waitForSelector(messageSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 }); // Increased timeout for message arrival
            console.log(`Message found on ${receiverName}.`);
            // Optional: Add more specific checks if needed (e.g., sender ID)
        } catch (error) {
            console.error(`Error finding message "${expectedMessage}" on ${receiverName}:`, error);
            // Capture page state for debugging
            const messagesHtml = await receiverPage.$eval(CHAT_MESSAGES_SELECTOR, el => el.innerHTML).catch(() => 'Could not get chat messages HTML');
            console.error(`Current messages on ${receiverName}:\n${messagesHtml}`);
            throw new Error(`Message "${expectedMessage}" not found on ${receiverName} within timeout.`);
        }
    }


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
