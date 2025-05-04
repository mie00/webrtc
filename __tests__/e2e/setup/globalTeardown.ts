import os from 'os';
import { execSync } from 'child_process';
import type { Config } from '@jest/types';
import puppeteerGlobalTeardown from 'jest-environment-puppeteer/teardown'



export default async function globalTeardown(globalConfig: Config.GlobalConfig, projectConfig: Config.ProjectConfig): Promise<void> {
    console.log('\n--- Global E2E Teardown ---');

    // --- Kill Server ---
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
            if (os.platform() === 'win32') {
                console.log(`Attempting taskkill on Windows for PID ${serverPid}...`);
                try {
                    // /T kills child processes, /F forces termination
                    execSync(`taskkill /PID ${serverPid} /F /T`);
                    console.log(`taskkill command executed for PID ${serverPid}.`);
                } catch (killError) {
                    console.error(`taskkill failed for PID ${serverPid}:`, killError);
                }
            } else {
                 // On Unix-like systems, SIGKILL might be needed if SIGTERM failed
                 try {
                     console.log(`Attempting SIGKILL for PID ${serverPid}...`);
                     process.kill(serverPid, 'SIGKILL');
                 } catch (killError) {
                     console.error(`SIGKILL failed for PID ${serverPid}:`, killError);
                 }
            }
        }
    } else {
        console.warn('Server PID not found in global scope for teardown.');
    }

    // Clear globals
    globalThis.__SERVER_PID__ = undefined;
    globalThis.__SERVER_URL__ = undefined;

    // Note: Browser closing is handled by jest-puppeteer's own teardown
    console.log('--- Global E2E Teardown Complete ---');
    await puppeteerGlobalTeardown(globalConfig);
}
