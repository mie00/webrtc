import crypto from 'crypto'; // Import crypto for hashing
import type { Page } from 'puppeteer';

// --- Configuration Constants ---
export const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)';
export const INVITE_URL_COPIED_SELECTOR = 'button ::-p-text(Copied successfully)';
export const CALL_BUTTON_SELECTOR = 'button#test-join';
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.bg-green-500';
export const FILE_INPUT_SELECTOR = '#file-upload'; // Assuming this targets the actual <input type="file">
// Removed ID-based selectors: FILE_ITEM_CONTAINER_SELECTOR, FILE_COMPLETE_INDICATOR, FILE_DOWNLOAD_LINK_RECEIVER
// We will use text-based selectors directly in the test.


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
