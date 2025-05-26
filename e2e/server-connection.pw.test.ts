import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { checkConnectionEstablished } from './setup/pwTestHelpers';
import { standardServerSetup } from './setup/pwStandardServerSetup';
import { standardTeardown } from './setup/pwStandardTeardown';

test.describe('WebRTC Peer Connection E2E Test (Playwright - Standard Client) @noci', () => {
  let pageA: Page;
  let pageB: Page;
  let contextA: BrowserContext;
  let contextB: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    const setupResult = await standardServerSetup(browser);
    pageA = setupResult.pageA;
    pageB = setupResult.pageB;
    contextA = setupResult.contextA;
    contextB = setupResult.contextB;
  });

  test.afterAll(async () => {
    await standardTeardown({ pageA, contextA, pageB, contextB });
  });

  test('should establish a WebRTC connection between two peers using client mode', async () => {
    console.log('--- Verifying connection established in Playwright standard client setup ---');

    // The setup already established the connection, just verify it here.
    await checkConnectionEstablished(pageA, 'Page A (verify)');
    await checkConnectionEstablished(pageB, 'Page B (verify)');

    console.log(
      '--- TEST SUCCESS: Connection verified post-setup (Playwright Standard Client) ---'
    );
  });
});
