import type { Page } from '@playwright/test';
import {
  PW_TIMEOUT,
  CONTROL_PANEL_SELECTOR,
  CONTROL_PANEL_TOGGLE_SELECTOR
} from '../setup/pwTestHelpers'; // Using Playwright helpers

export async function ensurePanelOpen(page: Page, pageName: string): Promise<void> {
  console.log(`Checking if control panel is open on ${pageName}...`);
  const panel = page.locator(CONTROL_PANEL_SELECTOR);
  await panel.waitFor({ state: 'attached', timeout: PW_TIMEOUT }); // Ensure element exists

  // Check if the panel is visually hidden using the 'left-full' class
  const panelIsClosed = (await panel.getAttribute('class'))?.includes('left-full');

  if (panelIsClosed) {
    console.log(`Control panel is closed on ${pageName}, attempting to open...`);
    const toggleButton = page.locator(CONTROL_PANEL_TOGGLE_SELECTOR);
    await toggleButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await toggleButton.click();

    // Wait for panel to be open by checking that 'left-full' class is removed
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && !el.classList.contains('left-full');
      },
      CONTROL_PANEL_SELECTOR,
      { timeout: PW_TIMEOUT }
    );
    console.log(`Control panel opened on ${pageName}.`);
  } else {
    console.log(`Control panel is already open on ${pageName}.`);
  }
}

export async function ensurePanelClosed(page: Page, pageName: string): Promise<void> {
  console.log(`Checking if control panel is closed on ${pageName}...`);
  const panel = page.locator(CONTROL_PANEL_SELECTOR);
  await panel.waitFor({ state: 'attached', timeout: PW_TIMEOUT });

  const panelIsClosed = (await panel.getAttribute('class'))?.includes('left-full');

  if (!panelIsClosed) {
    // If panel is open
    console.log(`Control panel is open on ${pageName}, attempting to close...`);
    const toggleButton = page.locator(CONTROL_PANEL_TOGGLE_SELECTOR);
    await toggleButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await toggleButton.click();

    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && el.classList.contains('left-full');
      },
      CONTROL_PANEL_SELECTOR,
      { timeout: PW_TIMEOUT }
    );
    console.log(`Control panel closed on ${pageName}.`);
  } else {
    console.log(`Control panel is already closed on ${pageName}.`);
  }
}
