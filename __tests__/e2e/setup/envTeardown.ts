import type { Page } from 'puppeteer';
// Removed os and execSync as server is stopped globally

export default async function envTeardown() {
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
