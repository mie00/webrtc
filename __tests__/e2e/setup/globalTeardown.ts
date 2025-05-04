// Removed os and execSync imports as they are only used in the fallback kill logic
import type { Config } from '@jest/types';
import type { Browser } from 'puppeteer'; // Import Browser type
import puppeteerGlobalTeardown from 'jest-environment-puppeteer/teardown'

// Extend global declaration if needed (matching globalSetup)
declare global {
    var __SERVER_URL__: string | undefined;
    var __SERVER_PID__: number | undefined;
    var __BROWSER_B__: Browser | undefined; // Second browser instance
}


export default async function globalTeardown(globalConfig: Config.GlobalConfig, projectConfig: Config.ProjectConfig): Promise<void> {
    console.log('\n--- Global E2E Teardown ---');

    // --- Close Second Browser (Browser B) ---
    const browserB = globalThis.__BROWSER_B__;
    if (browserB) {
        console.log('Closing Browser B...');
        try {
            await browserB.close();
            console.log('Browser B closed successfully.');
        } catch (error) {
            console.error('Error closing Browser B:', error);
        }
        globalThis.__BROWSER_B__ = undefined; // Clear global reference
    } else {
        console.log('Browser B instance not found in global scope for teardown.');
    }


    // --- Kill Server ---
    // Note: Server killing logic remains the same
    const serverPid = globalThis.__SERVER_PID__;
    if (serverPid) {
        console.log(`Attempting to kill server process (PID: ${serverPid})...`);
        try {
            // process.kill is the preferred way for portability
            // Use 'SIGKILL' for detached processes or if SIGTERM is ignored
            // For non-detached, SIGTERM is gentler first. Adjust if needed.
            process.kill(serverPid, 'SIGTERM');
            console.log(`Sent SIGTERM to server process ${serverPid}.`);

            // Optional: Add a small delay and check/force kill (useful for stubborn processes)
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 sec
            try {
                process.kill(serverPid, 0); // Check if process exists (throws if not)
                console.warn(`Server process ${serverPid} still alive after SIGTERM, sending SIGKILL.`);
                process.kill(serverPid, 'SIGKILL'); // Force kill
            } catch (e: any) {
                // Expected error if process is gone
                if (e.code === 'ESRCH') {
                    console.log(`Server process ${serverPid} terminated successfully.`);
                } else {
                    console.warn(`Error checking/killing server process ${serverPid} after SIGTERM:`, e); // Log other errors
                }
            }

        } catch (error: any) {
             // Initial kill failed
            console.error(`Error sending SIGTERM to server process ${serverPid}:`, error);
             // Fallback for stubborn processes, especially on Windows
            // On Unix-like systems, SIGKILL might be needed if SIGTERM failed
            try {
                console.log(`Attempting SIGKILL for PID ${serverPid}...`);
                process.kill(serverPid, 'SIGKILL');
            } catch (killError) {
                console.error(`SIGKILL failed for PID ${serverPid}:`, killError);
            }
            
        }
    } else {
        console.warn('Server PID not found in global scope for teardown.');
    }

    // Clear globals
    globalThis.__SERVER_PID__ = undefined;
    globalThis.__SERVER_URL__ = undefined;
    // globalThis.__BROWSER_B__ is cleared above

    // Call the standard puppeteer teardown to close Browser A (default)
    console.log('Running standard puppeteer teardown for Browser A...');
    await puppeteerGlobalTeardown(globalConfig);
    console.log('--- Global E2E Teardown Complete ---');
}
