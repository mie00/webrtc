import type { Page } from 'puppeteer';
import {
    PUPPETEER_TIMEOUT,
    CHAT_OUTPUT_CONTAINER_SELECTOR
} from '../setup/testHelpers'; // Adjusted path
import { ensurePanelOpen } from './panelUtils';

// Helper function to verify message reception
export async function verifyMessageReceived(receiverPage: Page, receiverName: string, expectedMessage: string): Promise<void> {
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
