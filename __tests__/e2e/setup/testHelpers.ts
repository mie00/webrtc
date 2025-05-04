import type { Page } from 'puppeteer';

// --- Configuration Constants ---
export const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)';
export const INVITE_URL_COPIED_SELECTOR = 'button ::-p-text(Copied successfully)';
export const CALL_BUTTON_SELECTOR = 'button#test-join';
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.bg-green-500';
import crypto from 'crypto'; // Import crypto for hashing
import type { Page } from 'puppeteer';

// --- Configuration Constants ---
export const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)';
export const INVITE_URL_COPIED_SELECTOR = 'button ::-p-text(Copied successfully)';
export const CALL_BUTTON_SELECTOR = 'button#test-join';
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.bg-green-500';
export const FILE_INPUT_SELECTOR = '#file-upload';
// Selector for the container of a specific file transfer item (used by both sender and receiver)
export const FILE_ITEM_CONTAINER_SELECTOR = (fileId: string) => `#f-${fileId}`;
// Selector for the completion indicator (e.g., "Completed" text or final size span) - Assuming same structure for sender/receiver
export const FILE_COMPLETE_INDICATOR = (fileId: string) => `${FILE_ITEM_CONTAINER_SELECTOR(fileId)} > span:last-child`;
// Selector for the download link on the receiver side
export const FILE_DOWNLOAD_LINK_RECEIVER = (fileId: string) => `${FILE_ITEM_CONTAINER_SELECTOR(fileId)} a[download]`;


export const PUPPETEER_TIMEOUT = 30000;
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
