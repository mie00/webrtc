import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import path, { dirname } from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
    FILE_INPUT_SELECTOR,
    PW_TIMEOUT,
    CHAT_INPUT_SELECTOR, // Assuming chat input is used to trigger send
    calculateSHA256,
} from '../setup/pwTestHelpers';
import { ensurePanelOpen } from './pwPanelUtils';

// --- Test Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Path relative to this file (e2e/shared/pwFileTransferTestHelpers.ts)
// So, '../test-transfer-files' would be 'e2e/test-transfer-files'
export const TEST_FILES_DIR = path.join(__dirname, '..', 'test-transfer-files');

export interface TestCase {
    description: string;
    sizeBytes: number;
    fileName: string;
}

export interface TestCaseData extends TestCase {
    filePath: string;
    timeoutMultiplier: number;
    expectedSha256?: string;
}

export const testCases: TestCase[] = [
    { description: '0 Bytes', sizeBytes: 0, fileName: 'test-0B.bin' },
    { description: '1 Bytes', sizeBytes: 1, fileName: 'test-1B-1.bin' },
    { description: '1 Bytes again', sizeBytes: 1, fileName: 'test-1B-2.bin' },
    { description: '100 Bytes', sizeBytes: 100, fileName: 'test-100B.bin' },
    { description: '1 MB', sizeBytes: 1 * 1024 * 1024, fileName: 'test-1MB.bin' },
    // commented out becuase it's slow
    // { description: '100 MB', sizeBytes: 100 * 1024 * 1024, fileName: 'test-100MB.bin' },
    // TODO: fix for threeFromGuest
    // { description: '1 GB', sizeBytes: 1024 * 1024 * 1024, fileName: 'test-1GB.bin' },
];

export const preparedTestCases: TestCaseData[] = [];

for (const testCase of testCases) {
    const filePath = path.join(TEST_FILES_DIR, testCase.fileName);
    let timeoutMultiplier = 1;
    if (testCase.sizeBytes > 5 * 1024 * 1024) timeoutMultiplier = 4;
    if (testCase.sizeBytes > 50 * 1024 * 1024) timeoutMultiplier = 8;

    preparedTestCases.push({
        ...testCase,
        filePath,
        timeoutMultiplier,
    });
}

export async function createTestFile(filePath: string, sizeBytes: number): Promise<void> {
    if (sizeBytes === 0) {
        await fs.writeFile(filePath, '');
        return;
    }
    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        let writtenBytes = 0;
        const chunkSize = 64 * 1024;
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
    console.log('Preparing test files for Playwright tests...');
    await fs.ensureDir(TEST_FILES_DIR);
    console.log(`Ensured test file directory exists: ${TEST_FILES_DIR}`);

    for (const i in preparedTestCases) {
        await createTestFile(preparedTestCases[i].filePath, preparedTestCases[i].sizeBytes);
        const expectedSha256 = await calculateFileSHA256(preparedTestCases[i].filePath);
        preparedTestCases[i].expectedSha256 = expectedSha256;
        console.log(`Prepared: ${preparedTestCases[i].fileName}, SHA256: ${expectedSha256}`);
    }
    console.log('All test files prepared and hashes calculated for Playwright tests.');
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
): Promise<void> {
    const { fileName, filePath, timeoutMultiplier, expectedSha256, description } = testCaseData;

    console.log(`\n--- Starting file transfer (Playwright): ${fileName} (${description}) from ${senderName} to ${receiverNames.join(', ')} ---`);

    const actionTimeout = PW_TIMEOUT * timeoutMultiplier;
    const transferCompletionTimeout = Math.max(PW_TIMEOUT * timeoutMultiplier * 3, 20000 * timeoutMultiplier);

    await ensurePanelOpen(senderPage, senderName);

    console.log(`Locating file input element on ${senderName}...`);
    const fileInput = senderPage.locator(FILE_INPUT_SELECTOR);
    // File input might not be visible, but Playwright can still interact if it's in the DOM.
    // await fileInput.waitFor({ state: 'attached', timeout: actionTimeout });
    console.log('File input element located.');

    console.log(`Uploading test file: ${filePath} on ${senderName}`);
    await fileInput.setInputFiles(filePath);
    console.log('File selected for staging.');

    console.log(`Locating chat input element on ${senderName}...`);
    const chatInput = senderPage.locator(CHAT_INPUT_SELECTOR);
    await chatInput.waitFor({ state: 'visible', timeout: actionTimeout });
    console.log('Chat input element found. Pressing Enter to send file(s)...');
    await senderPage.keyboard.press('Enter'); // Use page.keyboard for global key presses
    console.log('Enter pressed on chat input.');

    const fileContainerSelector = `div[data-filename="${fileName}"]`;

    console.log(`Verifying sender UI for ${fileName} on ${senderName}...`);
    const senderFileContainer = senderPage.locator(fileContainerSelector);
    await expect(senderFileContainer).toBeVisible({ timeout: actionTimeout });
    console.log(`File container found on ${senderName}.`);

    const senderStatusSelector = `${fileContainerSelector} [data-testid="status"]`;
    console.log(`Waiting for "Completed" status on ${senderName}...`);
    try {
        await expect(senderPage.locator(senderStatusSelector)).toHaveText(/Completed/, { timeout: transferCompletionTimeout });
        console.log(`"Completed" status found on ${senderName}.`);

        const senderDownloadLink = senderFileContainer.locator(`[data-testid="download-link"]`);
        await expect(senderDownloadLink).toBeVisible({ timeout: actionTimeout });
        console.log(`Download link found on ${senderName}.`);

        const senderViewLink = senderFileContainer.locator(`[data-testid="view-link"]`);
        await expect(senderViewLink).toBeVisible({ timeout: actionTimeout });
        console.log(`View link found on ${senderName}.`);
        console.log(`--- Sender UI for ${fileName} verified on ${senderName} ---`);
    } catch (e) {
        const currentStatus = await senderPage.locator(senderStatusSelector).textContent({ timeout: 2000 }).catch(() => "Status not found or timed out");
        console.error(`Failed to find "Completed" status or links for sender ${senderName}. Current status: "${currentStatus}". Error:`, e);
        throw new Error(`Sender UI verification failed for ${senderName}: Status did not become 'Completed' or links not found. Current status: ${currentStatus}`);
    }

    for (let i = 0; i < receiverPages.length; i++) {
        const receiverPage = receiverPages[i];
        const receiverName = receiverNames[i];

        console.log(`Verifying on ${receiverName}: Waiting for file container [data-filename="${fileName}"]...`);
        await ensurePanelOpen(receiverPage, receiverName);
        const receiverFileContainer = receiverPage.locator(fileContainerSelector);
        await expect(receiverFileContainer).toBeVisible({ timeout: transferCompletionTimeout });
        console.log(`File container found on ${receiverName}.`);

        const receiverDownloadLinkLocator = receiverFileContainer.locator(`[data-testid="download-link"]`);
        console.log(`Waiting for download link on ${receiverName}...`);
        await expect(receiverDownloadLinkLocator).toBeVisible({ timeout: transferCompletionTimeout });
        console.log(`Download link found on ${receiverName}.`);

        console.log(`Fetching received file content from ${receiverName}...`);
        
        // Start waiting for the download event BEFORE clicking the link
        const downloadPromise = receiverPage.waitForEvent('download', {timeout: transferCompletionTimeout});
        await receiverDownloadLinkLocator.click();
        const download = await downloadPromise;

        // Wait for the download to complete and get the path to the temporary file
        const tempFilePath = await download.path();
        if (!tempFilePath) {
            throw new Error(`Download failed for ${fileName} on ${receiverName}, no path available.`);
        }
        console.log(`File downloaded to temporary path: ${tempFilePath}`);

        const receivedContentBuffer = await fs.readFile(tempFilePath);
        const receivedSha256 = calculateSHA256(receivedContentBuffer);

        console.log(`${receiverName} Received SHA256: ${receivedSha256}`);
        console.log(`${receiverName} Expected SHA256: ${expectedSha256}`);

        expect(receivedSha256).toEqual(expectedSha256);
        console.log(`SHA256 hash matches for ${fileName} on ${receiverName}.`);

        // Clean up the temporary downloaded file
        await fs.unlink(tempFilePath).catch(err => console.warn(`Could not delete temp file ${tempFilePath}: ${err}`));
    }
    console.log(`--- SUCCESS (Playwright): ${fileName} transfer from ${senderName} verified on ${receiverNames.join(', ')} ---`);
}
