import type { Page } from 'puppeteer';
// Removed os and execSync as server is stopped globally

export default async function envTeardown() {
    // Keep debug wait if necessary
    if (process.env.DEBUG_WAIT) {
        console.log('DEBUG_WAIT is set, keeping browser open until pageB is closed (or timeout)...');
        // Note: Teardown will close pages eventually. This wait might be less useful now.
        // Consider waiting for a specific condition or removing if teardown handles closure.
        // get how much seconds to wait from DEBUG_WAIT and failback to 1h
        const debugWaitSeconds = parseInt(process.env.DEBUG_WAIT) || 3600;
        await new Promise(resolve => setTimeout(resolve, debugWaitSeconds * 1000)); // Long wait for manual inspection
    }
    // 'this' refers to the Jest environment instance
    console.log('\n--- Environment E2E Teardown (Pages) ---');

    // --- 1. Close Pages ---
    // Retrieve pages from the environment's global scope
    const pageA = this.global.__PAGE_A__ as Page | undefined;
    const pageB = this.global.__PAGE_B__ as Page | undefined;

    console.log('Closing pages specific to this environment...');
    try {
        // Check if page exists and is not already closed before attempting to close
        if (pageA && !pageA.isClosed()) {
            await pageA.close();
            console.log('Page A closed.');
        } else if (pageA) {
             console.log('Page A was already closed.');
        }
        if (pageB && !pageB.isClosed()) {
            await pageB.close();
            console.log('Page B closed.');
         } else if (pageB) {
             console.log('Page B was already closed.');
         }
    } catch (error) {
        // Log specifically which page failed if possible
        console.warn('Warning: Error closing pages during environment teardown:', error);
    }

    // Clear environment-specific globals
    this.global.__PAGE_A__ = undefined;
    this.global.__PAGE_B__ = undefined;

    // --- Server teardown is handled by globalTeardown.ts ---

    // Note: Browser closing is handled by jest-puppeteer's environment teardown (super.teardown())
    console.log('--- Environment E2E Teardown Complete ---');
}
