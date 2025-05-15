import type { Page, BrowserContext } from '@playwright/test';

export interface StandardTeardownArgs {
    pageA?: Page;
    contextA?: BrowserContext;
    pageB?: Page;
    contextB?: BrowserContext;
}

export async function standardTeardown({ pageA, contextA, pageB, contextB }: StandardTeardownArgs): Promise<void> {
    console.log('\n--- Playwright Standard E2E Teardown ---');

    // Playwright's debug mode is usually controlled via `PWDEBUG=1` env var or `page.pause()`
    // The DEBUG_WAIT logic from Puppeteer is less common here.

    if (pageA && !pageA.isClosed()) {
        try {
            await pageA.close();
            console.log('Page A closed.');
        } catch (error) {
            console.warn('Warning: Error closing Page A during teardown:', error);
        }
    }
    if (contextA) {
        try {
            await contextA.close();
            console.log('Context A closed.');
        } catch (error) {
            console.warn('Warning: Error closing Context A during teardown:', error);
        }
    }

    if (pageB && !pageB.isClosed()) {
        try {
            await pageB.close();
            console.log('Page B closed.');
        } catch (error) {
            console.warn('Warning: Error closing Page B during teardown:', error);
        }
    }
    if (contextB) {
        try {
            await contextB.close();
            console.log('Context B closed.');
        } catch (error) {
            console.warn('Warning: Error closing Context B during teardown:', error);
        }
    }
    console.log('--- Playwright Standard E2E Teardown Complete ---');
}
