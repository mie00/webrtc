import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers
import QrCode from 'qrcode-reader';
import { Jimp } from 'jimp';
import {type Bitmap} from "@jimp/types";
import { promisify } from 'util'; // To promisify qrCode.decode
import { rejects } from 'assert';

// --- Helper Function ---
// Promisify the callback-based decode method
const qr = new QrCode();
// Define the type for the callback result explicitly
interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[];
}

// convert qr.decode to a promise, qr.callback = the callback and then qr.decode is callled with the image only, not the cb since it's already assigned to qr.callback
const decodeQrCode = async ( bitmap: Bitmap): Promise<QrCodeResult | null> => {
    return new Promise((resolve, reject) => {
        qr.callback = (err, value: QrCodeResult | null) => {
            if (err || !value) {
                rejects(err || "no value provided");
            } else {
                resolve(value)
            }
        };
        qr.decode(bitmap);
    });
}

async function takeScreenshotAndDecodeQR(page: Page): Promise<QrCodeResult | null> {
    console.log('Taking screenshot and attempting to decode QR code...');
    try {
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        console.log(' Screenshot taken, buffer size:', screenshotBuffer.length);
        // Save the screenshot for debugging if needed
        // fs.writeFileSync('./debug-screenshot.png', screenshotBuffer, { encoding: 'base64' });
        const image = await Jimp.read(screenshotBuffer);
        console.log(' Screenshot read into Jimp image.');
        const result = await decodeQrCode(image.bitmap);
        console .log(' QR code decoding attempt complete.');
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
describe('WebRTC Camera E2E Test', () => {
    // Apply timeout if needed
    jest.setTimeout(JEST_TIMEOUT * 2); // Give more time for video processing

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

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // 3. Take first screenshot and decode QR code
        console.log('Taking first screenshot on Page B...');
        const result1 = await takeScreenshotAndDecodeQR(pageB);
        expect(result1 /* First QR code decoding failed */).not.toBeNull();
        expect(result1!.result /* First QR code content mismatch */).toBe('book');
        const minX1 = Math.min(...result1!.points.map(p => p.x));
        console.log(`First QR code decoded successfully. Min X: ${minX1}`);

        // 4. Wait for a moment to allow video to change
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // 5. Take second screenshot and decode QR code
        console.log('Taking second screenshot on Page B...');
        const result2 = await takeScreenshotAndDecodeQR(pageB);
        expect(result2 /* Second QR code decoding failed */).not.toBeNull();
        expect(result2!.result /* Second QR code content mismatch */).toBe('book');
        const minX2 = Math.min(...result2!.points.map(p => p.x));
        console.log(`Second QR code decoded successfully. Min X: ${minX2}`);

        // 6. Assert that the QR code position changed (min X coordinate is different)
        expect(minX1 /* QR code position (min X) did not change between screenshots */).not.toBe(minX2);
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
});
