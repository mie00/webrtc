import type { Page } from 'puppeteer';
import os from 'os';
import { execSync } from 'child_process'; // For potential forceful kill

export default async function globalTeardown() {
    console.log('\n--- Global E2E Teardown ---');

    // --- 1. Close Pages ---
    // Retrieve pages from global scope
    const pageA = globalThis.__PAGE_A__ as Page | undefined;
    const pageB = globalThis.__PAGE_B__ as Page | undefined;

    console.log('Closing pages...');
    try {
        if (pageA && !pageA.isClosed()) await pageA.close();
        if (pageB && !pageB.isClosed()) await pageB.close();
        console.log('Pages closed.');
    } catch (error) {
        console.warn('Warning: Error closing pages during teardown:', error);
    }

    // Clear globals (optional, good practice)
    globalThis.__PAGE_A__ = undefined;
    globalThis.__PAGE_B__ = undefined;

    // --- 2. Kill Server ---
    const serverPid = globalThis.__SERVER_PID__ as number | undefined;
    if (serverPid) {
        console.log(`Attempting to kill server process (PID: ${serverPid})...`);
        try {
            // process.kill is the preferred way for portability
            process.kill(serverPid, 'SIGTERM');
            console.log(`Sent SIGTERM to server process ${serverPid}.`);

            // Optional: Add a small delay and check if the process is still alive, then SIGKILL
            // This adds complexity but can handle stubborn processes.
            // await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 sec
            // try {
            //     process.kill(serverPid, 0); // Check if process exists
            //     console.warn(`Server process ${serverPid} still alive after SIGTERM, sending SIGKILL.`);
            //     process.kill(serverPid, 'SIGKILL');
            // } catch (e) {
            //     // Expected error if process is gone
            //     if (e.code === 'ESRCH') {
            //         console.log(`Server process ${serverPid} terminated successfully.`);
            //     } else {
            //         throw e; // Re-throw unexpected errors
            //     }
            // }

        } catch (error) {
            console.error(`Error killing server process ${serverPid}:`, error);
            // Fallback for stubborn processes, especially on Windows
            if (os.platform() === 'win32') {
                console.log(`Attempting taskkill on Windows for PID ${serverPid}...`);
                try {
                    execSync(`taskkill /PID ${serverPid} /F /T`); // /F = force, /T = kill child processes
                    console.log(`taskkill command executed for PID ${serverPid}.`);
                } catch (killError) {
                    console.error(`taskkill failed for PID ${serverPid}:`, killError);
                }
            }
        }
    } else {
        console.warn('Server PID not found in global scope for teardown.');
    }

     globalThis.__SERVER_PID__ = undefined;
     globalThis.__SERVER_URL__ = undefined;

    // Note: Browser closing is handled by jest-puppeteer's own teardown
    console.log('--- Global E2E Teardown Complete ---');
}
