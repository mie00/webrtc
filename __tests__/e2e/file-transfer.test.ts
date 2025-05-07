import { describe, test, beforeAll, afterAll, jest } from '@jest/globals';
import type { Page } from 'puppeteer';
// import fs from 'fs-extra'; // No longer needed directly here
// import path from 'path'; // No longer needed directly here
// import crypto from 'crypto'; // No longer needed directly here
// import { fileURLToPath } from 'url'; // No longer needed directly here

import {
    // FILE_INPUT_SELECTOR, // Handled by helper
    PUPPETEER_TIMEOUT,
    JEST_TIMEOUT,
    // calculateSHA256, // Handled by helper
    // CONTROL_PANEL_TOGGLE_SELECTOR // Handled by helper
} from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    setupTestFiles,
    teardownTestFiles,
    performFileTransferTest,
    preparedTestCases, // Use the populated array from the helper
    TestCaseData
} from './shared/fileTransferTestHelpers';
// ensurePanelOpen is implicitly used by performFileTransferTest via chatTestHelpers

// --- Test Configuration ---
// const __filename = fileURLToPath(import.meta.url); // Moved to helper
// const __dirname = dirname(__filename); // Moved to helper
// const TEST_FILES_DIR = path.join(__dirname, 'test-transfer-files'); // Moved to helper

// interface TestCase, TestCaseData, testCases, preparedTestCases are now in helper

// createTestFile, calculateFileSHA256 are now in helper


// --- Jest Test Suite ---
describe('WebRTC File Transfer E2E Test (Standard A to B)', () => {
    // Adjust timeout based on the number of file tests from the helper
    jest.setTimeout(JEST_TIMEOUT * (preparedTestCases.length > 3 ? 3 : 2));


    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
        await setupTestFiles(); // Prepare files using the helper
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
        await teardownTestFiles(); // Clean up files using the helper
    });

    // Use test.each to run the transfer logic for each prepared test case
    test.each(preparedTestCases)(
        'Page A should send file $fileName ($description) and Page B should receive it',
        async (testCase: TestCaseData) => {
            await performFileTransferTest(
                pageA,
                'Page A',
                [pageB], // Receiver is an array with one page
                ['Page B'], // Receiver name
                testCase
                // ensurePanelOpen is handled by performFileTransferTest
            );
        },
        PUPPETEER_TIMEOUT * 8 // Max timeout for each file transfer test
    ); // End of test.each
}); // End of describe
