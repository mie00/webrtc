import type { Page } from '@playwright/test';

// --- Configuration Constants ---
// Selectors remain the same as they are ID-based
export const INVITE_URL_SELECTOR = '#test-copy-button';
export const CALL_BUTTON_SELECTOR = '#test-join';
export const CONNECTION_INDICATOR_SELECTOR = '.test-indicator.test-indicator-connected';
export const FILE_INPUT_SELECTOR = '#test-file-upload';
export const CONTROL_PANEL_SELECTOR = '#test-control-panel';
export const CONTROL_PANEL_TOGGLE_SELECTOR = '#test-toggle-panel-button';
export const CHAT_INPUT_SELECTOR = '#test-chat-input';
export const CHAT_OUTPUT_CONTAINER_SELECTOR = '#test-chat-container';
export const ATTACH_FILE_BUTTON_SELECTOR = '#test-attach-file-button';
export const TOGGLE_AUDIO_BUTTON_SELECTOR = '#test-toggle-audio-button';
export const TOGGLE_VIDEO_BUTTON_SELECTOR = '#test-toggle-video-button';
export const SHARE_VIDEO_BUTTON_SELECTOR = '#test-share-video-button';
export const UPLOAD_VIDEO_INPUT_SELECTOR = 'input[type="file"][accept="video/*"]';

export const PW_TIMEOUT = 7000; // Playwright specific timeout

// --- Helper Function ---
export async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
    console.log(`Waiting for connection indicator in ${description}...`);
    await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { state: 'visible', timeout: PW_TIMEOUT });
    // For more idiomatic Playwright, you might use:
    // await expect(page.locator(CONNECTION_INDICATOR_SELECTOR)).toBeVisible({ timeout: PW_TIMEOUT });
    // However, waitForSelector is a closer match to the original and works fine.
    console.log(`Connection indicator found in ${description}.`);
}

// Note: calculateSHA256 from the original testHelpers.ts can be copied here if needed by other tests,
// but it's not used by the chat test. For now, it's omitted to keep focused on chat test needs.

// Note: The Puppeteer `closePage` helper handled specific storage clearing.
// Playwright's context.close() and page.close() handle resource cleanup.
// Specific storage clearing can be done via context.clearCookies() or page.evaluate().
// For this migration, we'll rely on context closure for general cleanup.

// --- Hashing Helper ---
// This is a direct port from the Puppeteer testHelpers.ts
import crypto from 'crypto';
export function calculateSHA256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}
