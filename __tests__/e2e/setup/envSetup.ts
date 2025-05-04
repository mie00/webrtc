// Removed spawn and SERVER_STARTUP_TIMEOUT as server is started globally
import type { Browser, Page } from 'puppeteer';
// Removed path import as it wasn't used after server logic removal
import {
    INVITE_URL_SELECTOR,
    CALL_BUTTON_SELECTOR,
    CONNECTION_INDICATOR_SELECTOR,
    PUPPETEER_TIMEOUT,
    checkConnectionEstablished // Assuming checkConnectionEstablished is available
} from './testHelpers'; // Ensure .js extension if needed, or configure resolver

import type { Browser } from 'puppeteer'; // Import Browser type

// Use globalThis for broader compatibility
declare global {
    // These are set in globalSetup.ts
    var __SERVER_URL__: string | undefined;
    var __SERVER_PID__: number | undefined;
    var __BROWSER_B__: Browser | undefined; // Added Browser B
    // These are set by jest-environment-puppeteer
    var browser: Browser | undefined; // Default browser (Browser A)
    // These will be set by this envSetup
    var __PAGE_A__: Page | undefined;
    var __PAGE_B__: Page | undefined;
}


export default async function envSetup() {
    // 'this' refers to the Jest environment instance
    console.log('\n--- Environment E2E Setup (Pages) ---');

    // --- 1. Get Server URL from Global Scope ---
    const serverUrl = globalThis.__SERVER_URL__;
    if (!serverUrl) {
        throw new Error("Server URL (__SERVER_URL__) not found in global scope. Ensure globalSetup ran successfully.");
    }
    console.log(`Using server URL from global setup: ${serverUrl}`);

    // --- 2. Setup Browser Pages ---
    // Browser A instance is provided by jest-environment-puppeteer and stored in this.global.browser
    const browserA = this.global.browser as Browser;
     if (!browserA) {
        throw new Error("Browser A instance (this.global.browser) not found. Ensure jest-puppeteer preset/environment is working.");
    }
    // Browser B instance is retrieved from global scope set in globalSetup
    const browserB = globalThis.__BROWSER_B__;
     if (!browserB) {
        throw new Error("Browser B instance (__BROWSER_B__) not found in global scope. Ensure globalSetup ran successfully and launched Browser B.");
    }

    console.log('Opening Page A in Browser A...');
    const pageA = await browserA.newPage();
    console.log(`Page A navigating to: ${serverUrl}`);
    await pageA.goto(serverUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page A navigation complete.');

    console.log('Waiting for invite URL element on Page A...');
    await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Invite URL element found. Evaluating window location...');
    const inviteUrl = await pageA.evaluate(() => window.location.toString());
    if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
        throw new Error(`Failed to get a valid invite URL from Page A: ${inviteUrl}`);
    }
    console.log(`Invite URL from Page A: ${inviteUrl}`);

    console.log('Opening Page B in Browser B...');
    const pageB = await browserB.newPage();
    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page B navigation complete.');

    // --- 3. Establish Connection ---
    console.log('Waiting for call button in Page B...');
    await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Call button found. Clicking...');
    await pageB.click(CALL_BUTTON_SELECTOR);
    console.log('Call button clicked.');

    console.log('Waiting for connection establishment in both pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B')
    ]);
    console.log('--- Initial connection established ---');

    // Store pages globally *after* connection is established
    // Note: Storing non-serializable objects like Page instances globally can be tricky.
    // jest-puppeteer handles the browser instance. For pages, it might be better
    // to re-fetch them in tests if needed, but let's try storing them first.
    // A common pattern is to store IDs or minimal info if full objects cause issues.
    this.global.__PAGE_A__ = pageA;
    this.global.__PAGE_B__ = pageB;

    console.log('--- Global E2E Setup Complete ---');
}
