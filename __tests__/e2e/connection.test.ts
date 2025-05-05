import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { checkConnectionEstablished, JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers
import QrCode from 'qrcode-reader';
import Jimp from 'jimp';
import { promisify } from 'util'; // To promisify qrCode.decode

// --- Helper Function ---
// Promisify the callback-based decode method
const qr = new QrCode();
// Define the type for the callback result explicitly
interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[];
}
const decodeQrCode = promisify((bitmap: Jimp['bitmap'], cb: (err: Error | null, result: QrCodeResult | undefined) => void) => qr.decode(bitmap, cb));

async function takeScreenshotAndDecodeQR(page: Page): Promise<QrCodeResult | null> {
    console.log('Taking screenshot and attempting to decode QR code...');
    try {
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        const image = await Jimp.read(screenshotBuffer);
        const result = await decodeQrCode(image.bitmap);
        if (result) {
            console.log(`QR Code decoded: ${result.result}`);
            return { result: result.result, points: result.points };
        }
        console.log('QR Code not found or could not be decoded in the screenshot.');
        return null;
    } catch (error) {
        console.error('Error during screenshot or QR decoding:', error);
        return null;
    }
}


// --- Jest Test Suite ---
describe('WebRTC Peer Connection E2E Test (using global setup)', () => {
    // Apply timeout if needed, although much of the wait is now in globalSetup
    jest.setTimeout(JEST_TIMEOUT);

    let pageA: Page;
    let pageB: Page;

    // Optional: Add a beforeAll to get the pages, improving type safety within tests
    beforeAll(() => {
        // Retrieve pages created in globalSetup
        pageA = globalThis.__PAGE_A__!; // Use non-null assertion assuming setup succeeded
        pageB = globalThis.__PAGE_B__!;

        // Basic check that pages were passed correctly
        expect(pageA).toBeDefined();
        expect(pageB).toBeDefined();
        expect(pageA.url()).toContain('http'); // Basic check
        expect(pageB.url()).toContain('http'); // Basic check
    });

    test('should have established a WebRTC connection between two peers via globalSetup', async () => {
        console.log('--- Verifying connection established in global setup ---');

        // Re-run checks or add new ones specific to the connection state if needed.
        // This confirms the state persists from globalSetup.
        await expect(checkConnectionEstablished(pageA, 'Page A (verify)')).resolves.toBeUndefined();
        await expect(checkConnectionEstablished(pageB, 'Page B (verify)')).resolves.toBeUndefined();

        console.log('--- TEST SUCCESS: Connection verified post-globalSetup ---');
    });

    test('should stream video from Page A to Page B and verify QR code movement', async () => {
        console.log('--- Starting Video Stream and QR Code Verification Test ---');

        // 1. Enable video on Page A
        const videoButtonSelector = 'button.pointer-events-auto ::-p-text(📷)'; // Selector for the video button when OFF
        console.log('Waiting for video button on Page A...');
        await pageA.waitForSelector(videoButtonSelector, { timeout: 5000 });
        console.log('Clicking video button on Page A...');
        await pageA.click(videoButtonSelector);
        console.log('Video button clicked.');

        // 2. Wait for the remote video stream to appear on Page B
        //    Selector assumes remote video is the first one NOT muted.
        const remoteVideoSelector = 'div.stream-container video:not([muted])';
        console.log('Waiting for remote video element on Page B...');
        try {
            await pageB.waitForSelector(remoteVideoSelector, { visible: true, timeout: 15000 }); // Increased timeout for stream setup
            console.log('Remote video element found on Page B.');
             // Add a small delay to ensure video rendering has started
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error("Remote video element did not appear on Page B within timeout.");
            // Capture final state for debugging
            await pageB.screenshot({ path: 'debug_screenshot_pageB_no_video.png' });
            throw error; // Re-throw to fail the test
        }


        // 3. Take first screenshot and decode QR code
        console.log('Taking first screenshot on Page B...');
        const result1 = await takeScreenshotAndDecodeQR(pageB);
        expect(result1).withContext('First QR code decoding failed').not.toBeNull();
        expect(result1!.result).withContext('First QR code content mismatch').toBe('book');
        const minX1 = Math.min(...result1!.points.map(p => p.x));
        console.log(`First QR code decoded successfully. Min X: ${minX1}`);

        // 4. Wait for a moment to allow video to change
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // 5. Take second screenshot and decode QR code
        console.log('Taking second screenshot on Page B...');
        const result2 = await takeScreenshotAndDecodeQR(pageB);
        expect(result2).withContext('Second QR code decoding failed').not.toBeNull();
        expect(result2!.result).withContext('Second QR code content mismatch').toBe('book');
        const minX2 = Math.min(...result2!.points.map(p => p.x));
        console.log(`Second QR code decoded successfully. Min X: ${minX2}`);

        // 6. Assert that the QR code position changed (min X coordinate is different)
        expect(minX1).withContext('QR code position (min X) did not change between screenshots').not.toBe(minX2);
        console.log(`QR code position changed: ${minX1} -> ${minX2}`);

        console.log('--- TEST SUCCESS: Video stream and QR code movement verified ---');

        // Optional: Turn off video on Page A afterwards
        const videoButtonOnSelector = 'button.pointer-events-auto ::-p-text(🎥)'; // Selector for the video button when ON
        try {
            await pageA.click(videoButtonOnSelector);
            console.log('Video turned off on Page A.');
        } catch (e) {
            console.warn("Could not find 'ON' video button to turn off video, maybe it failed to turn on?");
        }
    });

    // Add more tests here that rely on the existing connection if needed

    // Optional: Add afterAll to ensure video is off if tests fail mid-way
    afterAll(async () => {
        // Attempt to turn off video on Page A if it's still on
        try {
            const videoButtonOnSelector = 'button.pointer-events-auto ::-p-text(🎥)';
            // Use evaluate to check if the element exists without throwing
            const isVideoOn = await pageA.evaluate((selector) => !!document.querySelector(selector), videoButtonOnSelector);
            if (isVideoOn) {
                console.log('Cleaning up: Turning off video on Page A in afterAll...');
                await pageA.click(videoButtonOnSelector);
            }
        } catch (error) {
            // Ignore errors during cleanup
            console.warn('Could not ensure video cleanup in afterAll:', error);
        }
    });
});
