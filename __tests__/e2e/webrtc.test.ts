import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
// Puppeteer is now globally available via the environment, but we need types
import type { Browser, Page } from 'puppeteer';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';

// --- Type Assertion for Global Browser ---
// This tells TypeScript that we expect __BROWSER__ to be on the global scope
declare global {
  var __BROWSER__: Browser;
}

// --- Configuration ---
// IMPORTANT: Replace these selectors with actual values from your application!
const INVITE_URL_SELECTOR = 'button ::-p-text(Copy)'; // <-- Replace with selector for the invite URL element (e.g., input, span)
const CALL_BUTTON_SELECTOR = '#selector-for-call-button'; // <-- Replace with selector for the green call button
const CONNECTION_INDICATOR_SELECTOR = '#selector-for-connection-indicator'; // <-- Replace with selector for element indicating connection success (must work in both pages)

const PUPPETEER_TIMEOUT = 30000; // 30 seconds timeout for Puppeteer waits
const SERVER_STARTUP_TIMEOUT = 45000; // Max time to wait for server to start and print URL
const JEST_TIMEOUT = SERVER_STARTUP_TIMEOUT + PUPPETEER_TIMEOUT + 10000; // Jest timeout needs to be longer than server startup + test execution

// --- Helper Function ---
async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
    console.log(`Waiting for connection indicator in ${description}...`);
    // Option 1: Wait for a specific element to appear or contain specific text
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    // Example: If the indicator element should contain text 'Connected'
    // await page.waitForFunction(
    //   (selector) => document.querySelector(selector)?.textContent?.includes('Connected'),
    //   { timeout: PUPPETEER_TIMEOUT },
    //   CONNECTION_INDICATOR_SELECTOR
    // );

    // Option 2: More robust - check RTCPeerConnection state if accessible
    // This requires your app to expose the connection state, e.g., on the window object
    /*
    await page.waitForFunction(() => {
        // Find the relevant PeerConnection object - this depends heavily on your app's structure
        // Example: assuming window.webRTCApp.getApp().clients has the connections
        // Need to declare the type for window if extending it
        // const clients = (window as any).webRTCApp?.getApp()?.clients;
        // if (!clients) return false;
        // const client = Object.values(clients)[0] as { pc?: RTCPeerConnection }; // Adjust type as needed
        // return client?.pc?.connectionState === 'connected';
    }, { timeout: PUPPETEER_TIMEOUT });
    */
    console.log(`Connection indicator found in ${description}.`);
}


// --- Jest Test Suite ---
describe('WebRTC Peer Connection E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT); // Increase Jest timeout for server startup + test

    let serverProcess: ChildProcessWithoutNullStreams | null = null;
    let serverUrl: string | null = null;
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

        // Kill the server process started by this suite
        killServer();
        console.log('Test suite cleanup finished.');
        // Note: Browser is closed by globalTeardown, not here.
    });

    test('should establish a WebRTC connection between two peers', async () => {
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

            // 2. Wait for and extract the invite URL from Browser A
            console.log('Waiting for invite URL element...');
            await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Invite URL element found. Clicking it to copy URL...');
            await pageA.click(INVITE_URL_SELECTOR);

            // Give clipboard a moment to update (might be needed in some environments)
            // await pageA.waitForTimeout(100); // Optional: uncomment if facing timing issues

            console.log('Reading invite URL from clipboard...');
            // Grant clipboard read permission before trying to read.
            // Ensure serverUrl is not null before using it.
            if (!serverUrl) {
                throw new Error("Server URL is null, cannot grant clipboard permissions.");
            }
            const context = pageA.browserContext();
            // Grant permissions to the origin of the server URL
            const origin = new URL(serverUrl).origin;
            await context.overridePermissions(origin, ['clipboard-read', 'clipboard-write']);

            const inviteUrl = await pageA.evaluate(async () => {
                try {
                    return await navigator.clipboard.readText();
                } catch (err) {
                    console.error('Failed to read clipboard:', err);
                    return null; // Return null or throw an error as appropriate
                }
            });

            if (!inviteUrl) {
                throw new Error('Could not read invite URL from clipboard.');
            }
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

            console.log('--- TEST SUCCESS: WebRTC connection appears established in both browsers! ---');
            // Jest will automatically pass the test if no error is thrown

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
