import puppeteer, { type Browser, type Page } from 'puppeteer'; // Use type imports for Browser/Page
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'; // Use type import
import path from 'path'; // Needed for resolving project root potentially

// --- Configuration ---
// IMPORTANT: Replace these selectors with actual values from your application!
const INVITE_URL_SELECTOR = '#selector-for-invite-url'; // <-- Replace with selector for the invite URL element (e.g., input, span)
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
    let browserA: Browser | null = null;
    let browserB: Browser | null = null;

    beforeAll(async () => {
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
        console.log('Cleaning up...');
        // Close browsers first
        console.log('Closing browsers...');
        if (browserA) await browserA.close();
        if (browserB) await browserB.close();
        console.log('Browsers closed.');

        // Then kill the server process
        killServer();
        console.log('Cleanup finished.');
    });

    test('should establish a WebRTC connection between two peers', async () => {
        if (!serverUrl) {
            throw new Error("Server URL not available for test.");
        }
        console.log(`Starting WebRTC connection test using URL: ${serverUrl}`);

        try {
            // 1. Launch Browser A
            console.log('Launching Browser A...');
            browserA = await puppeteer.launch({ headless: 'new' }); // Use headless: 'new' or false
            const pageA = await browserA.newPage();
            console.log(`Browser A navigating to: ${serverUrl}`);
            await pageA.goto(serverUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
            console.log('Browser A navigation complete.');

            // 2. Wait for and extract the invite URL from Browser A
            console.log('Waiting for invite URL element...');
            await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Invite URL element found.');

            // Extract URL (adjust property based on element type: value, textContent, href)
            // Ensure the element contains the *full* URL needed for the second browser
            const inviteUrl = await pageA.$eval(INVITE_URL_SELECTOR, (el: Element) => (el as HTMLInputElement).value || el.textContent || (el as HTMLAnchorElement).href);
            if (!inviteUrl) {
                throw new Error('Could not extract invite URL from element.');
            }
            // Basic validation: Check if it looks like a URL (might need refinement)
            if (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://')) {
                 throw new Error(`Extracted invite content "${inviteUrl}" does not look like a valid URL.`);
            }
            console.log(`Extracted Invite URL: ${inviteUrl}`);

            // 3. Launch Browser B
            console.log('Launching Browser B...');
            browserB = await puppeteer.launch({ headless: 'new' }); // Use headless: false for debugging
            const pageB = await browserB.newPage();

            // 4. Navigate Browser B to the invite URL
            console.log('Browser B navigating to invite URL...');
            await pageB.goto(inviteUrl, { waitUntil: 'networkidle0' });
            console.log('Browser B navigation complete.');

            // 5. Find and click the call button in Browser B
            console.log('Waiting for call button in Browser B...');
            await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
            console.log('Call button found. Clicking...');
            await pageB.click(CALL_BUTTON_SELECTOR);
            console.log('Call button clicked.');

            // 6. Wait for connection to be established in both browsers
            console.log('Waiting for connection establishment in both browsers...');
            await Promise.all([
                checkConnectionEstablished(pageA, 'Browser A'),
                checkConnectionEstablished(pageB, 'Browser B')
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
        // Note: Browser cleanup is handled in afterAll
    });
});
