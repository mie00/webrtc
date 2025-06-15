import type { Browser, Page, BrowserContext } from '@playwright/test';
import {
  INVITE_URL_SELECTOR,
  // CALL_BUTTON_SELECTOR, // Not used in this specific setup
  // CONNECTION_INDICATOR_SELECTOR, // Used by checkConnectionEstablished
  PW_TIMEOUT,
  checkConnectionEstablished
} from './pwTestHelpers';
import { handleLoginIfNeeded } from './pwAuthHelper';

export interface StandardSetupResult {
  pageA: Page;
  contextA: BrowserContext;
  pageB: Page;
  contextB: BrowserContext;
}

export interface StandardSetupOptions {
  delayAfterPageAOpenMs?: number;
  delayBeforePastingResponseMs?: number;
}

export async function standardSetup(
  browser: Browser,
  options?: StandardSetupOptions
): Promise<StandardSetupResult> {
  console.log('\n--- Playwright Standard Client E2E Setup (Pages & Connection) ---');
  if (options?.delayAfterPageAOpenMs || options?.delayBeforePastingResponseMs) {
    console.log(
      `--- Applying delays: After Page A Open: ${options.delayAfterPageAOpenMs || 0}ms, Before Paste: ${options.delayBeforePastingResponseMs || 0}ms ---`
    );
  }

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.clearCookies();
  await contextA.clearPermissions();
  await contextB.clearCookies();
  await contextB.clearPermissions();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  console.log('Page A navigating to: /');
  await pageA.goto('/?mode=client', { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
  console.log('Page A navigation complete.');
  await handleLoginIfNeeded(pageA, 'Page A');

  console.log('Waiting for invite URL copy button on Page A...');
  await pageA.locator(INVITE_URL_SELECTOR).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
  console.log('Invite URL element found. Evaluating textarea...');
  const inviteUrl = await pageA.locator('textarea#test-copy').inputValue();
  if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
    throw new Error(`Failed to get a valid invite URL from Page A: ${inviteUrl}`);
  }
  console.log(`Invite URL from Page A: ${inviteUrl}`);

  if (options?.delayAfterPageAOpenMs && options.delayAfterPageAOpenMs > 0) {
    console.log(`Waiting for ${options.delayAfterPageAOpenMs}ms after Page A setup before Page B navigation...`);
    await pageA.waitForTimeout(options.delayAfterPageAOpenMs);
  }

  console.log('Page B navigating to invite URL...');
  await pageB.goto(inviteUrl, { waitUntil: 'networkidle', timeout: PW_TIMEOUT });
  console.log('Page B navigation complete.');
  await handleLoginIfNeeded(pageB, 'Page B');

  console.log('Waiting for copy button in Page B...');
  await pageB.locator('#test-copy-button').waitFor({ state: 'visible', timeout: PW_TIMEOUT });
  await pageB.waitForTimeout(1000); // wait for a bit

  const copyText = await pageB.locator('textarea#test-copy').inputValue();
  console.log(`Copy text from Page B: ${copyText}`);

  if (options?.delayBeforePastingResponseMs && options.delayBeforePastingResponseMs > 0) {
    console.log(
      `Waiting for ${options.delayBeforePastingResponseMs}ms after Page B setup before pasting response to Page A...`
    );
    await pageB.waitForTimeout(options.delayBeforePastingResponseMs);
  }

  await pageA.locator('#test-paste').fill(copyText);
  console.log(`Pasted text into Page A: ${copyText}`);

  await pageA.locator('#test-accept').click();
  console.log('Accepted connection in Page A.');

  console.log('Waiting for connection establishment in both pages...');
  await Promise.all([
    checkConnectionEstablished(pageA, 'Page A'),
    checkConnectionEstablished(pageB, 'Page B')
  ]);
  console.log('--- Initial connection established (Playwright Standard Client) ---');

  console.log('--- Playwright Standard Client E2E Setup Complete ---');
  return { pageA, contextA, pageB, contextB };
}
