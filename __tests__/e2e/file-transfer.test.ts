import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
// Puppeteer is now globally available via the environment, but we need types
import type { Browser, Page } from 'puppeteer';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

// --- Type Assertion for Global Browser ---
// This tells TypeScript that we expect __BROWSER__ to be on the global scope
declare global {
  var __BROWSER__: Browser;
}

// --- Configuration ---
// IMPORTANT: Replace these selectors with actual values from your application!
const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)'; // <-- Replace with selector for the invite URL element (e.g., input, span)
const INVITE_URL_COPIED_SELECTOR = 'button ::-p-text(Copied successfully)'; // <-- Replace with selector for the invite URL element (e.g., input, span)
const CALL_BUTTON_SELECTOR = 'button#test-join'; // <-- Replace with selector for the green call button
// TODO: make more robusts
const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.bg-green-500'; // <-- Replace with selector for element indicating connection success (must work in both pages)

// --- File Transfer Specific Selectors ---
// IMPORTANT: Replace these with actual selectors from your application!
const FILE_INPUT_SELECTOR = 'input[type="file"]#file-input'; // Selector for the hidden file input element
const FILE_PROGRESS_SELECTOR_SENDER = (fileId: string) => `progress#file-${fileId}`; // Selector for sender progress bar (adjust if needed)
const FILE_COMPLETE_INDICATOR_RECEIVER = (fileId: string) => `#f-${fileId} > span:last-child`; // Selector for receiver completion text/link (adjust if needed)

// --- Test File Configuration ---
const TEST_FILE_NAME = 'test-upload.txt';
const TEST_FILE_PATH = path.join(__dirname, TEST_FILE_NAME); // Place it near the test file
const TEST_FILE_CONTENT = 'This is a test file for E2E transfer.';

const PUPPETEER_TIMEOUT = 30000; // 30 seconds timeout for Puppeteer waits
const SERVER_STARTUP_TIMEOUT = 45000; // Max time to wait for server to start and print URL
const JEST_TIMEOUT = SERVER_STARTUP_TIMEOUT + PUPPETEER_TIMEOUT + 10000; // Jest timeout needs to be longer than server startup + test execution

// --- Helper Function ---
async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
    console.log(`Waiting for connection indicator in ${description}...`);
    // Option 1: Wait for a specific element to appear or contain specific text
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT });
    console.log(`Connection indicator found in ${description}.`);
}


// --- Jest Test Suite ---
describe('WebRTC File Transfer E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT); // Increase Jest timeout for server startup + test

    let serverProcess: ChildProcessWithoutNullStreams | null = null;
    let serverUrl: string | undefined = undefined;
    // browserA and browserB are no longer needed here, we use pages from global.__BROWSER__
    let pageA: Page | null = null;
    let pageB: Page | null = null;

    beforeAll(async () => {
        // Server startup remains the same
        console.log('Starting development server...');
        // Use a Promise to wait for the server URL
        await new Promise<void>((resolve, reject) => {
            // Ensure CWD is project root if needed, adjust path if test runner changes it
            // const projectRoot = path.resolve(__dirname, '../../'); // Example if needed
            serverProcess = spawn('npm', ['run', 'dev'], {
                // cwd: projectRoot, // Uncomment if needed
                shell: true, // Use shell to properly handle npm scripts on different OS
                detached: false // Keep false unless specific cleanup issues arise
            });

            let output = '';
            const urlRegex = /(?:Local|Network):\s+(http:\/\/\S+|https:\/\/\S+)/; // Capture http or https

            const timer = setTimeout(() => {
                console.error('Server startup timed out.');
                killServer(); // Attempt cleanup
                reject(new Error(`Server startup timed out after ${SERVER_STARTUP_TIMEOUT}ms`));
            }, SERVER_STARTUP_TIMEOUT);

            serverProcess.stdout.on('data', (data) => {
                const dataStr = data.toString();
                console.log(`Server stdout: ${dataStr.trim()}`); // Log server output for debugging
                output += dataStr;
                const match = output.match(urlRegex);
                if (match && match[1]) {
                    // Prefer localhost URL if available, otherwise take the first one found
                    const urls = output.match(new RegExp(urlRegex, 'g')); // Find all matches
                    const localUrl = urls?.find(u => u.includes('localhost') || u.includes('127.0.0.1'));
                    serverUrl = localUrl ? localUrl.match(urlRegex)?.[1] : match[1]; // Extract URL part

                    console.log(`Development server started at: ${serverUrl}`);
                    clearTimeout(timer); // Clear the timeout
                    resolve(); // Signal that the server is ready
                }
            });

            serverProcess.stderr.on('data', (data) => {
                console.error(`Server stderr: ${data.toString().trim()}`);
                // Consider rejecting if specific critical errors appear in stderr
            });

            serverProcess.on('error', (err) => {
                console.error('Failed to start server process:', err);
                clearTimeout(timer);
                reject(err);
            });

            serverProcess.on('exit', (code, signal) => {
                // If the server exits before we found the URL, it's an error
                if (!serverUrl) {
                    console.error(`Server process exited prematurely with code ${code}, signal ${signal}`);
                    clearTimeout(timer);
                    reject(new Error(`Server process exited prematurely (code ${code}, signal ${signal}) before URL was found.`));
                }
                // Otherwise, it might be exiting during cleanup, which is fine
            });
        });

        if (!serverUrl) {
            throw new Error("Server started but URL could not be determined.");
        }

        // Create a dummy file for testing
        console.log(`Creating test file at: ${TEST_FILE_PATH}`);
        fs.writeFileSync(TEST_FILE_PATH, TEST_FILE_CONTENT);
    });

    // Function to kill the server process, attempting graceful termination first
    const killServer = () => {
        if (serverProcess && !serverProcess.killed) {
            console.log(`Attempting to kill server process (PID: ${serverProcess.pid})...`);
            // Sending SIGTERM first for graceful shutdown
            const killed = serverProcess.kill('SIGTERM');
            if (!killed) {
                 console.warn(`Failed to send SIGTERM to server process ${serverProcess.pid}. It might already be dead.`);
                 // Consider SIGKILL as a fallback if needed, but SIGTERM is preferred
                 // serverProcess.kill('SIGKILL');
            } else {
                 console.log(`Sent SIGTERM to server process ${serverProcess.pid}.`);
            }
            serverProcess = null; // Prevent multiple kill attempts
        }
    };


    afterAll(async () => {
        console.log('Cleaning up test suite...');
        // Close pages if they were opened
        console.log('Closing pages...');
        if (pageA && !pageA.isClosed()) await pageA.close();
        if (pageB && !pageB.isClosed()) await pageB.close();
        console.log('Pages closed.');

        // Delete the dummy test file
        if (fs.existsSync(TEST_FILE_PATH)) {
            console.log(`Deleting test file: ${TEST_FILE_PATH}`);
            fs.unlinkSync(TEST_FILE_PATH);
        }

        // Kill the server process started by this suite
        killServer();
        console.log('Test suite cleanup finished.');
        // Note: Browser is closed by globalTeardown, not here.
    });

    test('should successfully transfer a file between two peers', async () => {
        if (!serverUrl) {
            throw new Error("Server URL not available for test.");
        }
        // Access the browser instance provided by the environment
        const browser = global.__BROWSER__;
        if (!browser) {
            throw new Error("Puppeteer browser instance not found in global scope.");
        }
        console.log(`Starting WebRTC connection test using URL: ${serverUrl}`);

        try {
            // 1. Open Page A in the shared browser
            console.log('Opening Page A...');
            pageA = await browser.newPage();
            console.log(`Page A navigating to: ${serverUrl}`);

            await pageA.goto(serverUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
            console.log('Page A navigation complete.');

            // Give clipboard a moment to update (might be needed in some environments)
            // await pageA.waitForTimeout(100); // Optional: uncomment if facing timing issues

            console.log('Reading invite URL from clipboard...');
            // Grant clipboard read permission before trying to read.
            // Ensure serverUrl is not null before using it.
            if (!serverUrl) {
                throw new Error("Server URL is null, cannot grant clipboard permissions.");
            }
            // 2. Wait for and extract the invite URL from Browser A
            console.log('Waiting for invite URL element...');
            await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Invite URL element found. Clicking it to copy URL...');

            const inviteUrl = await pageA.evaluate(async () => {
                return window.location.toString();
            });

            // // TODO: test clipboard
            // const context = pageA.browserContext();
            // // Grant permissions to the origin of the server URL
            // const origin = new URL(serverUrl).origin;
            // await context.overridePermissions(origin, ['clipboard-read', 'clipboard-write']);
            // await pageA.click(INVITE_URL_SELECTOR);
            // console.log('Waiting for invite URL to be copied...');
            // await pageA.waitForSelector(INVITE_URL_COPIED_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            // const inviteUrl = await pageA.evaluate(async () => {
            //     try {
            //         return await navigator.clipboard.readText();
            //     } catch (err) {
            //         console.error('Failed to read clipboard:', err);
            //         return null; // Return null or throw an error as appropriate
            //     }
            // });
            // if (!inviteUrl) {
            //     throw new Error('Could not read invite URL from clipboard.');
            // }

            // Basic validation: Check if it looks like a URL
            if (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://')) {
                 throw new Error(`Clipboard content "${inviteUrl}" does not look like a valid URL.`);
            }
            console.log(`Invite URL from clipboard: ${inviteUrl}`);

            // 3. Open Page B in the shared browser
            console.log('Opening Page B...');
            pageB = await browser.newPage();

            // 4. Navigate Page B to the invite URL
            console.log('Page B navigating to invite URL...');
            await pageB.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
            console.log('Page B navigation complete.');

            // 5. Find and click the call button in Page B
            console.log('Waiting for call button in Page B...');
            await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Call button found. Clicking...');
            await pageB.click(CALL_BUTTON_SELECTOR);
            console.log('Call button clicked.');

            // 6. Wait for connection to be established in both pages
            console.log('Waiting for connection establishment in both pages...');
            // Ensure pages are not null before passing them
            if (!pageA || !pageB) {
                throw new Error("pageA or pageB is null before checking connection.");
            }
            await Promise.all([
                checkConnectionEstablished(pageA, 'Page A'),
                checkConnectionEstablished(pageB, 'Page B')
            ]);

            console.log('--- Connection established. Proceeding with file transfer test ---');

            // --- File Transfer Steps ---

            // 1. Find the file input element on Page A (Sender)
            console.log('Waiting for file input element on Page A...');
            const fileInputElement = await pageA.waitForSelector(FILE_INPUT_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT }); // File inputs might be hidden
            if (!fileInputElement) {
                throw new Error(`File input element (${FILE_INPUT_SELECTOR}) not found on Page A.`);
            }
            console.log('File input element found.');

            // 2. Upload the test file using the input element
            console.log(`Uploading test file: ${TEST_FILE_PATH}`);
            await fileInputElement.uploadFile(TEST_FILE_PATH);
            console.log('File selected for upload.');

            // 3. Wait for transfer indicators (this part is highly application-specific)
            // We need a way to know the file transfer has started and get its ID
            // This often involves observing the DOM for the progress element to appear.
            // Let's assume the progress element's ID includes a unique part generated by the app.
            // We'll wait for *any* progress bar matching a pattern, then extract the ID.
            // **IMPORTANT**: This selector needs refinement based on the actual app implementation.
            console.log('Waiting for sender progress bar to appear...');
            const senderProgressSelectorPattern = 'progress[id^="file-"]'; // Example: find progress bar starting with "file-"
            const senderProgressElement = await pageA.waitForSelector(senderProgressSelectorPattern, { visible: true, timeout: PUPPETEER_TIMEOUT });
            const senderFileId = await senderProgressElement?.evaluate(el => el.id.replace('file-', ''));
            if (!senderFileId) {
                 throw new Error("Could not determine file ID from sender's progress bar.");
            }
            console.log(`Detected file transfer with ID: ${senderFileId}`);

            // 4. Wait for Sender's progress to complete (reaches 100%)
            const senderProgressSelector = FILE_PROGRESS_SELECTOR_SENDER(senderFileId);
            console.log(`Waiting for sender progress bar (${senderProgressSelector}) to reach 100%...`);
            await pageA.waitForFunction(
                (selector) => {
                    const progress = document.querySelector(selector) as HTMLProgressElement | null;
                    return progress?.value === 100;
                },
                { timeout: PUPPETEER_TIMEOUT * 2 }, // Allow more time for transfer
                senderProgressSelector
            );
            console.log('Sender progress reached 100%.');

            // 5. Wait for Receiver's completion indicator (e.g., download link/text appears)
            const receiverCompleteSelector = FILE_COMPLETE_INDICATOR_RECEIVER(senderFileId);
            console.log(`Waiting for receiver completion indicator (${receiverCompleteSelector}) on Page B...`);
            await pageB.waitForSelector(receiverCompleteSelector, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 }); // Allow more time for transfer
            console.log('Receiver completion indicator found.');

            // Optional: Verify receiver indicator text if applicable
            // const completionText = await pageB.$eval(receiverCompleteSelector, el => el.textContent);
            // expect(completionText).toContain('Download'); // Or similar check

            console.log('--- TEST SUCCESS: File transfer appears complete on both ends! ---');


            // if DEBUG_WAIT env var is set, wait until pageA is closed
            if (process.env.DEBUG_WAIT) {
                console.log('DEBUG_WAIT is set, keeping browser open until pageB is closed...');
                try {
                    await pageB.waitForFunction(() => false, { timeout: 0 });
                } catch {}
            }

        } catch (error) {
            console.error('--- TEST FAILED ---');
            // Consider taking screenshots on failure
            // if (pageA) await pageA.screenshot({ path: 'error_pageA.png' });
            // if (pageB) await pageB.screenshot({ path: 'error_pageB.png' });

            // Re-throw the error to make Jest fail the test
            throw error;
        }
        // Note: Page cleanup is handled in afterAll for this suite.
        // Browser cleanup is handled by globalTeardown.
    });
});
