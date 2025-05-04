import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { Browser, Page } from 'puppeteer';
import path from 'path';
import {
    INVITE_URL_SELECTOR,
    CALL_BUTTON_SELECTOR,
    CONNECTION_INDICATOR_SELECTOR,
    PUPPETEER_TIMEOUT,
    SERVER_STARTUP_TIMEOUT,
    checkConnectionEstablished // Assuming checkConnectionEstablished is moved or copied here
} from './testHelpers'; // Add .js extension for Node ESM resolution
// Helper function (can be moved to testHelpers.ts) - Copied from connection.test.ts
// Ensure this function is available here or imported
// async function checkConnectionEstablished(page: Page, description: string): Promise<void> {
//     console.log(`Waiting for connection indicator in ${description}...`);
//     await page.waitForSelector(CONNECTION_INDICATOR_SELECTOR, { visible: false, timeout: PUPPETEER_TIMEOUT });
//     console.log(`Connection indicator found in ${description}.`);
// }


export default async function globalSetup() {
    console.log('\n--- Global E2E Setup ---');

    // --- 1. Start Server ---
    console.log('Starting development server...');
    const serverInfo = await new Promise<{ process: ChildProcessWithoutNullStreams; url: string; }>((resolve, reject) => {
        // Track if resolved to prevent race condition on exit
        let resolved = false;
        const serverProcess = spawn('npm', ['run', 'dev'], { shell: true, detached: false });
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
        });
    });

    if (!serverInfo || !serverInfo.url || !serverInfo.process?.pid) {
        throw new Error("Server did not start correctly or PID is missing.");
    }

    console.log("MMM", this.global)
    this.global.__SERVER_URL__ = serverInfo.url;
    this.global.__SERVER_PID__ = serverInfo.process.pid; // Store PID for teardown

    // --- 2. Setup Browser Pages ---
    // this.global.__BROWSER__ = (this.global.__jestPptr.browsers[0])
    this.global.__BROWSER__ = this.global.browser;
    const browser = this.global.__BROWSER__; // Provided by jest-puppeteer preset
     if (!browser) {
        throw new Error("Puppeteer browser instance (__BROWSER__) not found in global scope. Ensure jest-puppeteer is configured.");
    }

    console.log('Opening Page A...');
    const pageA = await browser.newPage();
    console.log(`Page A navigating to: ${serverInfo.url}`);
    await pageA.goto(serverInfo.url, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page A navigation complete.');

    console.log('Waiting for invite URL element on Page A...');
    await pageA.waitForSelector(INVITE_URL_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Invite URL element found. Evaluating window location...');
    const inviteUrl = await pageA.evaluate(() => window.location.toString());
    if (!inviteUrl || (!inviteUrl.startsWith('http://') && !inviteUrl.startsWith('https://'))) {
        throw new Error(`Failed to get a valid invite URL from Page A: ${inviteUrl}`);
    }
    console.log(`Invite URL from Page A: ${inviteUrl}`);

    console.log('Opening Page B...');
    const pageB = await browser.newPage();
    console.log('Page B navigating to invite URL...');
    await pageB.goto(inviteUrl, { waitUntil: 'networkidle0', timeout: PUPPETEER_TIMEOUT });
    console.log('Page B navigation complete.');

    // --- 3. Establish Connection ---
    console.log('Waiting for call button in Page B...');
    await pageB.waitForSelector(CALL_BUTTON_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT });
    console.log('Call button found. Clicking...');
    await pageB.click(CALL_BUTTON_SELECTOR);
    console.log('Call button clicked.');

    console.log('Waiting for connection establishment in both pages...');
    await Promise.all([
        checkConnectionEstablished(pageA, 'Page A'),
        checkConnectionEstablished(pageB, 'Page B')
    ]);
    console.log('--- Initial connection established ---');

    // Store pages globally *after* connection is established
    // Note: Storing non-serializable objects like Page instances globally can be tricky.
    // jest-puppeteer handles the browser instance. For pages, it might be better
    // to re-fetch them in tests if needed, but let's try storing them first.
    // A common pattern is to store IDs or minimal info if full objects cause issues.
    this.global.__PAGE_A__ = pageA;
    this.global.__PAGE_B__ = pageB;

    console.log('--- Global E2E Setup Complete ---');
}
