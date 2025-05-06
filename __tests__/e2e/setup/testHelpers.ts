import crypto from 'crypto'; // Import crypto for hashing
import type { Page } from 'puppeteer';

// --- Configuration Constants ---
// Use test IDs for selectors
export const INVITE_URL_SELECTOR = '#test-copy-button'; // Button in CopyOverlay
export const INVITE_URL_COPIED_SELECTOR = '#test-copy-button'; // Same button, text changes but ID remains
export const CALL_BUTTON_SELECTOR = '#test-join'; // Button in CopyOverlay (already test ID)
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.test-indicator-connected'; // Class added to connected indicators
export const FILE_INPUT_SELECTOR = '#test-file-upload'; // Input in ControlPanel
// Selectors for elements within ControlPanel or MediaArea often need specific IDs added in components
export const CONTROL_PANEL_SELECTOR = '#test-control-panel';
export const CONTROL_PANEL_TOGGLE_SELECTOR = '#test-toggle-panel-button';
export const CHAT_INPUT_SELECTOR = '#test-chat-input';
export const CHAT_OUTPUT_CONTAINER_SELECTOR = '#test-chat-container'; // Already test ID
export const ATTACH_FILE_BUTTON_SELECTOR = '#test-attach-file-button';
export const TOGGLE_AUDIO_BUTTON_SELECTOR = '#test-toggle-audio-button';
export const TOGGLE_VIDEO_BUTTON_SELECTOR = '#test-toggle-video-button';
// Add other common selectors as needed


export const PUPPETEER_TIMEOUT = 7000;
export const SERVER_STARTUP_TIMEOUT = 45000;
export const JEST_TIMEOUT = SERVER_STARTUP_TIMEOUT + PUPPETEER_TIMEOUT + 20000; // Adjusted timeout

// --- Helper Function ---
export async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
    console.log(`Waiting for connection indicator in ${description}...`);
    // Assuming the indicator is initially hidden and becomes visible upon connection
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log(`Connection indicator found in ${description}.`);
}

// --- Hashing Helper ---
export function calculateSHA256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

// --- Page Teardown Helper ---
/**
 * Closes a Puppeteer page gracefully, clearing storage and handling errors.
 * @param page The Puppeteer Page instance to close.
 * @param name A descriptive name for the page (for logging).
 */
export async function closePage(page: Page | undefined, name: string): Promise<void> {
    if (page && !page.isClosed()) {
        try {
            // Clear storage before closing
            await page.evaluate(() => {
                window.localStorage.clear();
                // Attempt to delete IndexedDB, handle potential errors gracefully
                try {
                    indexedDB.deleteDatabase('firebaseLocalStorageDb');
                } catch (dbError) {
                    console.warn(`Warning: Could not delete IndexedDB for ${name}:`, dbError);
                }
            });
            await page.close();
            console.log(`${name} closed.`);
        } catch (error) {
            console.warn(`Warning: Error closing ${name} during teardown:`, error);
        }
    } else if (page) {
        console.log(`${name} was already closed.`);
    }
}
