import type { Page } from 'puppeteer';
import {
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR,
    CHAT_OUTPUT_CONTAINER_SELECTOR
} from '../setup/testHelpers'; // Adjusted path

// Helper function to ensure the control panel (containing chat) is open
export async function ensurePanelOpen(page: Page, pageName: string): Promise<void> {
    console.log(`Checking if control panel is open on ${pageName}...`);
    const panel = await page.$(CONTROL_PANEL_SELECTOR);
    if (!panel) {
        throw new Error(`Control panel element (${CONTROL_PANEL_SELECTOR}) not found on ${pageName}`);
    }
    // Check if the panel is visually hidden using the 'left-full' class
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
