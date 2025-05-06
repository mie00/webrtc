// Similar to standardTeardown, but for three clients (A, B, C)
import type { Page } from 'puppeteer';

interface TeardownArgs {
    pageA?: Page;
    pageB?: Page;
    pageC?: Page; // Added pageC
}

export async function threeClientTeardown({ pageA, pageB, pageC }: TeardownArgs): Promise<void> {
    // Keep debug wait if necessary (same logic as standardTeardown)
    if (process.env.DEBUG_WAIT) {
        console.log('DEBUG_WAIT is set, keeping pages open until timeout...');
        const debugWaitSeconds = parseInt(process.env.DEBUG_WAIT) || 3600;
        await new Promise(resolve => setTimeout(resolve, debugWaitSeconds * 1000));
    }
    console.log('\n--- Three Client E2E Teardown (Pages) ---');

    // --- Close Pages ---
    console.log('Closing pages specific to this three-client test suite...');
    const closePage = async (page: Page | undefined, name: string) => {
        if (page && !page.isClosed()) {
            try {
                // Clear storage before closing
                await page.evaluate(() => {
                    window.localStorage.clear();
                    // Attempt to delete IndexedDB, handle potential errors gracefully
                    try {
                        indexedDB.deleteDatabase('firebaseLocalStorageDb');
                    } catch (dbError) {
                        console.warn(`Warning: Could not delete IndexedDB for ${name}:`, dbError);
                    }
                });
                await page.close();
                console.log(`${name} closed.`);
            } catch (error) {
                console.warn(`Warning: Error closing ${name} during teardown:`, error);
            }
        } else if (page) {
            console.log(`${name} was already closed.`);
        }
    };

    // Close pages concurrently
    await Promise.all([
        closePage(pageA, 'Page A'),
        closePage(pageB, 'Page B'),
        closePage(pageC, 'Page C') // Add closing logic for Page C
    ]);

    // Server teardown is handled by globalTeardown.ts
    // Browser closing is handled by jest-puppeteer's environment teardown

    console.log('--- Three Client E2E Teardown Complete ---');
}
