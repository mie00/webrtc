import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { ElementHandle, Page } from 'puppeteer';
import path, { dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR,
    FILE_ITEM_CONTAINER_SELECTOR, // Use the container selector
    FILE_COMPLETE_INDICATOR,      // Use the generic completion indicator
    FILE_DOWNLOAD_LINK_RECEIVER,  // Use the download link selector
    PUPPETEER_TIMEOUT,
    JEST_TIMEOUT,
    checkConnectionEstablished,
    calculateSHA256             // Import the SHA helper
} from './setup/testHelpers';

// --- Test File Configuration ---
const TEST_FILE_NAME = 'test-upload.txt';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_FILE_PATH = path.join(__dirname, TEST_FILE_NAME);
const TEST_FILE_CONTENT = 'This is a test file for E2E transfer.';
let EXPECTED_SHA256: string; // To store the hash

// --- Jest Test Suite ---
describe('WebRTC File Transfer E2E Test (using global setup)', () => {
    jest.setTimeout(JEST_TIMEOUT * 1.5); // Allow slightly more time for file transfer

    let pageA: Page;
    let pageB: Page;

    // Suite-specific setup/teardown for the test file
    beforeAll(() => {
        // Retrieve pages created in globalSetup
        pageA = globalThis.__PAGE_A__!;
        pageB = globalThis.__PAGE_B__!;

        expect(pageA).toBeDefined();
        expect(pageB).toBeDefined();

        // Create the dummy file
        console.log(`Creating test file for transfer test: ${TEST_FILE_PATH}`);
        fs.writeFileSync(TEST_FILE_PATH, TEST_FILE_CONTENT);
        // Calculate expected hash
        EXPECTED_SHA256 = calculateSHA256(TEST_FILE_CONTENT);
        console.log(`Expected SHA256: ${EXPECTED_SHA256}`);
    });

    afterAll(() => {
        // Delete the dummy file created by *this* suite
        if (fs.existsSync(TEST_FILE_PATH)) {
            console.log(`Deleting test file: ${TEST_FILE_PATH}`);
            fs.unlinkSync(TEST_FILE_PATH);
        }
    });

    test('should successfully transfer a file between two peers', async () => {
        console.log('--- Starting file transfer test (connection assumed established) ---');

        // Optional: Verify connection again quickly if desired
        // await checkConnectionEstablished(pageA, 'Page A (pre-transfer)');
        // await checkConnectionEstablished(pageB, 'Page B (pre-transfer)');

        try {
            // --- File Transfer Steps (Starts immediately) ---
            // switch tabs to pageA
            await pageA.bringToFront();

            await pageA.waitForSelector('::-p-text(<)', { visible: false, timeout: PUPPETEER_TIMEOUT });
            pageA.click('::-p-text(<)')

            // 1. Find the file input element on Page A (Sender)
            console.log('Waiting for file input element on Page A...');
            const fileInputElement = await pageA.waitForSelector(FILE_INPUT_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT });
            expect(fileInputElement).not.toBeNull();
            console.log('File input element found.');

            // 2. Upload the test file using the input element
            console.log(`Uploading test file: ${TEST_FILE_PATH}`);
            // Use type assertion if needed after expect check
            await (fileInputElement as ElementHandle<HTMLInputElement>).uploadFile(TEST_FILE_PATH);
            console.log('File selected for upload.');

            // 3. Wait for the file item container to appear on the sender side
            //    We need the file ID which is part of the container's ID (e.g., id="f-...")
            console.log('Waiting for file item container on Page A (Sender)...');
            // Use a selector that finds any element starting with id="f-" inside the relevant area
            // Adjust '#files-container' if your file list has a specific parent ID
            const fileItemSelectorPattern = `#files-container > div[id^="f-"]`; // Adjust parent selector if needed
            const senderFileItemContainer = await pageA.waitForSelector(fileItemSelectorPattern, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(senderFileItemContainer).not.toBeNull();

            const senderFileId = await senderFileItemContainer!.evaluate(el => el.id.replace('f-', ''));
            expect(senderFileId).toBeTruthy();
            console.log(`Detected file transfer with ID: ${senderFileId} on Sender`);

            // 4. Wait for Sender's completion indicator
            const senderCompleteSelector = FILE_COMPLETE_INDICATOR(senderFileId);
            console.log(`Waiting for sender completion indicator (${senderCompleteSelector})...`);
            await pageA.waitForSelector(senderCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 }); // Allow more time
            // Optionally check the text content if it's predictable (e.g., "Completed")
            // const senderStatusText = await pageA.$eval(senderCompleteSelector, el => el.textContent);
            // expect(senderStatusText).toContain('Completed'); // Or match the file size, etc.
            console.log('Sender completion indicator found.');

            // 5. Wait for Receiver's completion indicator (confirms file entry exists)
            const receiverCompleteSelector = FILE_COMPLETE_INDICATOR(senderFileId);
            console.log(`Waiting for receiver completion indicator (${receiverCompleteSelector}) on Page B...`);
            await pageB.waitForSelector(receiverCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 });
            console.log('Receiver completion indicator found.');

            // 6. Wait for Receiver's download link
            const receiverDownloadSelector = FILE_DOWNLOAD_LINK_RECEIVER(senderFileId);
            console.log(`Waiting for receiver download link (${receiverDownloadSelector}) on Page B...`);
            const downloadLink = await pageB.waitForSelector(receiverDownloadSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(downloadLink).not.toBeNull();
            console.log('Receiver download link found.');

            // 7. Get the blob URL and fetch content on Page B, then verify SHA
            console.log('Fetching received file content from Page B...');
            const receivedContent = await pageB.evaluate(async (selector) => {
                const link = document.querySelector(selector) as HTMLAnchorElement | null;
                if (!link || !link.href.startsWith('blob:')) {
                    throw new Error(`Download link not found or invalid href: ${link?.href}`);
                }
                const blobUrl = link.href;
                const response = await fetch(blobUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch blob: ${response.statusText}`);
                }
                // Assuming text file for simplicity, adjust if binary
                const text = await response.text();
                return text;
            }, receiverDownloadSelector);

            expect(receivedContent).toBeDefined();
            console.log('Received content fetched.');

            // 8. Calculate SHA of received content and compare
            const receivedSha256 = calculateSHA256(receivedContent);
            console.log(`Received SHA256: ${receivedSha256}`);
            expect(receivedSha256).toEqual(EXPECTED_SHA256);
            console.log('SHA256 hashes match.');

            console.log('--- TEST SUCCESS: File transfer verified (sender complete, receiver viewable, content match)! ---');

            // Keep debug wait if necessary
            if (process.env.DEBUG_WAIT) {
                console.log('DEBUG_WAIT is set, keeping browser open until pageB is closed (or timeout)...');
                 await new Promise(resolve => setTimeout(resolve, 3600 * 1000));
            }

        } catch (error) {
            console.error('--- FILE TRANSFER TEST FAILED ---');
            // Consider screenshots
            // if (pageA) await pageA.screenshot({ path: 'error_transfer_pageA.png' });
            // if (pageB) await pageB.screenshot({ path: 'error_transfer_pageB.png' });
            throw error;
        }
    });
});
