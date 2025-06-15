import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { checkConnectionEstablished } from './setup/pwTestHelpers';
import { standardSetup } from './setup/pwStandardSetup';
import { standardTeardown } from './setup/pwStandardTeardown';

const delays = [
  { id: '5s', duration: 5000, tag: '' },
  { id: '10s', duration: 10000, tag: '' },
  { id: '20s', duration: 20000, tag: '@slow' },
  { id: '40s', duration: 40000, tag: '@slow' },
  { id: '80s', duration: 80000, tag: '@slow' },
  { id: '120s', duration: 120000, tag: '@slow' } // 2 minutes
];

test.describe('WebRTC Peer Connection with Delays E2E Test', () => {
  delays.forEach((delayConfig) => {
    let pageA: Page;
    let pageB: Page;
    let contextA: BrowserContext;
    let contextB: BrowserContext;

    test.afterEach(async () => {
      // Ensure teardown happens even if the test fails mid-setup
      if (pageA && contextA && pageB && contextB) {
        await standardTeardown({ pageA, contextA, pageB, contextB });
      } else if (contextA) {
        await contextA.close();
      } else if (contextB) {
        await contextB.close();
      }
      // Reset for next test
      // @ts-expect-error pageA is used in afterEach
      pageA = undefined;
      // @ts-expect-error pageB is used in afterEach
      pageB = undefined;
      // @ts-expect-error contextA is used in afterEach
      contextA = undefined;
      // @ts-expect-error contextB is used in afterEach
      contextB = undefined;
    });

    const testTitle =
      `should establish connection with ${delayConfig.id} delay (A->B nav and B->A paste) ${delayConfig.tag}`.trim();

    test(testTitle, async ({ browser }) => {
      // Set a dynamic timeout for this specific test
      // Timeout = (delay1 + delay2) + 60s buffer
      const testTimeout = delayConfig.duration * 2 + 60000;
      test.setTimeout(testTimeout);

      const setupResult = await standardSetup(browser, {
        delayAfterPageAOpenMs: delayConfig.duration,
        delayBeforePastingResponseMs: delayConfig.duration
      });
      // Assign to higher-scoped variables for teardown
      pageA = setupResult.pageA;
      pageB = setupResult.pageB;
      contextA = setupResult.contextA;
      contextB = setupResult.contextB;

      console.log(
        `--- Verifying connection established with ${delayConfig.id} delays (Playwright) ---`
      );

      // The setup already established the connection, just verify it here.
      await checkConnectionEstablished(pageA, `Page A (verify, ${delayConfig.id} delay)`);
      await checkConnectionEstablished(pageB, `Page B (verify, ${delayConfig.id} delay)`);

      console.log(
        `--- TEST SUCCESS: Connection verified with ${delayConfig.id} delays (Playwright) ---`
      );
    });
  });
});
