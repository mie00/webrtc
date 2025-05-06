import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import type { ElementHandle, Page } from 'puppeteer';
import path, { dirname } from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR, // Use #test-file-upload
    PUPPETEER_TIMEOUT,
    JEST_TIMEOUT,
    calculateSHA256,
    CONTROL_PANEL_TOGGLE_SELECTOR // Use #test-toggle-panel-button
} from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup'; // Import standardSetup
import { standardTeardown } from './setup/standardTeardown'; // Import standardTeardown

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
    { description: '1 Bytes', sizeBytes: 1, fileName: 'test-1B-1.bin' },
    { description: '1 Bytes again', sizeBytes: 1, fileName: 'test-1B-2.bin' },
    { description: '100 Bytes', sizeBytes: 100, fileName: 'test-100B.bin' },
    { description: '1 MB', sizeBytes: 1 * 1024 * 1024, fileName: 'test-1MB.bin' },
    // TODO: fix
    // { description: '100 MB', sizeBytes: 100 * 1024 * 1024, fileName: 'test-100MB.bin' },
    // { description: '512 MB', sizeBytes: 512 * 1024 * 1024, fileName: 'test-512MB.bin' }, // Uncomment carefully - very slow!
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
        if (testCase.sizeBytes > 10 * 1024 * 1024) timeoutMultiplier = 8;
        if (testCase.sizeBytes > 500 * 1024 * 1024) timeoutMultiplier = 16;

        preparedTestCases.push({
            ...testCase,
            filePath,
            timeoutMultiplier,
        });
        console.log('Test files prepared.');
    }

    beforeAll(async () => {
        // Run the standard setup
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;

        // Create test directory
        fs.ensureDirSync(TEST_FILES_DIR);
        console.log(`Ensured test file directory exists: ${TEST_FILES_DIR}`);
    });

    afterAll(async () => {
        // Run the standard teardown first
        await standardTeardown({ pageA, pageB });

        // Then cleanup generated files
        if (fs.existsSync(TEST_FILES_DIR)) {
            console.log(`Deleting test files directory: ${TEST_FILES_DIR}`);
            try {
                await fs.rm(TEST_FILES_DIR, { recursive: true, force: true });
                console.log('Test files directory deleted.');
            } catch (error) {
                console.error(`Error deleting test files directory: ${error}`);
            }
        }
    });

    // Use test.each to run the transfer logic for each prepared test case
    test.each(preparedTestCases)(
        'should successfully transfer: $description ($fileName)',
        async ({ fileName, filePath, timeoutMultiplier, sizeBytes, description }) => {
            // sleep for 10 seconds and log to see if the test is running in parallel
            // await new Promise((resolve) => setTimeout(resolve, 10000));
            await createTestFile(filePath, sizeBytes);
            console.log(`Calculating SHA256 for: ${filePath}...`);
            const expectedSha256 = await calculateFileSHA256(filePath);

            console.log(`\n--- Starting file transfer test for: ${fileName} (${description}) ---`);

            // Calculate dynamic timeouts based on multiplier
            const dynamicPuppeteerTimeout = PUPPETEER_TIMEOUT * timeoutMultiplier;
            const transferWaitTimeout = PUPPETEER_TIMEOUT * timeoutMultiplier * 2; // Even longer for actual transfer steps

            // Ensure control panels are open on both pages for the first test case
            if (fileName === preparedTestCases[0].fileName) {
                console.log('Ensuring control panels are open...');
                await Promise.all([
                    pageA.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: dynamicPuppeteerTimeout }).then(btn => btn?.click()),
                    pageB.waitForSelector(CONTROL_PANEL_TOGGLE_SELECTOR, { visible: true, timeout: dynamicPuppeteerTimeout }).then(btn => btn?.click())
                ]);
                // Add a short wait for panels to animate open if needed
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('Control panels opened.');
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

            // --- Verification using data attributes ---
            const fileContainerSelector = `div[data-filename="${fileName}"]`;

            // --- Sender Verification ---
            console.log(`Waiting for file container [data-filename="${fileName}"] on Page A (Sender)...`);
            await pageA.waitForSelector(fileContainerSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
            console.log('File container found on Sender.');

            // Wait for Sender's completion indicator (Download link appears)
            const senderDownloadLinkSelector = `${fileContainerSelector} [data-testid="download-link"]`;
            console.log(`Waiting for sender download link indicator on Page A...`);
            await pageA.waitForSelector(senderDownloadLinkSelector, { visible: true, timeout: transferWaitTimeout }); // Longer timeout
            console.log('Sender download link found (implies completion).');

            // --- Receiver Verification ---
            console.log(`Waiting for file container [data-filename="${fileName}"] on Page B (Receiver)...`);
            await pageB.waitForSelector(fileContainerSelector, { visible: true, timeout: transferWaitTimeout }); // Longer timeout
            console.log('File container found on Receiver.');

            // Wait for Receiver's download link
            const receiverDownloadLinkSelector = `${fileContainerSelector} [data-testid="download-link"]`;
            console.log(`Waiting for receiver download link on Page B...`);
            await pageB.waitForSelector(receiverDownloadLinkSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
            console.log('Receiver download link found.');

            // Get the blob URL, fetch content, convert to base64 using new selectors
            console.log('Finding download link and fetching received file content from Page B...');
            const receivedContentBase64 = await pageB.evaluate(async (filenameToFind) => {
                // Helper function (remains the same)
                function arrayBufferToBase64(buffer: ArrayBuffer): string {
                    const bytes = new Uint8Array(buffer);
                    let binary = Array.from({ length: buffer.byteLength }, (_, i) => String.fromCharCode(bytes[i]));
                    return window.btoa(binary.join(""));
                }

                // Find the container using the data-filename attribute
                const containerSelector = `div[data-filename="${filenameToFind}"]`;
                const container = document.querySelector(containerSelector);
                if (!container) {
                    throw new Error(`Container element with selector "${containerSelector}" not found.`);
                }

                // Find the download link within the container using data-testid
                const downloadLinkSelector = `[data-testid="download-link"]`;
                const downloadLink = container.querySelector(downloadLinkSelector) as HTMLAnchorElement | null;

                if (!downloadLink || !downloadLink.href || !downloadLink.href.startsWith('blob:')) {
                    console.error(`Could not find valid "Download" link in container for "${filenameToFind}". Container HTML:`, container.innerHTML);
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
