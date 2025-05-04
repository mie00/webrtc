import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import {
    FILE_INPUT_SELECTOR,
    FILE_PROGRESS_SELECTOR_SENDER,
    FILE_COMPLETE_INDICATOR_RECEIVER,
    PUPPETEER_TIMEOUT,
    JEST_TIMEOUT,
    checkConnectionEstablished // Import if needed for verification, though setup should handle it
} from './setup/testHelpers'; // Import helpers

// --- Test File Configuration ---
const TEST_FILE_NAME = 'test-upload.txt';
const TEST_FILE_PATH = path.join(__dirname, TEST_FILE_NAME); // Place it near the test file
const TEST_FILE_CONTENT = 'This is a test file for E2E transfer.';

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

        // Create the dummy file needed *only* for this suite
        console.log(`Creating test file for transfer test: ${TEST_FILE_PATH}`);
        fs.writeFileSync(TEST_FILE_PATH, TEST_FILE_CONTENT);
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

            // 1. Find the file input element on Page A (Sender)
            console.log('Waiting for file input element on Page A...');
            const fileInputElement = await pageA.waitForSelector(FILE_INPUT_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT });
            expect(fileInputElement).not.toBeNull();
            console.log('File input element found.');

            // 2. Upload the test file using the input element
            console.log(`Uploading test file: ${TEST_FILE_PATH}`);
            // Use type assertion if needed after expect check
            await (fileInputElement!).uploadFile(TEST_FILE_PATH);
            console.log('File selected for upload.');

            // 3. Wait for transfer indicators
            console.log('Waiting for sender progress bar to appear...');
            const senderProgressSelectorPattern = 'progress[id^="file-"]';
            const senderProgressElement = await pageA.waitForSelector(senderProgressSelectorPattern, { visible: true, timeout: PUPPETEER_TIMEOUT });
            expect(senderProgressElement).not.toBeNull();

            const senderFileId = await senderProgressElement!.evaluate(el => el.id.replace('file-', ''));
            expect(senderFileId).toBeTruthy();
            console.log(`Detected file transfer with ID: ${senderFileId}`);

            // 4. Wait for Sender's progress to complete
            const senderProgressSelector = FILE_PROGRESS_SELECTOR_SENDER(senderFileId);
            console.log(`Waiting for sender progress bar (${senderProgressSelector}) to reach 100%...`);
            await pageA.waitForFunction(
                (selector) => {
                    const progress = document.querySelector(selector) as HTMLProgressElement | null;
                    // Check for value >= max, as sometimes it might exceed 100 slightly or max isn't 100
                    return progress && progress.value >= (progress.max || 100);
                },
                { timeout: PUPPETEER_TIMEOUT * 2 }, // Allow more time for transfer
                senderProgressSelector
            );
            console.log('Sender progress reached 100%.');

            // 5. Wait for Receiver's completion indicator
            const receiverCompleteSelector = FILE_COMPLETE_INDICATOR_RECEIVER(senderFileId);
            console.log(`Waiting for receiver completion indicator (${receiverCompleteSelector}) on Page B...`);
            await pageB.waitForSelector(receiverCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 });
            console.log('Receiver completion indicator found.');

            console.log('--- TEST SUCCESS: File transfer appears complete on both ends! ---');

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
