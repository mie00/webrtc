import { test, expect, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { pwThreeClientSetup, ThreeClientSetupResult } from './setup/pwThreeClientSetup';
import { pwThreeClientTeardown } from './setup/pwThreeClientTeardown';
import { PW_TIMEOUT, CHAT_INPUT_SELECTOR } from './setup/pwTestHelpers';
import { verifyMessageReceived } from './shared/pwChatTestHelpers';
import { ensurePanelOpen, ensurePanelClosed } from './shared/pwPanelUtils';
import {
  setupTestFiles,
  teardownTestFiles,
  performFileTransferTest,
  preparedTestCases, // Assuming preparedTestCases is compatible or a Pw version exists
  type TestCaseData // Assuming TestCaseData is compatible
} from './shared/pwFileTransferTestHelpers'; // Or from a shared data file if pure data
import {
  setupMicTestMediaPw,
  teardownMicTestMediaPw,
  performMicTestPw,
  setupCameraTestMediaPw,
  teardownCameraTestMediaPw,
  performCameraTestPw,
  setupWatchTestMediaPw,
  teardownWatchTestMediaPw,
  performWatchTestPw,
  type PageInfoPw
} from './shared/pwMediaTestHelpers';

test.describe('Three Client E2E Tests with Playwright (Page A as primary sender) @noci', () => {
  test.setTimeout(PW_TIMEOUT * 20); // Increased timeout for multiple complex tests

  let pageA: PlaywrightPage, pageB: PlaywrightPage, pageC: PlaywrightPage;
  let contextA: BrowserContext, contextB: BrowserContext, contextC: BrowserContext;
  let senderInfoA: PageInfoPw;
  let receiversInfoForA: PageInfoPw[]; // B and C

  test.beforeAll(async ({ browser }) => {
    const setupResult: ThreeClientSetupResult = await pwThreeClientSetup(browser);
    pageA = setupResult.pageA;
    contextA = setupResult.contextA;
    pageB = setupResult.pageB;
    contextB = setupResult.contextB;
    pageC = setupResult.pageC;
    contextC = setupResult.contextC;

    senderInfoA = { page: pageA, name: 'Page A (Sender)' };
    receiversInfoForA = [
      { page: pageB, name: 'Page B (Receiver)' },
      { page: pageC, name: 'Page C (Receiver)' }
    ];

    await setupTestFiles(); // Moved to globalSetup
    // await setupMicTestMediaPw(); // Moved to globalSetup
    // await setupCameraTestMediaPw(); // Moved to globalSetup
    // await setupWatchTestMediaPw(); // Moved to globalSetup
  });

  test.afterAll(async () => {
    await pwThreeClientTeardown({ pageA, contextA, pageB, contextB, pageC, contextC });
    // await teardownTestFiles(); // Moved to globalTeardown
    // await teardownMicTestMediaPw(); // Moved to globalTeardown
    // await teardownCameraTestMediaPw(); // Moved to globalTeardown
    // await teardownWatchTestMediaPw(); // Moved to globalTeardown
  });

  test.describe('Chat Functionality (A sends, B & C receive)', () => {
    test('Page A should send a message and Page B & C should receive it', async () => {
      const messageFromA = `Hello from Page A (Playwright)! (${Date.now()})`;
      console.log(`\n--- Sending message from Page A: "${messageFromA}" ---`);
      await ensurePanelOpen(pageA, 'Page A');
      const chatInputA = pageA.locator(CHAT_INPUT_SELECTOR);
      await chatInputA.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
      await expect(chatInputA).toBeVisible();
      await chatInputA.fill(messageFromA);
      await pageA.keyboard.press('Enter');
      console.log(`Message sent from Page A.`);
      await verifyMessageReceived(pageB, 'Page B', messageFromA);
      await verifyMessageReceived(pageC, 'Page C', messageFromA);
      console.log(`--- Message successfully verified on Page B and Page C (Playwright) ---`);
    });
  });

  test.describe('File Transfer Functionality (A sends, B & C receive)', () => {
    // Assuming preparedTestCases and TestCaseData are compatible.
    // If not, use preparedTestCasesPw and TestCaseDataPw.
    for (const testCase of preparedTestCases) {
      test(`Page A should send file ${testCase.fileName} (${testCase.description}) and Page B & C should receive it ${testCase.tag || ''}`, async () => {
        await performFileTransferTest(
          pageA,
          'Page A',
          [pageB, pageC],
          ['Page B', 'Page C'],
          testCase as TestCaseData // Cast if types are slightly different but compatible
        );
      });
    }
  });

  test.describe('Microphone Functionality (A sends, B & C receive) @media', () => {
    test('Page A should stream audio and Page B & C should receive it', async () => {
      test.setTimeout(PW_TIMEOUT * 4); // Individual test timeout
      await ensurePanelClosed(pageA, 'Page A');
      await ensurePanelClosed(pageB, 'Page B');
      await ensurePanelClosed(pageC, 'Page C');
      await performMicTestPw(senderInfoA, receiversInfoForA);
      console.log('--- Mic test (A -> B,C) successful (Playwright) ---');
    });
  });

  test.describe('Camera Functionality (A sends, B & C receive) @media', () => {
    test('Page A should stream video and Page B & C should receive it and verify QR', async () => {
      test.setTimeout(PW_TIMEOUT * 6); // Individual test timeout
      await ensurePanelClosed(pageA, 'Page A');
      await ensurePanelClosed(pageB, 'Page B');
      await ensurePanelClosed(pageC, 'Page C');
      await performCameraTestPw(senderInfoA, receiversInfoForA);
      console.log('--- Camera test (A -> B,C) successful (Playwright) ---');
    });
  });

  test.describe('Watch Functionality (A shares, B & C receive) @media', () => {
    test.skip(
      ({ browserName }) => browserName === 'webkit',
      'Watch tests are skipped on WebKit browsers (Safari/iOS)'
    );
    test('Page A should share a video file and Page B & C should receive it', async () => {
      test.setTimeout(PW_TIMEOUT * 8); // Individual test timeout
      await ensurePanelClosed(pageA, 'Page A');
      await ensurePanelClosed(pageB, 'Page B');
      await ensurePanelClosed(pageC, 'Page C');
      await performWatchTestPw(senderInfoA, receiversInfoForA);
      console.log('--- Watch test (A -> B,C) successful (Playwright) ---');
    });
  });
});
