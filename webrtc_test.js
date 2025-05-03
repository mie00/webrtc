
const puppeteer = require('puppeteer');

// --- Configuration ---
const APP_START_URL = 'YOUR_APP_START_URL'; // <-- Replace with your app's URL
const INVITE_URL_SELECTOR = '#selector-for-invite-url'; // <-- Replace with selector for the invite URL element (e.g., input, span)
const CALL_BUTTON_SELECTOR = '#selector-for-call-button'; // <-- Replace with selector for the green call button
const CONNECTION_INDICATOR_SELECTOR = '#selector-for-connection-indicator'; // <-- Replace with selector for element indicating connection success (must work in both pages)
const TIMEOUT = 30000; // 30 seconds timeout for waits

// --- Helper Function ---
async function checkConnectionEstablished(page, description) {
    console.log(`Waiting for connection indicator in ${description}...`);
    // Option 1: Wait for a specific element to appear or contain specific text
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: true, timeout: TIMEOUT });
    // Example: If the indicator element should contain text 'Connected'
    // await page.waitForFunction(
    //   (selector) => document.querySelector(selector)?.textContent?.includes('Connected'),
    //   { timeout: TIMEOUT },
    //   CONNECTION_INDICATOR_SELECTOR
    // );

    // Option 2: More robust - check RTCPeerConnection state if accessible
    // This requires your app to expose the connection state, e.g., on the window object
    /*
    await page.waitForFunction(() => {
        // Find the relevant PeerConnection object - this depends heavily on your app's structure
        // Example: assuming window.webRTCApp.getApp().clients has the connections
        const clients = window.webRTCApp?.getApp()?.clients;
        if (!clients) return false;
        const client = Object.values(clients)[0]; // Adjust if multiple clients exist
        return client?.pc?.connectionState === 'connected';
    }, { timeout: TIMEOUT });
    */
    console.log(`Connection indicator found in ${description}.`);
}


// --- Main Test Function ---
(async () => {
    let browserA = null;
    let browserB = null;
    console.log('Starting WebRTC connection test...');

    try {
        // 1. Launch Browser A
        console.log('Launching Browser A...');
        browserA = await puppeteer.launch({ headless: false }); // Use headless: true for CI environments
        const pageA = await browserA.newPage();
        await pageA.goto(APP_START_URL, { waitUntil: 'networkidle0' });
        console.log('Browser A navigated to start URL.');

        // 2. Wait for and extract the invite URL from Browser A
        console.log('Waiting for invite URL element...');
        await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: TIMEOUT });
        console.log('Invite URL element found.');

        // Extract URL (adjust property based on element type: value, textContent, href)
        const inviteUrl = await pageA.$eval(INVITE_URL_SELECTOR, el => el.value || el.textContent || el.href);
        if (!inviteUrl) {
            throw new Error('Could not extract invite URL from element.');
        }
        console.log(`Extracted Invite URL: ${inviteUrl}`);

        // 3. Launch Browser B
        console.log('Launching Browser B...');
        browserB = await puppeteer.launch({ headless: false }); // Use headless: true for CI environments
        const pageB = await browserB.newPage();

        // 4. Navigate Browser B to the invite URL
        console.log('Browser B navigating to invite URL...');
        await pageB.goto(inviteUrl, { waitUntil: 'networkidle0' });
        console.log('Browser B navigation complete.');

        // 5. Find and click the call button in Browser B
        console.log('Waiting for call button in Browser B...');
        await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: TIMEOUT });
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

    } catch (error) {
        console.error('--- TEST FAILED ---');
        console.error(error);
        // Consider taking screenshots on failure
        // if (pageA) await pageA.screenshot({ path: 'error_pageA.png' });
        // if (pageB) await pageB.screenshot({ path: 'error_pageB.png' });
    } finally {
        // 7. Cleanup
        console.log('Closing browsers...');
        if (browserA) await browserA.close();
        if (browserB) await browserB.close();
        console.log('Browsers closed.');
    }
})();
