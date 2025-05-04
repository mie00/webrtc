import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type { Config } from '@jest/types';
import { SERVER_STARTUP_TIMEOUT } from './testHelpers'; // Assuming this constant is defined here or imported
import puppeteerGlobalSetup from 'jest-environment-puppeteer/setup'
// Use globalThis for broader compatibility

export default async function globalSetup(globalConfig: Config.GlobalConfig, projectConfig: Config.ProjectConfig): Promise<void> {
    await puppeteerGlobalSetup(globalConfig);
    console.log('\n--- Global E2E Setup ---');

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
        throw new Error("Server did not start correctly or PID/URL is missing.");
    }

    console.log(`Server started globally. URL: ${globalThis.__SERVER_URL__}, PID: ${globalThis.__SERVER_PID__}`);
    console.log('--- Global E2E Setup Complete ---');
}
