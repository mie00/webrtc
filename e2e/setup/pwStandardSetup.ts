import type { Browser, Page, BrowserContext } from '@playwright/test';
import {
    INVITE_URL_SELECTOR,
    CALL_BUTTON_SELECTOR,
    PW_TIMEOUT,
    checkConnectionEstablished
} from './pwTestHelpers';

// Assuming globalThis.__SERVER_URL__ is set by a Playwright global setup or similar mechanism.
declare global {
    var __SERVER_URL__: string | undefined;
}

export interface StandardSetupResult {
    pageA: Page;
    contextA: BrowserContext;
    pageB: Page;
    contextB: BrowserContext;
}

export async function standardSetup(browser: Browser): Promise<StandardSetupResult> {
    console.log('\n--- Playwright Standard E2E Setup (Pages & Connection) ---');

    const serverUrl = globalThis.__SERVER_URL__;
    if (!serverUrl) {
        // In Playwright, you'd typically get the baseURL from the config or pass it explicitly.
        // For now, we adhere to the existing pattern of __SERVER_URL__.
        throw new Error("Server URL (__SERVER_URL__) not found in global scope. Ensure it's set (e.g., by Playwright globalSetup).");
    }
    console.log(`Using server URL from global setup: ${serverUrl}`);

    // Create two separate browser contexts for isolation
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    // Clear storage for contexts
    await contextA.clearCookies();
    await contextA.clearPermissions();
    await contextB.clearCookies();
    await contextB.clearPermissions();


    console.log('Opening Page A...');
    const pageA = await contextA.newPage();
    await pageA.evaluate(() => localStorage.clear()); // Clear localStorage

    console.log(`Page A navigating to: ${serverUrl}`);
    await pageA.goto(serverUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page A navigation complete.');

    console.log('Waiting for invite URL copy button on Page A...');
    await pageA.locator(INVITE_URL_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    console.log('Invite URL copy button found. Evaluating window location...');

    const inviteUrl = await pageA.evaluate(() => window.location.toString());
    if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
        throw new Error(`Failed to get a valid invite URL (page location) from Page A: ${inviteUrl}`);
    }
    console.log(`Invite URL from Page A: ${inviteUrl}`);

    console.log('Opening Page B...');
    const pageB = await contextB.newPage();
    await pageB.evaluate(() => localStorage.clear()); // Clear localStorage

    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page B navigation complete.');

    console.log('Waiting for call button in Page B...');
    await pageB.locator(CALL_BUTTON_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    console.log('Call button found. Clicking...');
    await pageB.locator(CALL_BUTTON_SELECTOR).click();
    console.log('Call button clicked.');

    console.log('Waiting for connection establishment in both pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B')
    ]);
    console.log('--- Initial connection established (Playwright) ---');

    console.log('--- Playwright Standard E2E Setup Complete ---');
    return { pageA, contextA, pageB, contextB };
}
