import type { Page, BrowserContext } from '@playwright/test';

export interface ThreeClientTeardownArgs {
  pageA?: Page;
  contextA?: BrowserContext;
  pageB?: Page;
  contextB?: BrowserContext;
  pageC?: Page;
  contextC?: BrowserContext;
}

export async function pwThreeClientTeardown({
  pageA,
  contextA,
  pageB,
  contextB,
  pageC,
  contextC
}: ThreeClientTeardownArgs): Promise<void> {
  console.log('\n--- Playwright Three Client E2E Teardown ---');

  const closePageAndContext = async (p?: Page, ctx?: BrowserContext, name?: string) => {
    if (p && !p.isClosed()) {
      try {
        await p.close();
        console.log(`${name} page closed.`);
      } catch (error) {
        console.warn(`Warning: Error closing ${name} page during teardown:`, error);
      }
    }
    if (ctx) {
      try {
        await ctx.close();
        console.log(`${name} context closed.`);
      } catch (error) {
        console.warn(`Warning: Error closing ${name} context during teardown:`, error);
      }
    }
  };

  await Promise.all([
    closePageAndContext(pageA, contextA, 'Page A'),
    closePageAndContext(pageB, contextB, 'Page B'),
    closePageAndContext(pageC, contextC, 'Page C')
  ]);

  console.log('--- Playwright Three Client E2E Teardown Complete ---');
}
