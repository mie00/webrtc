import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { ElementHandle, Page } from 'puppeteer';
import path, { dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR,
    // Removed unused ID-based selectors from import
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

            // --- Sender Verification ---

            // 3. Wait for the filename to appear on Page A (Sender)
            const senderFilenameSelector = `::-p-text(${TEST_FILE_NAME})`;
            console.log(`Waiting for filename "${TEST_FILE_NAME}" to appear on Page A (Sender)...`);
            await pageA.waitForSelector(senderFilenameSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Filename found on Sender.');

            // 4. Wait for Sender's completion indicator text ("Completed")
            //    Adjust "Completed" if the actual text is different (e.g., file size)
            const senderCompleteSelector = `::-p-text(Completed)`; // Or use file size if that's the final state text
            console.log(`Waiting for sender completion indicator text "Completed" near filename on Page A...`);
            // We assume "Completed" appears near the filename. waitForSelector should find it anywhere initially.
            // If needed, make the selector more specific using XPath relative to the filename.
            await pageA.waitForSelector(senderCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 }); // Allow more time
            console.log('Sender completion indicator text found.');


            // --- Receiver Verification ---

            // 5. Wait for the filename to appear on Page B (Receiver)
            const receiverFilenameSelector = `::-p-text(${TEST_FILE_NAME})`;
            console.log(`Waiting for filename "${TEST_FILE_NAME}" to appear on Page B (Receiver)...`);
            await pageB.waitForSelector(receiverFilenameSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 }); // Allow more time for transfer
            console.log('Filename found on Receiver.');

            // 6. Wait for Receiver's download link (which should contain the filename)
            //    We target an 'a' tag containing the filename text.
            const receiverDownloadSelector = `a ::-p-text(${TEST_FILE_NAME})`;
            console.log(`Waiting for receiver download link with text "${TEST_FILE_NAME}" on Page B...`);
            const downloadLink = await pageB.waitForSelector(receiverDownloadSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(downloadLink).not.toBeNull();
            console.log('Receiver download link found.');

            // 7. Wait for Receiver's completion indicator text ("Completed")
            const receiverCompleteSelector = `::-p-text(Completed)`; // Or use file size
            console.log(`Waiting for receiver completion indicator text "Completed" near filename on Page B...`);
            await pageB.waitForSelector(receiverCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Receiver completion indicator text found.');


            // 8. Get the blob URL from the download link and fetch content on Page B, then verify SHA
            console.log('Fetching received file content from Page B...');
            const receivedContent = await pageB.evaluate(async (filename) => {
                // Find the link again within evaluate using the filename
                // This assumes the link text *is* the filename. Adjust if link text is different.
                const links = Array.from(document.querySelectorAll('a'));
                const link = links.find(a => a.textContent?.trim() === filename && a.href.startsWith('blob:'));

                if (!link) {
                    throw new Error(`Download link with text "${filename}" not found or invalid href.`);
                }
                const blobUrl = link.href;
                const response = await fetch(blobUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch blob: ${response.statusText}`);
                }
                // Assuming text file for simplicity, adjust if binary
                const text = await response.text();
                return text;
            }, TEST_FILE_NAME); // Pass filename to evaluate

            expect(receivedContent).toBeDefined();
            console.log('Received content fetched.');

            // 9. Calculate SHA of received content and compare
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
