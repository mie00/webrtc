import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { checkConnectionEstablished, JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers


// --- Jest Test Suite ---
describe('WebRTC Peer Connection E2E Test (using global setup)', () => {
    // Apply timeout if needed, although much of the wait is now in globalSetup
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;

    // Optional: Add a beforeAll to get the pages, improving type safety within tests
    beforeAll(() => {
        // Retrieve pages created in globalSetup
        pageA = globalThis.__PAGE_A__!; // Use non-null assertion assuming setup succeeded
        pageB = globalThis.__PAGE_B__!;

        // Basic check that pages were passed correctly
        expect(pageA).toBeDefined();
        expect(pageB).toBeDefined();
        expect(pageA.url()).toContain('http'); // Basic check
        expect(pageB.url()).toContain('http'); // Basic check
    });

    test('should have established a WebRTC connection between two peers via globalSetup', async () => {
        console.log('--- Verifying connection established in global setup ---');

        // Re-run checks or add new ones specific to the connection state if needed.
        // This confirms the state persists from globalSetup.
        await expect(checkConnectionEstablished(pageA, 'Page A (verify)')).resolves.toBeUndefined();
        await expect(checkConnectionEstablished(pageB, 'Page B (verify)')).resolves.toBeUndefined();

        console.log('--- TEST SUCCESS: Connection verified post-globalSetup ---');
    });

    // Add more tests here that rely on the existing connection if needed
});
