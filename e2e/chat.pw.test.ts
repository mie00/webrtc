import { test, expect, Page, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown, StandardTeardownArgs } from './setup/pwStandardTeardown';
import { PW_TIMEOUT, CHAT_INPUT_SELECTOR } from './setup/pwTestHelpers';
import { verifyMessageReceived } from './shared/pwChatTestHelpers';
import { ensurePanelOpen } from './shared/pwPanelUtils';

test.describe('WebRTC Chat E2E Test with Playwright', () => {
  let pageA: Page;
  let contextA: BrowserContext;
  let pageB: Page;
  let contextB: BrowserContext;

  // Use Playwright's test lifecycle hooks
  // The 'browser' fixture is automatically provided by Playwright
  test.beforeAll(async ({ browser }) => {
    const setupResult: StandardSetupResult = await standardSetup(browser);
    pageA = setupResult.pageA;
    contextA = setupResult.contextA;
    pageB = setupResult.pageB;
    contextB = setupResult.contextB;
  });

  test.afterAll(async () => {
    await standardTeardown({ pageA, contextA, pageB, contextB });
  });

  // Helper function to send a message and verify receipt using Playwright
  async function sendMessageAndVerify(
    senderPage: Page,
    receiverPage: Page,
    message: string,
    senderName: string,
    receiverName: string
  ) {
    console.log(`\n--- Sending message from ${senderName} to ${receiverName} ---`);
    console.log(`Message: "${message}"`);

    await ensurePanelOpen(senderPage, senderName);

    console.log(`Typing message on ${senderName}...`);
    const chatInput = senderPage.locator(CHAT_INPUT_SELECTOR);
    await chatInput.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await chatInput.fill(message); // Use fill for input fields
    await senderPage.keyboard.press('Enter');
    console.log(`Message sent from ${senderName}.`);

    // verifyMessageReceived already ensures panel is open on receiver
    await verifyMessageReceived(receiverPage, receiverName, message);

    console.log(`--- Message successfully verified on ${receiverName} ---`);
  }

  test('should send a message from Page A to Page B', async () => {
    const message = `Hello from Page A (Playwright)! ${Date.now()}`;
    await sendMessageAndVerify(pageA, pageB, message, 'Page A', 'Page B');
  });

  test('should send a message from Page B to Page A', async () => {
    const message = `Reply from Page B (Playwright)! ${Date.now()}`;
    await sendMessageAndVerify(pageB, pageA, message, 'Page B', 'Page A');
  });

  test('should handle multiple messages back and forth', async () => {
    const message1 = `Test message 1 (A->B) (Playwright) ${Date.now()}`;
    await sendMessageAndVerify(pageA, pageB, message1, 'Page A', 'Page B');

    const message2 = `Test message 2 (B->A) (Playwright) ${Date.now()}`;
    await sendMessageAndVerify(pageB, pageA, message2, 'Page B', 'Page A');

    const message3 = `Test message 3 (A->B) (Playwright) ${Date.now()}`;
    await sendMessageAndVerify(pageA, pageB, message3, 'Page A', 'Page B');
  });
});
