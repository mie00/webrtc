import type { Page } from 'puppeteer';

// --- Configuration Constants ---
export const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)';
export const INVITE_URL_COPIED_SELECTOR = 'button ::-p-text(Copied successfully)';
export const CALL_BUTTON_SELECTOR = 'button#test-join';
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.bg-green-500';
export const FILE_INPUT_SELECTOR = '#file-upload';
export const FILE_PROGRESS_SELECTOR_SENDER = (fileId: string) => `progress#file-${fileId}`;
export const FILE_COMPLETE_INDICATOR_RECEIVER = (fileId: string) => `#f-${fileId} > span:last-child`;

export const PUPPETEER_TIMEOUT = 30000;
export const SERVER_STARTUP_TIMEOUT = 45000;
export const JEST_TIMEOUT = SERVER_STARTUP_TIMEOUT + PUPPETEER_TIMEOUT + 20000; // Adjusted timeout

// --- Helper Function ---
export async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
    console.log(`Waiting for connection indicator in ${description}...`);
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT });
    console.log(`Connection indicator found in ${description}.`);
}

// --- Test File Configuration (Specific to file-transfer test) ---
// Keep these separate or manage differently if needed globally
// export const TEST_FILE_NAME = 'test-upload.txt';
// export const TEST_FILE_PATH = path.join(__dirname, '..', TEST_FILE_NAME); // Adjust path relative to helper
// export const TEST_FILE_CONTENT = 'This is a test file for E2E transfer.';
