import { test, Page, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown, StandardTeardownArgs } from './setup/pwStandardTeardown';
import {
  setupTestFiles,
  teardownTestFiles,
  performFileTransferTest,
  preparedTestCases,
  type TestCaseData
} from './shared/pwFileTransferTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC File Transfer E2E Test with Playwright (Standard A to B)', () => {
  let pageA: Page;
  let contextA: BrowserContext;
  let pageB: Page;
  let contextB: BrowserContext;

  // Set a longer timeout for the entire suite if needed, or per test.
  // Playwright's default test timeout is 30 seconds.
  // Individual file transfers might take longer.
  // test.slow() can triple the default timeout.
  // Or use test.setTimeout(milliseconds)
  const perTestTimeout = PW_TIMEOUT * 8 * (preparedTestCases.length > 3 ? 3 : 2); // Base timeout for each test
  test.setTimeout(perTestTimeout * preparedTestCases.length + 60000); // Overall suite timeout

  test.beforeAll(async ({ browser }) => {
    const setupResult: StandardSetupResult = await standardSetup(browser);
    pageA = setupResult.pageA;
    contextA = setupResult.contextA;
    pageB = setupResult.pageB;
    contextB = setupResult.contextB;
    await setupTestFiles();
  });

  test.afterAll(async () => {
    await standardTeardown({ pageA, contextA, pageB, contextB });
    // await teardownTestFiles();
  });

  // Loop through preparedTestCases to create a test for each
  for (const testCase of preparedTestCases) {
    test(`Page A should send file ${testCase.fileName} (${testCase.description}) and Page B should receive it ${testCase.tag || ''}`, async () => {
      // Individual test timeout, can be adjusted based on testCase.timeoutMultiplier
      test.setTimeout(PW_TIMEOUT * 8 * testCase.timeoutMultiplier);
      await performFileTransferTest(pageA, 'Page A', [pageB], ['Page B'], testCase);
    });
  }
});
