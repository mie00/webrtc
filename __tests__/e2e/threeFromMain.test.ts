import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
import { threeClientSetup } from './setup/threeClientSetup';
import { threeClientTeardown } from './setup/threeClientTeardown';
import {
    JEST_TIMEOUT,
    PUPPETEER_TIMEOUT,
    CONTROL_PANEL_SELECTOR,
    CONTROL_PANEL_TOGGLE_SELECTOR,
    CHAT_INPUT_SELECTOR
    // CHAT_OUTPUT_CONTAINER_SELECTOR is used by verifyMessageReceived from shared
} from './setup/testHelpers'; // Import selectors
import { ensurePanelOpen, verifyMessageReceived } from './shared/chatTestHelpers';

describe('Three Client Chat E2E Test (A sends, B & C receive)', () => {
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;
    let pageC: Page;

    beforeAll(async () => {
        const setupResult = await threeClientSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        pageC = setupResult.pageC;
    });

    afterAll(async () => {
        await threeClientTeardown({ pageA, pageB, pageC });
    });

    // ensurePanelOpen and verifyMessageReceived are now imported from ../shared/chatTestHelpers

    test('Page A should send a message and Page B & C should receive it', async () => {
        const messageFromA = `Hello from Page A! (${Date.now()})`; // Unique message

        console.log(`\n--- Sending message from Page A ---`);
        console.log(`Message: "${messageFromA}"`);

        // 1. Ensure panel is open on Page A
        await ensurePanelOpen(pageA, 'Page A');

        // 2. Find chat input on Page A, type message, and press Enter
        console.log(`Typing message on Page A...`);
        const chatInputA = await pageA.waitForSelector(CHAT_INPUT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
        if (!chatInputA) {
            throw new Error(`Chat input (${CHAT_INPUT_SELECTOR}) not found on Page A`);
        }
        await chatInputA.type(messageFromA);
        await pageA.keyboard.press('Enter');
        console.log(`Message sent from Page A.`);

        // 3. Verify message received on Page B
        await verifyMessageReceived(pageB, 'Page B', messageFromA);

        // 4. Verify message received on Page C
        await verifyMessageReceived(pageC, 'Page C', messageFromA);

        console.log(`--- Message successfully verified on Page B and Page C ---`);
    });
});
