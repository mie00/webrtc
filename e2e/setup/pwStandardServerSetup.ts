import type { Browser, Page, BrowserContext } from '@playwright/test';
import {
  INVITE_URL_SELECTOR,
  CALL_BUTTON_SELECTOR,
  PW_TIMEOUT,
  checkConnectionEstablished
} from './pwTestHelpers';
import { handleLoginIfNeeded } from './pwAuthHelper';

export interface StandardServerSetupResult {
  pageA: Page;
  contextA: BrowserContext;
  pageB: Page;
  contextB: BrowserContext;
}

export async function standardServerSetup(browser: Browser): Promise<StandardServerSetupResult> {
  console.log('\n--- Playwright Standard E2E Setup (Pages & Connection) ---');

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

  console.log(`Page A navigating to: /`);
  await pageA.goto('/', { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
  console.log('Page A navigation complete.');
  await handleLoginIfNeeded(pageA, 'Page A');

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
  await handleLoginIfNeeded(pageB, 'Page B');

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
