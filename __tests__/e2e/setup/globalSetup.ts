import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { Config } from '@jest/types';
import puppeteer, { type Browser } from 'puppeteer'; // Import puppeteer
import { SERVER_STARTUP_TIMEOUT } from './testHelpers'; // Assuming this constant is defined here or imported
import puppeteerGlobalSetup from 'jest-environment-puppeteer/setup'
import myConfig from '../../../jest-puppeteer.config.cjs'

// Use globalThis for broader compatibility
declare global {
    // Set by puppeteerGlobalSetup
    var wsEndpoint: string | null | undefined;
    // Set by this setup
    var __SERVER_URL__: string | undefined;
    var __SERVER_PID__: number | undefined;
    var __BROWSER_A__: Browser | undefined;
    var __BROWSER_B__: Browser | undefined;
    var __BROWSER_C__: Browser | undefined;
}


export default async function globalSetup(globalConfig: Config.GlobalConfig, projectConfig: Config.ProjectConfig): Promise<void> {
    // Run the standard puppeteer setup for the first browser (browserA)
    await puppeteerGlobalSetup(myConfig);
    console.log('\n--- Global E2E Setup ---');
    console.log('Browser A (default) setup complete via jest-environment-puppeteer.');

    globalThis.__BROWSER_A__ =  globalThis.__jestPptr.browsers[0];
    globalThis.__BROWSER_B__ =  globalThis.__jestPptr.browsers[1];
    globalThis.__BROWSER_C__ =  globalThis.__jestPptr.browsers[2];

    // --- Start Server ---
    console.log('Starting development server...');
    const serverInfo = await new Promise<{ process: ChildProcessWithoutNullStreams; url: string; }>((resolve, reject) => {
        // Track if resolved to prevent race condition on exit
        let resolved = false;
        const serverProcess = spawn('npm', ['run', 'dev'], { shell: true, detached: false }); // detached: false is often better for cleanup
        let output = '';
        const urlRegex = /(?:Local|Network):\s+(http:\/\/\S+|https:\/\/\S+)/;

        const timer = setTimeout(() => {
            if (resolved) return;
            console.error('Server startup timed out.');
            try { serverProcess.kill('SIGTERM'); } catch (e) { console.warn("Failed to kill timed-out server", e); }
            reject(new Error(`Server startup timed out after ${SERVER_STARTUP_TIMEOUT}ms`));
        }, SERVER_STARTUP_TIMEOUT);

        serverProcess.stdout.on('data', (data) => {
            if (resolved) return;
            const dataStr = data.toString();
            console.log(`Server stdout: ${dataStr.trim()}`);
            output += dataStr;
            const match = output.match(urlRegex);
            if (match && match[1]) {
                const urls = output.match(new RegExp(urlRegex, 'g'));
                const localUrl = urls?.find(u => u.includes('localhost') || u.includes('127.0.0.1'));
                const serverUrl = localUrl ? localUrl.match(urlRegex)?.[1] : match[1];
                console.log(`Development server started at: ${serverUrl}`);
                clearTimeout(timer);
                resolved = true;
                // Store server info globally *before* resolving
                globalThis.__SERVER_URL__ = serverUrl || '';
                globalThis.__SERVER_PID__ = serverProcess.pid!; // Assert PID exists
                resolve({ process: serverProcess, url: serverUrl || '' });
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server stderr: ${data.toString().trim()}`);
        });

        serverProcess.on('error', (err) => {
            if (resolved) return;
            console.error('Failed to start server process:', err);
            clearTimeout(timer);
            reject(err);
        });

        serverProcess.on('exit', (code, signal) => {
            // If it exits before resolving, it's an error
            if (!resolved) {
                 console.error(`Server process exited prematurely with code ${code}, signal ${signal}`);
                 clearTimeout(timer);
                 reject(new Error(`Server process exited prematurely (code ${code}, signal ${signal}) before URL was found.`));
            }
            // If it exits *after* resolving, it might be okay or a background process finished
            // We don't reject here as the server might have handed off
        });
    });

    if (!globalThis.__SERVER_URL__ || !globalThis.__SERVER_PID__) {
        // If server fails, close Browser B as well
        if (globalThis.__BROWSER_B__) {
            await globalThis.__BROWSER_B__.close();
        }
        throw new Error("Server did not start correctly or PID/URL is missing.");
    }

    console.log(`Server started globally. URL: ${globalThis.__SERVER_URL__}, PID: ${globalThis.__SERVER_PID__}`);
    console.log('--- Global E2E Setup Complete ---');
}
