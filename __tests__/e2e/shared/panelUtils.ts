import type { Page } from 'puppeteer';
import {
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR
} from '../setup/testHelpers';

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

// Helper function to ensure the control panel is closed
export async function ensurePanelClosed(page: Page, pageName: string): Promise<void> {
    console.log(`Checking if control panel is closed on ${pageName}...`);
    const panel = await page.$(CONTROL_PANEL_SELECTOR);
    if (!panel) {
        throw new Error(`Control panel element (${CONTROL_PANEL_SELECTOR}) not found on ${pageName}`);
    }
    // Panel is closed if it has 'left-full' class
    const panelIsClosed = await panel.evaluate(el => el.classList.contains('left-full'));

    if (!panelIsClosed) { // If panel is open
        console.log(`Control panel is open on ${pageName}, attempting to close...`);
        const toggleButton = await page.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
        if (!toggleButton) {
            throw new Error(`Control panel toggle button (${CONTROL_PANEL_TOGGLE_SELECTOR}) not found on ${pageName}`);
        }
        await toggleButton.click();
        // Wait for panel to be closed by checking that 'left-full' class is added
        await page.waitForFunction(
            (panelSelector) => {
                const el = document.querySelector(panelSelector);
                return el && el.classList.contains('left-full'); // Check class is added
            },
            { timeout: PUPPETEER_TIMEOUT },
            CONTROL_PANEL_SELECTOR
        );
        console.log(`Control panel closed on ${pageName}.`);
    } else {
        console.log(`Control panel is already closed on ${pageName}.`);
    }
}
