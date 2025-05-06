// Similar to standardSetup, but for three clients (A, B, C)
import type { Browser, Page } from 'puppeteer';
import {
    INVITE_URL_SELECTOR,
    CALL_BUTTON_SELECTOR,
    CONNECTION_INDICATOR_SELECTOR,
    PUPPETEER_TIMEOUT,
    checkConnectionEstablished
} from './testHelpers';

// Use globalThis for broader compatibility
declare global {
    // These are set in globalSetup.ts
    var __SERVER_URL__: string | undefined;
    var __SERVER_PID__: number | undefined;
    var __BROWSER_A__: Browser | undefined;
    var __BROWSER_B__: Browser | undefined;
    var __BROWSER_C__: Browser | undefined; // Browser for the third client
}

interface SetupResult {
    pageA: Page;
    pageB: Page;
    pageC: Page; // Added pageC
}

export async function threeClientSetup(): Promise<SetupResult> {
    console.log('\n--- Three Client E2E Setup (Pages & Connection) ---');

    // --- 1. Get Server URL ---
    const serverUrl = globalThis.__SERVER_URL__;
    if (!serverUrl) {
        throw new Error("Server URL (__SERVER_URL__) not found in global scope. Ensure globalSetup ran successfully.");
    }
    console.log(`Using server URL from global setup: ${serverUrl}`);

    // --- 2. Get Browser Instances ---
    const browserA = globalThis.__BROWSER_A__;
    if (!browserA) {
        throw new Error("Browser A instance (__BROWSER_A__) not found. Ensure globalSetup/jest-puppeteer is working.");
    }
    const browserB = globalThis.__BROWSER_B__;
    if (!browserB) {
        throw new Error("Browser B instance (__BROWSER_B__) not found. Ensure globalSetup ran successfully.");
    }
    const browserC = globalThis.__BROWSER_C__; // Get browser C
    if (!browserC) {
        throw new Error("Browser C instance (__BROWSER_C__) not found. Ensure globalSetup ran successfully.");
    }
     // Optional: Log if B and C share the same browser instance
     if (browserB === browserC) {
        console.log("Note: Browser B and Browser C are using the same browser instance.");
    }


    // --- 3. Setup Page A and Get Invite URL ---
    console.log('Opening Page A in Browser A...');
    const pageA = await browserA.newPage();
    console.log(`Page A navigating to: ${serverUrl}`);
    await pageA.goto(serverUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page A navigation complete.');

    console.log('Waiting for invite URL copy button on Page A...');
    await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Invite URL copy button found. Evaluating window location...');
    // The invite URL is the page URL for the host in threeClient setup
    const inviteUrl = await pageA.evaluate(() => window.location.toString());
    if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
        throw new Error(`Failed to get a valid invite URL (page location) from Page A: ${inviteUrl}`);
    }
    console.log(`Invite URL from Page A: ${inviteUrl}`);

    // --- 4. Setup Page B ---
    console.log('Opening Page B in Browser B...');
    const pageB = await browserB.newPage();
    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page B navigation complete.');

    // --- 5. Establish Connections ---
    console.log('Waiting for call button in Page B...');
    await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Call button found on Page B. Clicking...');
    await pageB.click(CALL_BUTTON_SELECTOR);
    console.log('Call button clicked on Page B.');

    // --- 6. Setup Page C ---
    console.log('Opening Page C in Browser C...');
    const pageC = await browserC.newPage(); // Use browserC
    console.log('Page C navigating to the same invite URL...');
    await pageC.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT }); // Use the same inviteUrl
    console.log('Page C navigation complete.');

    console.log('Waiting for call button in Page C...');
    await pageC.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Call button found on Page C. Clicking...');
    await pageC.click(CALL_BUTTON_SELECTOR); // Click call button on Page C
    console.log('Call button clicked on Page C.');

    console.log('Waiting for connection establishment in all three pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B'),
        checkConnectionEstablished(pageC, 'Page C') // Check connection for Page C
    ]);
    console.log('--- Initial connections established (A <-> B, A <-> C) ---');

    console.log('--- Three Client E2E Setup Complete ---');
    return { pageA, pageB, pageC }; // Return all three pages
}
