import type { Page } from '@playwright/test';
import { PW_TIMEOUT } from './pwTestHelpers';

// Define selectors for clarity
const AUTH_REQUIRED_TEXT_SELECTOR = 'text="Authentication Required"';
const LOGIN_BUTTON_SELECTOR = 'button:has-text("Login")';
const CREATE_NEW_ACCOUNT_BUTTON_SELECTOR = 'button:has-text("Create New Account")';
const PASSWORD_INPUT_SELECTOR = 'input[type="password"]';
const CREATE_ACCOUNT_QR_BUTTON_SELECTOR = 'button:has-text("Create Account & Get QR Key")';
const DONE_SAVED_KEY_BUTTON_SELECTOR = 'button:has-text("Done, I\'ve Saved My Key")';
const CONFIRM_LOGIN_BUTTON_SELECTOR = 'button:has-text("Confirm Login")';
const USERNAME_INPUT_SELECTOR = '#userName';
const SAVE_PROFILE_BUTTON_SELECTOR = 'button:has-text("Save Profile")';

export async function handleLoginIfNeeded(page: Page, pageAlias: string): Promise<void> {
  // Use a shorter timeout for the initial check to avoid long waits if login is not needed.
  const authRequiredLocator = page.locator(AUTH_REQUIRED_TEXT_SELECTOR);
  let authRequiredVisible = false;
  try {
    await authRequiredLocator.waitFor({ state: 'visible', timeout: 5000 });
    authRequiredVisible = true;
  } catch (error) {
    // Element not visible within timeout, which is fine.
    console.log(
      `Authentication not required for ${pageAlias} or "${AUTH_REQUIRED_TEXT_SELECTOR}" text not visible within 5s.`
    );
  }

  if (authRequiredVisible) {
    console.log(`Authentication required for ${pageAlias}. Proceeding with registration flow...`);

    await page.locator(LOGIN_BUTTON_SELECTOR).click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Login" button.`);

    await page.locator(CREATE_NEW_ACCOUNT_BUTTON_SELECTOR).click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Create New Account" button.`);

    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR);
    await passwordInput.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await passwordInput.fill('testpassword');
    console.log(`${pageAlias}: Filled password.`);

    await page.locator(CREATE_ACCOUNT_QR_BUTTON_SELECTOR).click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Create Account & Get QR Key" button.`);

    const doneSavedKeyButton = page.locator(DONE_SAVED_KEY_BUTTON_SELECTOR);
    await doneSavedKeyButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await doneSavedKeyButton.click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Done, I've Saved My Key" button.`);

    console.log(`${pageAlias}: Waiting for redirect (500 milli seconds)...`);
    await page.waitForTimeout(500); // As requested

    const confirmLoginButton = page.locator(CONFIRM_LOGIN_BUTTON_SELECTOR);
    await confirmLoginButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await confirmLoginButton.click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Confirm Login" button.`);

    const userNameInput = page.locator(USERNAME_INPUT_SELECTOR);
    await userNameInput.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    // Generate username like TestUserA from "Page A"
    const userNameSuffix = pageAlias.replace('Page ', '').replace(/\s+/g, ''); // Remove "Page " and any spaces
    const finalUserName = `TestUser${userNameSuffix}`;
    await userNameInput.fill(finalUserName);
    console.log(`${pageAlias}: Filled username: ${finalUserName}`);

    await page.locator(SAVE_PROFILE_BUTTON_SELECTOR).click({ timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Clicked "Save Profile" button.`);

    console.log(`${pageAlias}: Waiting for page to load after profile save...`);
    await page.waitForLoadState('networkidle', { timeout: PW_TIMEOUT });
    console.log(`${pageAlias}: Registration flow complete for ${finalUserName}.`);
  }
}
