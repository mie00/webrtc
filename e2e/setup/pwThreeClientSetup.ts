import type { Browser, Page, BrowserContext } from '@playwright/test';
import {
    INVITE_URL_SELECTOR,
    CALL_BUTTON_SELECTOR,
    PW_TIMEOUT,
    checkConnectionEstablished
} from './pwTestHelpers';


export interface ThreeClientSetupResult {
    pageA: Page;
    contextA: BrowserContext;
    pageB: Page;
    contextB: BrowserContext;
    pageC: Page;
    contextC: BrowserContext;
}

export async function pwThreeClientSetup(browser: Browser): Promise<ThreeClientSetupResult> {
    console.log('\n--- Playwright Three Client E2E Setup (Pages & Connection) ---');
    // Create three separate browser contexts for isolation
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const contextC = await browser.newContext();

    // Clear storage for contexts
    await Promise.all([
        contextA.clearCookies(), contextA.clearPermissions(),
        contextB.clearCookies(), contextB.clearPermissions(),
        contextC.clearCookies(), contextC.clearPermissions()
    ]);

    console.log('Opening Page A...');
    const pageA = await contextA.newPage();
    console.log(`Page A navigating to: /`);
    await pageA.goto('/', { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
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
    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page B navigation complete.');

    console.log('Waiting for call button in Page B...');
    await pageB.locator(CALL_BUTTON_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    console.log('Call button found on Page B. Clicking...');
    await pageB.locator(CALL_BUTTON_SELECTOR).click();
    console.log('Call button clicked on Page B.');

    console.log('Opening Page C...');
    const pageC = await contextC.newPage();
    console.log('Page C navigating to the same invite URL...');
    await pageC.goto(inviteUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page C navigation complete.');

    console.log('Waiting for call button in Page C...');
    await pageC.locator(CALL_BUTTON_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    console.log('Call button found on Page C. Clicking...');
    await pageC.locator(CALL_BUTTON_SELECTOR).click();
    console.log('Call button clicked on Page C.');

    console.log('Waiting for connection establishment in all three pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B'),
        checkConnectionEstablished(pageC, 'Page C')
    ]);
    console.log('--- Initial connections established (A <-> B, A <-> C) for Playwright ---');

    console.log('--- Playwright Three Client E2E Setup Complete ---');
    return { pageA, contextA, pageB, contextB, pageC, contextC };
}
