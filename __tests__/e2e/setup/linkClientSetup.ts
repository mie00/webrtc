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

// Use globalThis for broader compatibility
declare global {
    // These are set in globalSetup.ts
    var __SERVER_URL__: string | undefined;
    var __SERVER_PID__: number | undefined;
    // These are set by jest-environment-puppeteer
    // These will be set by this standardSetup
    var __PAGE_A__: Page | undefined;
    var __PAGE_B__: Page | undefined; // This global var will no longer be set by standardSetup
}

interface SetupResult {
    pageA: Page;
    pageB: Page;
}

// No longer default export, and doesn't need 'this' context
export async function linkClientSetup(): Promise<SetupResult> {
    console.log('\n--- Standard E2E Setup (Pages & Connection) ---');

    // --- 1. Get Server URL from Global Scope (still needed from globalSetup) ---
    const serverUrl = globalThis.__SERVER_URL__;
    if (!serverUrl) {
        throw new Error("Server URL (__SERVER_URL__) not found in global scope. Ensure globalSetup ran successfully.");
    }
    console.log(`Using server URL from global setup: ${serverUrl}`);

    // --- 2. Setup Browser Pages ---
    // Browser A instance is provided by jest-environment-puppeteer and stored in this.global.browser
    const browserA = globalThis.__BROWSER_A__;
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
    await pageA.waitForSelector('#test-open-config-button', { visible: true, timeout: PUPPETEER_TIMEOUT });
    await pageA.click('#test-open-config-button');
    await pageA.waitForSelector('#config-loader', { visible: true, timeout: PUPPETEER_TIMEOUT });
    await pageA.select('#config-loader', 'client');
    await Promise.all([
        pageA.waitForNavigation(), // The promise resolves after navigation has finished
        pageA.click('#save-button'), // Clicking the link will indirectly cause a navigation
      ]);

    console.log('Waiting for invite URL copy button on Page A...');
    await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Invite URL element found. Evaluating window location...');
    const inviteUrl = await pageA.$eval('textarea#test-copy', (el) => el.value);
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
    console.log('Waiting for copy button in Page B...'); // Client mode shows Copy button initially
    await pageB.waitForSelector('#test-copy-button', { visible: true, timeout: PUPPETEER_TIMEOUT });
    // wait for a bit
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // get the new url of the page
    const responseUrl = await pageB.evaluate(() => window.location.href);

    const pageC = await browserA.newPage();
    console.log('Page C navigating to response URL...', responseUrl);
    await Promise.all([
        pageC.waitForNavigation(),
        pageC.goto(responseUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT }),
    ]);
    console.log('Page C navigation complete.');
    pageC.close();

    console.log('Waiting for connection establishment in both pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B')
    ]);
    console.log('--- Initial connection established ---');

    // Store pages globally *after* connection is established
    // Note: Storing non-serializable objects like Page instances globally can be tricky.
    // jest-puppeteer handles the browser instance. For pages, it might be better
    // Return the created pages instead of storing globally
    console.log('--- Standard E2E Setup Complete ---');
    return { pageA, pageB };
}
