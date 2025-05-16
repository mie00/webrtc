import type { Browser, Page, BrowserContext } from '@playwright/test';
import {
    INVITE_URL_SELECTOR,
    // CALL_BUTTON_SELECTOR, // Not used in this specific setup
    // CONNECTION_INDICATOR_SELECTOR, // Used by checkConnectionEstablished
    PW_TIMEOUT,
    checkConnectionEstablished
} from './pwTestHelpers';

export interface LinkClientSetupResult {
    pageA: Page;
    contextA: BrowserContext;
    pageB: Page;
    contextB: BrowserContext;
}

export async function pwLinkClientSetup(browser: Browser): Promise<LinkClientSetupResult> {
    console.log('\n--- Playwright Link Client E2E Setup (Pages & Connection) ---');

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    await contextA.clearCookies();
    await contextA.clearPermissions();
    await contextB.clearCookies();
    await contextB.clearPermissions();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    console.log('Page A navigating to: /');
    await pageA.goto('/', { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page A navigation complete.');

    await pageA.locator('#test-open-config-button').waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await pageA.locator('#test-open-config-button').click();
    await pageA.locator('#config-loader').waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await pageA.locator('#config-loader').selectOption('client');

    await pageA.locator('#save-button').click();
    await pageA.waitForLoadState('networkidle', { timeout: PW_TIMEOUT });

    console.log('Waiting for invite URL copy button on Page A...');
    await pageA.locator(INVITE_URL_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    console.log('Invite URL element found. Evaluating textarea...');
    const inviteUrl = await pageA.locator('textarea#test-copy').inputValue();
    if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
        throw new Error(`Failed to get a valid invite URL from Page A: ${inviteUrl}`);
    }
    console.log(`Invite URL from Page A: ${inviteUrl}`);

    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page B navigation complete.');

    console.log('Waiting for copy button in Page B...');
    await pageB.locator('#test-copy-button').waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await pageB.waitForTimeout(1000); // wait for a bit

    const responseUrl = pageB.url();
    console.log(`Response URL from Page B: ${responseUrl}`);

    const pageC = await contextA.newPage(); // Open in the same context as Page A
    console.log('Page C navigating to response URL...', responseUrl);
    await pageC.goto(responseUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
    console.log('Page C navigation complete.');
    await pageC.close();
    console.log('Page C closed.');

    console.log('Waiting for connection establishment in both pages (A and B)...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B')
    ]);
    console.log('--- Initial connection established (Playwright Link Client) ---');

    console.log('--- Playwright Link Client E2E Setup Complete ---');
    return { pageA, contextA, pageB, contextB };
}