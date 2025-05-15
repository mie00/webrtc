import type { ElementHandle, Page } from 'puppeteer';
import path, { dirname } from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR,
    PUPPETEER_TIMEOUT,
    calculateSHA256, // For buffer hashing
    // CONTROL_PANEL_TOGGLE_SELECTOR is handled by ensurePanelOpen
} from '../setup/testHelpers';
import { ensurePanelOpen as ensurePanelOpenUtil } from './panelUtils'; // Renaming to avoid conflict if we define a local one

// --- Test Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const TEST_FILES_DIR = path.join(__dirname, '..', 'test-transfer-files'); // Adjusted path to be in __tests__/e2e

export interface TestCase {
    description: string;
    sizeBytes: number;
    fileName: string;
}

export interface TestCaseData extends TestCase {
    filePath: string;
    timeoutMultiplier: number; // To adjust timeouts per file size
    expectedSha256?: string; // To store pre-calculated SHA256
}

// Define test cases - these are the raw definitions
export const testCases: TestCase[] = [
    { description: '0 Bytes', sizeBytes: 0, fileName: 'test-0B.bin' },
    { description: '1 Bytes', sizeBytes: 1, fileName: 'test-1B-1.bin' },
    { description: '1 Bytes again', sizeBytes: 1, fileName: 'test-1B-2.bin' },
    { description: '100 Bytes', sizeBytes: 100, fileName: 'test-100B.bin' },
    { description: '1 MB', sizeBytes: 1 * 1024 * 1024, fileName: 'test-1MB.bin' },
    // Larger files can be added here, ensure JEST_TIMEOUT accommodates them
    // { description: '10 MB', sizeBytes: 10 * 1024 * 1024, fileName: 'test-10MB.bin' },
];

// This will hold the fully prepared test cases with filePaths and SHA256 hashes
export const preparedTestCases: TestCaseData[] = [];

for (const testCase of testCases) {
    const filePath = path.join(TEST_FILES_DIR, testCase.fileName);
    let timeoutMultiplier = 1;
    if (testCase.sizeBytes > 5 * 1024 * 1024) timeoutMultiplier = 4; // 5MB
    if (testCase.sizeBytes > 50 * 1024 * 1024) timeoutMultiplier = 8; // 50MB

    preparedTestCases.push({
        ...testCase,
        filePath,
        timeoutMultiplier,
    });
}

// Helper to create files efficiently
export async function createTestFile(filePath: string, sizeBytes: number): Promise<void> {
    if (sizeBytes === 0) {
        await fs.writeFile(filePath, '');
        return;
    }
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        let writtenBytes = 0;
        const chunkSize = 64 * 1024; // 64KB chunks
        const buffer = Buffer.alloc(chunkSize);
        for (let i = 0; i < chunkSize; i++) {
            buffer[i] = i % 256;
        }
        function write() {
            let ok = true;
            do {
                const bytesToWrite = Math.min(chunkSize, sizeBytes - writtenBytes);
                if (bytesToWrite <= 0) break;
                const chunk = bytesToWrite === chunkSize ? buffer : buffer.slice(0, bytesToWrite);
                writtenBytes += bytesToWrite;
                if (writtenBytes === sizeBytes) {
                    stream.write(chunk, (err) => {
                        if (err) reject(err);
                        else stream.end(resolve);
                    });
                    ok = false;
                } else {
                    ok = stream.write(chunk);
                }
            } while (writtenBytes < sizeBytes && ok);
            if (writtenBytes < sizeBytes) {
                stream.once('drain', write);
            }
        }
        stream.on('error', reject);
        write();
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

export async function setupTestFiles(): Promise<void> {
    console.log('Preparing test files...');
    await fs.ensureDir(TEST_FILES_DIR);
    console.log(`Ensured test file directory exists: ${TEST_FILES_DIR}`);

    for (const i in preparedTestCases) {
        await createTestFile(preparedTestCases[i].filePath, preparedTestCases[i].sizeBytes);
        const expectedSha256 = await calculateFileSHA256(preparedTestCases[i].filePath);

        preparedTestCases[i].expectedSha256 = expectedSha256;
        console.log(`Prepared: ${preparedTestCases[i].fileName}, SHA256: ${expectedSha256}`);
    }
    console.log('All test files prepared and hashes calculated.');
}

export async function teardownTestFiles(): Promise<void> {
    if (fs.existsSync(TEST_FILES_DIR)) {
        console.log(`Deleting test files directory: ${TEST_FILES_DIR}`);
        try {
            await fs.rm(TEST_FILES_DIR, { recursive: true, force: true });
            console.log('Test files directory deleted.');
        } catch (error) {
            console.error(`Error deleting test files directory: ${error}`);
        }
    }
}

export async function performFileTransferTest(
    senderPage: Page,
    senderName: string,
    receiverPages: Page[],
    receiverNames: string[],
    testCaseData: TestCaseData,
    // ensurePanelOpen is imported and renamed to ensurePanelOpenUtil
): Promise<void> {
    const { fileName, filePath, timeoutMultiplier, expectedSha256, description } = testCaseData;

    console.log(`\n--- Starting file transfer: ${fileName} (${description}) from ${senderName} to ${receiverNames.join(', ')} ---`);

    const dynamicPuppeteerTimeout = PUPPETEER_TIMEOUT * timeoutMultiplier;
    // Transfer wait timeout can be longer, e.g., for progress bars or finalization.
    // Let's make it significantly longer for larger files, assuming PUPPETEER_TIMEOUT is a base for UI interaction.
    const transferCompletionTimeout = Math.max(PUPPETEER_TIMEOUT * timeoutMultiplier * 2, 15000 * timeoutMultiplier); // Minimum 15s per multiplier unit

    // 1. Ensure control panel is open on Sender
    await ensurePanelOpenUtil(senderPage, senderName);

    // 2. Find the file input element on Sender Page
    console.log(`Waiting for file input element on ${senderName}...`);
    const fileInputElement = await senderPage.waitForSelector(FILE_INPUT_SELECTOR, { visible: false, timeout: dynamicPuppeteerTimeout }); // Input might be hidden
    if (!fileInputElement) {
        throw new Error(`File input element (${FILE_INPUT_SELECTOR}) not found on ${senderName}`);
    }
    console.log('File input element found.');

    // 3. Upload the test file
    console.log(`Uploading test file: ${filePath} on ${senderName}`);
    await (fileInputElement as ElementHandle<HTMLInputElement>).uploadFile(filePath);
    console.log('File selected for staging.');

    // --- Simulate pressing Enter in chat input to send staged files ---
    const chatInputSelector = '#test-chat-input'; // As defined in ControlPanel.svelte
    console.log(`Waiting for chat input element on ${senderName}...`);
    const chatInputElement = await senderPage.waitForSelector(chatInputSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
    if (!chatInputElement) {
        throw new Error(`Chat input element (${chatInputSelector}) not found on ${senderName}`);
    }
    console.log('Chat input element found. Pressing Enter to send file(s)...');
    await chatInputElement.press('Enter');
    console.log('Enter pressed on chat input.');

    // --- Verification using data attributes ---
    const fileContainerSelector = `div[data-filename="${fileName}"]`;

    // --- Sender UI Verification ---
    console.log(`Verifying sender UI for ${fileName} on ${senderName}...`);
    await senderPage.waitForSelector(fileContainerSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
    console.log(`File container found on ${senderName}.`);

    // Wait for the "Completed" status text to appear for the sender
    // This indicates the transfer process (to all clients) has finished from the sender's perspective
    const senderStatusSelector = `${fileContainerSelector} [data-testid="status"]`;
    console.log(`Waiting for "Completed" status on ${senderName}...`);
    try {
        await senderPage.waitForFunction(
            (selector) => {
                const element = document.querySelector(selector);
                return element?.textContent?.includes('Completed') ?? false;
            },
            { timeout: transferCompletionTimeout }, // Use a longer timeout as this depends on full transfer
            senderStatusSelector
        );
        console.log(`"Completed" status found on ${senderName}.`);

        // Now verify Download and View links for the sender
        const senderDownloadLinkSelector = `${fileContainerSelector} [data-testid="download-link"]`;
        await senderPage.waitForSelector(senderDownloadLinkSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
        console.log(`Download link found on ${senderName}.`);

        const senderViewLinkSelector = `${fileContainerSelector} [data-testid="view-link"]`;
        await senderPage.waitForSelector(senderViewLinkSelector, { visible: true, timeout: dynamicPuppeteerTimeout });
        console.log(`View link found on ${senderName}.`);
        console.log(`--- Sender UI for ${fileName} verified on ${senderName} ---`);

    } catch (e) {
        // If status doesn't become "Completed", it might be "Error" or still "Sending" if timeout is too short.
        // Log current status for debugging.
        const currentStatus = await senderPage.evaluate((selector) => document.querySelector(selector)?.textContent, senderStatusSelector);
        console.error(`Failed to find "Completed" status or links for sender ${senderName}. Current status: "${currentStatus}". Error:`, e);
        // Re-throw to fail the test if critical elements are missing
        throw new Error(`Sender UI verification failed for ${senderName}: Status did not become 'Completed' or links not found. Current status: ${currentStatus}`);
    }


    // --- Receiver Verification ---
    for (let i = 0; i < receiverPages.length; i++) {
        const receiverPage = receiverPages[i];
        const receiverName = receiverNames[i];

        console.log(`Verifying on ${receiverName}: Waiting for file container [data-filename="${fileName}"]...`);
        // Ensure panel is open on receiver before looking for elements
        await ensurePanelOpenUtil(receiverPage, receiverName);
        await receiverPage.waitForSelector(fileContainerSelector, { visible: true, timeout: transferCompletionTimeout });
        console.log(`File container found on ${receiverName}.`);

        const receiverDownloadLinkSelector = `${fileContainerSelector} [data-testid="download-link"]`;
        console.log(`Waiting for download link on ${receiverName}...`);
        await receiverPage.waitForSelector(receiverDownloadLinkSelector, { visible: true, timeout: transferCompletionTimeout });
        console.log(`Download link found on ${receiverName}.`);

        console.log(`Fetching received file content from ${receiverName}...`);
        const receivedContentBase64 = await receiverPage.evaluate(async (fNameToFind) => {
            function arrayBufferToBase64(buffer: ArrayBuffer): string {
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let j = 0; j < bytes.byteLength; j++) {
                    binary += String.fromCharCode(bytes[j]);
                }
                return window.btoa(binary);
            }

            const fContainerSelector = `div[data-filename="${fNameToFind}"]`;
            const container = document.querySelector(fContainerSelector);
            if (!container) {
                throw new Error(`Container element with selector "${fContainerSelector}" not found.`);
            }

            const dLinkSelector = `[data-testid="download-link"]`;
            const downloadLink = container.querySelector(dLinkSelector) as HTMLAnchorElement | null;

            if (!downloadLink || !downloadLink.href || !downloadLink.href.startsWith('blob:')) {
                console.error(`Could not find valid "Download" link in container for "${fNameToFind}". Container HTML:`, container.innerHTML);
                throw new Error(`"Download" link associated with "${fNameToFind}" not found or invalid href.`);
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
        }, fileName);

        if (receivedContentBase64 === undefined || receivedContentBase64 === null) {
             throw new Error(`Failed to get base64 content for ${fileName} from ${receiverName}`);
        }
        console.log(`Received content fetched (as base64) from ${receiverName}.`);

        const receivedContentBuffer = Buffer.from(receivedContentBase64, 'base64');
        const receivedSha256 = calculateSHA256(receivedContentBuffer); // Uses helper from testHelpers.ts

        console.log(`${receiverName} Received SHA256: ${receivedSha256}`);
        console.log(`${receiverName} Expected SHA256: ${expectedSha256}`);

        if (receivedSha256 !== expectedSha256) {
            console.error(`SHA256 mismatch for ${fileName} on ${receiverName}!`);
            // Optionally log buffer contents for small files or save them for debugging
            // fs.writeFileSync(`./debug_${fileName}_received_${receiverName}.bin`, receivedContentBuffer);
            // const expectedContent = await fs.readFile(filePath);
            // fs.writeFileSync(`./debug_${fileName}_expected.bin`, expectedContent);
        }
        expect(receivedSha256).toEqual(expectedSha256);
        console.log(`SHA256 hash matches for ${fileName} on ${receiverName}.`);
    }
    console.log(`--- SUCCESS: ${fileName} transfer from ${senderName} verified on ${receiverNames.join(', ')} ---`);
}
