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

            await pageB.waitForSelector('::-p-text(<)', { visible: true, timeout: PUPPETEER_TIMEOUT });
            pageB.click('::-p-text(<)')

            await pageA.bringToFront();

            await pageA.waitForSelector('::-p-text(<)', { visible: true, timeout: PUPPETEER_TIMEOUT });
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

            // 6. Wait for Receiver's completion indicator text ("Completed")
            //    (Download link presence will be checked within evaluate)
            const receiverCompleteSelector = `::-p-text(Completed)`; // Or use file size
            console.log(`Waiting for receiver completion indicator text "Completed" near filename on Page B...`);
            await pageB.waitForSelector(receiverCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Receiver completion indicator text found.');


            // 7. Get the blob URL from the correct "Download" link and fetch content on Page B, then verify SHA
            console.log('Finding download link and fetching received file content from Page B...');
            const receivedContent = await pageB.evaluate(async (filename) => {
                // Find the element containing the filename text. Use XPath for robustness.
                const filenameXpath = `//*[normalize-space()='${filename}']`; // Find exact match, ignoring surrounding whitespace
                const filenameElementSnapshot = document.evaluate(filenameXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const filenameElement = filenameElementSnapshot.singleNodeValue as HTMLElement | null;

                if (!filenameElement) {
                    // Fallback: try contains if exact match fails
                    const filenameContainsXpath = `//*[contains(text(),'${filename}')]`;
                    const filenameContainsSnapshot = document.evaluate(filenameContainsXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const filenameContainsElement = filenameContainsSnapshot.singleNodeValue as HTMLElement | null;
                    if (!filenameContainsElement) {
                        throw new Error(`Element containing filename "${filename}" not found.`);
                    }
                    // If found via contains, use this element for the next step
                    // This assumes the first element found via contains is the correct one
                    console.warn(`Found filename "${filename}" using 'contains', not exact match.`);
                    // Re-assign filenameElement for clarity, though not strictly necessary if using filenameContainsElement directly
                    // filenameElement = filenameContainsElement;
                }

                // Use the element found (either exact or contains)
                const targetElement = filenameElement ?? (document.evaluate(`//*[contains(text(),'${filename}')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null);
                 if (!targetElement) {
                     throw new Error(`Element containing filename "${filename}" not found even with fallback.`);
                 }


                // Assume the "Download" link is within a nearby ancestor container (e.g., a parent div for the file item)
                // Adjust '.file-item-container' to the actual class or structure of the parent
                // Or use XPath axes like ancestor:: or following-sibling:: if structure is known
                const container = targetElement.closest('div'); // Simple closest div, might need refinement
                if (!container) {
                    throw new Error(`Could not find a container element near filename "${filename}".`);
                }

                // Find the "Download" link within that container using standard DOM methods
                const links = Array.from(container.querySelectorAll('a'));
                const downloadLink = links.find(a => a.textContent?.trim() === 'Download' && a.href.startsWith('blob:'));


                if (!downloadLink) {
                    // Add debug info if link not found
                    console.error(`Could not find "Download" link in container for "${filename}". Container HTML:`, container.innerHTML);
                    throw new Error(`"Download" link associated with "${filename}" not found or invalid href.`);
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
