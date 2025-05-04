import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { ElementHandle, Page } from 'puppeteer';
import path, { dirname } from 'path';
import fs from 'fs-extra'; // Using fs-extra for ensureDirSync and potentially async operations
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR,
    PUPPETEER_TIMEOUT,
    JEST_TIMEOUT,
    checkConnectionEstablished,
    calculateSHA256
} from './setup/testHelpers'; // Assuming calculateSHA256 is exported from here

// --- Test Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_FILES_DIR = path.join(__dirname, 'test-transfer-files');

interface TestCase {
    description: string;
    sizeBytes: number;
    fileName: string;
}

// Define test cases
const testCases = [
    { description: '0 Bytes', sizeBytes: 0, fileName: 'test-0B.bin' },
    // { description: '1 Bytes', sizeBytes: 1, fileName: 'test-1B-1.bin' },
    // { description: '1 Bytes again', sizeBytes: 1, fileName: 'test-1B-2.bin' },
    // { description: '100 Bytes', sizeBytes: 100, fileName: 'test-100B.bin' },
    // { description: '1 MB', sizeBytes: 1 * 1024 * 1024, fileName: 'test-1MB.bin' },
    // { description: '100 MB', sizeBytes: 100 * 1024 * 1024, fileName: 'test-100MB.bin' },
    // { description: '1 GB', sizeBytes: 1 * 1024 * 1024 * 1024, fileName: 'test-1GB.bin' }, // Uncomment carefully - very slow!
];

interface TestCaseData extends TestCase {
    filePath: string;
    timeoutMultiplier: number; // To adjust timeouts per file size
}

const preparedTestCases: TestCaseData[] = [];

// Helper to create files efficiently, especially large ones
async function createTestFile(filePath: string, sizeBytes: number): Promise<void> {
    if (sizeBytes === 0) {
        await fs.writeFile(filePath, '');
        return;
    }

    // For non-zero files, use streams for potentially large files
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        let writtenBytes = 0;
        const chunkSize = 64 * 1024; // 64KB chunks
        const buffer = Buffer.alloc(chunkSize);

        // Fill buffer with some pattern (optional, could use random data)
        for (let i = 0; i < chunkSize; i++) {
            buffer[i] = i % 256;
        }

        function write() {
            let ok = true;
            do {
                const bytesToWrite = Math.min(chunkSize, sizeBytes - writtenBytes);
                if (bytesToWrite <= 0) {
                    break; // Should not happen if loop condition is correct, but safety first
                }
                const chunk = bytesToWrite === chunkSize ? buffer : buffer.slice(0, bytesToWrite);
                writtenBytes += bytesToWrite;
                if (writtenBytes === sizeBytes) {
                    stream.write(chunk, (err) => {
                        if (err) reject(err);
                        else stream.end(resolve); // End stream after last write
                    });
                    ok = false; // Last write, stop loop
                } else {
                    // If write returns false, wait for 'drain' before continuing
                    ok = stream.write(chunk);
                }
            } while (writtenBytes < sizeBytes && ok);

            if (writtenBytes < sizeBytes) {
                // If the loop stopped because ok = false, wait for drain
                stream.once('drain', write);
            }
        }

        stream.on('error', reject);
        write(); // Start the writing process
    });
}


// Helper to calculate SHA256 from file path using streams
async function calculateFileSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}


// --- Jest Test Suite ---
describe('WebRTC File Transfer E2E Test (Multiple Sizes)', () => {
    // Set a very long timeout for the entire suite, especially if testing 1GB
    // 10 minutes = 600,000 ms. Adjust as needed.
    jest.setTimeout(JEST_TIMEOUT * 20); // Increased significantly

    let pageA: Page;
    let pageB: Page;

    // Create test files and calculate hashes
    console.log('Preparing test files...');
    for (const testCase of testCases) {
        const filePath = path.join(TEST_FILES_DIR, testCase.fileName);
        // Determine timeout multiplier (more time for larger files)
        let timeoutMultiplier = 1;
        if (testCase.sizeBytes > 10 * 1024 * 1024) timeoutMultiplier = 10; // 10x for >10MB
        if (testCase.sizeBytes > 500 * 1024 * 1024) timeoutMultiplier = 20; // 20x for >500MB

        preparedTestCases.push({
            ...testCase,
            filePath,
            timeoutMultiplier,
        });
        console.log('Test files prepared.');
    }
    beforeAll(async () => {
        // Retrieve pages - Assuming connection is established by envSetup
        // If envSetup was refactored out, connection logic needs to be here or in beforeEach
        pageA = globalThis.__PAGE_A__!;
        pageB = globalThis.__PAGE_B__!; // This relies on the old setup or needs adjustment

        // Check if pages exist (basic sanity check)
        if (!pageA || !pageB) {
            throw new Error("Page A or Page B not found in global scope. Ensure E2E environment setup ran correctly and established connection.");
        }
        console.log("Page A and Page B retrieved.");
        // Optional: Quick connection check if needed
        // await checkConnectionEstablished(pageA, 'Page A (beforeAll)');
        // await checkConnectionEstablished(pageB, 'Page B (beforeAll)');

        // Create test directory
        fs.ensureDirSync(TEST_FILES_DIR);
        console.log(`Ensured test file directory exists: ${TEST_FILES_DIR}`);
    });

    afterAll(async () => {
        // Delete the test files directory
        if (fs.existsSync(TEST_FILES_DIR)) {
            console.log(`Deleting test files directory: ${TEST_FILES_DIR}`);
            try {
                await fs.rm(TEST_FILES_DIR, { recursive: true, force: true });
                console.log('Test files directory deleted.');
            } catch (error) {
                console.error(`Error deleting test files directory: ${error}`);
            }
        }
        // Note: Pages are closed by envTeardown
    });
    // Use test.each to run the transfer logic for each prepared test case
    test.each(preparedTestCases)(
        'should successfully transfer: $description ($fileName)',
        async ({ fileName, filePath, timeoutMultiplier, sizeBytes, description }) => {
            // sleep for 10 seconds and log to see if the test is running in parallel
            // await new Promise((resolve) => setTimeout(resolve, 10000));
            console.log("MIEMIEMIE", fileName, filePath, timeoutMultiplier, sizeBytes, description);
            await createTestFile(filePath, sizeBytes);
            console.log(`Calculating SHA256 for: ${filePath}...`);
            const expectedSha256 = await calculateFileSHA256(filePath);

            console.log(`\n--- Starting file transfer test for: ${fileName} (${description}) ---`);

            // Calculate dynamic timeouts based on multiplier
            const dynamicPuppeteerTimeout = PUPPETEER_TIMEOUT * timeoutMultiplier;
            const transferWaitTimeout = PUPPETEER_TIMEOUT * timeoutMultiplier * 2; // Even longer for actual transfer steps

            // only for first element
            if (fileName === preparedTestCases[0].fileName) {
                console.log('Ensuring file transfer UI is ready...');
                await pageB.waitForSelector('::-p-text(<)', { visible: true, timeout: dynamicPuppeteerTimeout });
                await pageB.click('::-p-text(<)');
                await pageA.waitForSelector('::-p-text(<)', { visible: true, timeout: dynamicPuppeteerTimeout });
                await pageA.click('::-p-text(<)');
                console.log('File transfer UI prepared.');
            }

            // 1. Find the file input element on Page A (Sender)
            console.log('Waiting for file input element on Page A...');
            const fileInputElement = await pageA.waitForSelector(FILE_INPUT_SELECTOR, { visible: false, timeout: dynamicPuppeteerTimeout }); // Input might be hidden
            expect(fileInputElement).not.toBeNull();
            console.log('File input element found.');

            // 2. Upload the specific test file
            console.log(`Uploading test file: ${filePath}`);
            await (fileInputElement as ElementHandle<HTMLInputElement>).uploadFile(filePath);
            console.log('File selected for upload.');

            // --- Sender Verification ---
            const senderFilenameSelector = `::-p-text(${fileName})`;
            console.log(`Waiting for filename "${fileName}" to appear on Page A (Sender)...`);
            await pageA.waitForSelector(senderFilenameSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
            console.log('Filename found on Sender.');

            // Wait for Sender's completion indicator ("Completed")
            const senderCompleteSelector = `::-p-text(Completed)`; // Adjust if needed
            console.log(`Waiting for sender completion indicator "Completed" on Page A...`);
            await pageA.waitForSelector(senderCompleteSelector, { visible: true, timeout: transferWaitTimeout }); // Longer timeout
            console.log('Sender completion indicator found.');

            // --- Receiver Verification ---
            const receiverFilenameSelector = `::-p-text(${fileName})`;
            console.log(`Waiting for filename "${fileName}" to appear on Page B (Receiver)...`);
            await pageB.waitForSelector(receiverFilenameSelector, { visible: true, timeout: transferWaitTimeout }); // Longer timeout
            console.log('Filename found on Receiver.');

            // Wait for Receiver's download indicator ("Download") with download attribute equals to file name
            const receiverDownloadSelector = `::-p-text(Download)[download="${fileName}"]`;
            console.log(`Waiting for receiver download indicator "Download" on Page B...`);
            await pageB.waitForSelector(receiverDownloadSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
            console.log('Receiver download indicator found.');

            // Get the blob URL, fetch content, convert to base64
            console.log('Finding download link and fetching received file content from Page B...');
            const receivedContentBase64 = await pageB.evaluate(async (filenameToFind) => {
                // Helper function (remains the same)
                function arrayBufferToBase64(buffer: ArrayBuffer): string {
                    // build a string array of the same length
                    const bytes = new Uint8Array(buffer);
                    let binary = Array.from({ length: buffer.byteLength }, (_, i) => String.fromCharCode(bytes[i]));
                    const len = bytes.byteLength;
                    return window.btoa(binary.join(""));
                }

                // Find the element containing the filename text (using XPath as before)
                const filenameXpath = `//*[normalize-space()='${filenameToFind}']`;
                let filenameElement = document.evaluate(filenameXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;

                if (!filenameElement) {
                    console.warn(`Exact match for "${filenameToFind}" not found, trying contains...`);
                    const filenameContainsXpath = `//*[contains(text(),'${filenameToFind}')]`;
                    filenameElement = document.evaluate(filenameContainsXpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement | null;
                    if (!filenameElement) {
                        throw new Error(`Element containing filename "${filenameToFind}" not found.`);
                    }
                    console.warn(`Found filename "${filenameToFind}" using 'contains'.`);
                }

                // Find the container and download link (logic remains similar)
                // Adjust closest selector if needed (e.g., 'li', '.file-entry')
                const container = filenameElement.closest('div'); // Assuming div is the container
                if (!container) {
                    throw new Error(`Could not find a container element near filename "${filenameToFind}".`);
                }

                const links = Array.from(container.querySelectorAll('a'));
                const downloadLink = links.find(a => a.textContent?.trim() === 'Download' && a.href.startsWith('blob:'));

                if (!downloadLink) {
                    console.error(`Could not find "Download" link in container for "${filenameToFind}". Container HTML:`, container.innerHTML);
                    throw new Error(`"Download" link associated with "${filenameToFind}" not found or invalid href.`);
                }
                const blobUrl = downloadLink.href;
                console.log(`Fetching blob URL: ${blobUrl}`);
                const response = await fetch(blobUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch blob: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                console.log('Fetched content.', arrayBuffer.byteLength, 'bytes');
                return arrayBufferToBase64(arrayBuffer);
            }, fileName); // Pass the correct filename

            expect(receivedContentBase64).toBeDefined();
            console.log('Received content fetched (as base64).');

            // Decode Base64, calculate SHA, and compare
            const receivedContentBuffer = Buffer.from(receivedContentBase64, 'base64');
            // Use the imported helper for consistency, though direct buffer hashing is fine too
            const receivedSha256 = calculateSHA256(receivedContentBuffer);
            console.log(`Received SHA256:  ${receivedSha256}`);
            console.log(`Expected SHA256:  ${expectedSha256}`);
            if (receivedSha256 !== expectedSha256) {
                // log the content of both buffers
                console.log('Received Content:', receivedContentBuffer);
                const expectedContent = await fs.promises.readFile(filePath);
                console.log('Expected Content:',filePath, expectedContent);
            }
            expect(receivedSha256).toEqual(expectedSha256);
            console.log('SHA256 hashes match.');
            console.log(`--- TEST SUCCESS: ${fileName} transfer verified! ---`);
        }); // End of test.each
}); // End of describe
