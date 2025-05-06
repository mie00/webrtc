import type { Page } from 'puppeteer';
import { closePage } from './testHelpers'; // Import the helper

interface TeardownArgs {
    pageA?: Page; // Make pages optional in case setup failed partially
    pageB?: Page;
}

// No longer default export, accepts pages as arguments
export async function standardTeardown({ pageA, pageB }: TeardownArgs): Promise<void> {
    // Keep debug wait if necessary
    if (process.env.DEBUG_WAIT) {
        console.log('DEBUG_WAIT is set, keeping pages open until timeout...');
        // Note: Teardown will close pages eventually. This wait might be less useful now.
        // Consider waiting for a specific condition or removing if teardown handles closure.
        // get how much seconds to wait from DEBUG_WAIT and failback to 1h
        const debugWaitSeconds = parseInt(process.env.DEBUG_WAIT) || 3600;
        await new Promise(resolve => setTimeout(resolve, debugWaitSeconds * 1000)); // Long wait for manual inspection
    }
    console.log('\n--- Standard E2E Teardown (Pages) ---');

    // --- 1. Close Pages (passed as arguments) ---
    console.log('Closing pages specific to this test suite using helper...');
    await Promise.all([
        closePage(pageA, 'Page A'),
        closePage(pageB, 'Page B')
    ]);

    // No need to clear globals as they weren't set by standardSetup

    // --- Server teardown is handled by globalTeardown.ts ---

    // Note: Browser closing is handled by jest-puppeteer's environment teardown
    console.log('--- Standard E2E Teardown Complete ---');
}
