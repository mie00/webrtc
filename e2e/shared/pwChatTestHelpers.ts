import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { PW_TIMEOUT, CHAT_OUTPUT_CONTAINER_SELECTOR } from '../setup/pwTestHelpers';
import { ensurePanelOpen } from './pwPanelUtils';

export async function verifyMessageReceived(
  receiverPage: Page,
  receiverName: string,
  expectedMessage: string
): Promise<void> {
  console.log(
    `Verifying message "${expectedMessage}" appears in ${CHAT_OUTPUT_CONTAINER_SELECTOR} on ${receiverName}...`
  );
  await ensurePanelOpen(receiverPage, receiverName);

  const chatOutputContainer = receiverPage.locator(CHAT_OUTPUT_CONTAINER_SELECTOR);
  try {
    // Use Playwright's built-in text assertion
    await expect(chatOutputContainer).toContainText(expectedMessage, { timeout: PW_TIMEOUT * 2 });
    console.log(`Message "${expectedMessage}" found in container on ${receiverName}.`);
  } catch (error) {
    console.error(
      `Error waiting for message "${expectedMessage}" in container on ${receiverName}:`,
      error
    );
    const messagesHtml = await chatOutputContainer
      .innerHTML()
      .catch(() => 'Could not get chat messages HTML');
    console.error(`Current messages on ${receiverName}:\n${messagesHtml}`);
    throw new Error(
      `Message "${expectedMessage}" not found in container on ${receiverName} within timeout.`
    );
  }
}
