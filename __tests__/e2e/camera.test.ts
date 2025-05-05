import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers
import QrCode from 'qrcode-reader';
import { Jimp } from 'jimp';
import { type Bitmap } from "@jimp/types";
import { promisify } from 'util'; // To promisify qrCode.decode
import { rejects } from 'assert';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// --- Helper Function ---
// Promisify the callback-based decode method
const qr = new QrCode();
// Define the type for the callback result explicitly
interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[];
}

// convert qr.decode to a promise with a timeout
const decodeQrCode = async (bitmap: Bitmap, timeoutMs: number = 1000): Promise<QrCodeResult | null> => {
    const decodePromise = new Promise<QrCodeResult | null>((resolve, reject) => {
        qr.callback = (err, value: QrCodeResult | null) => {
            if (err) {
                // Use reject instead of rejects for standard Promise behavior
                reject(err);
            } else if (!value) {
                // Reject if value is null/undefined after successful callback
                reject(new Error("QR code decoding returned no value"));
            } else {
                resolve(value);
            }
        };
        // Start the decoding process
        qr.decode(bitmap);
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`QR code decoding timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    // Race the decoding against the timeout
    return Promise.race([decodePromise, timeoutPromise]);
}

async function takeScreenshotAndDecodeQR(page: Page, maxAttempts: number = 3, retryDelayMs: number = 500): Promise<QrCodeResult | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Taking screenshot and attempting to decode QR code...`);
        try {
            const screenshotBuffer = await page.screenshot({ type: 'png' });
            console.log(` Attempt ${attempt}: Screenshot taken, buffer size: ${screenshotBuffer.length}`);
            // Optional: Save screenshot for debugging specific attempts
            // fs.writeFileSync(`./debug-screenshot-attempt-${attempt}.png`, screenshotBuffer);

            const image = await Jimp.read(screenshotBuffer);
            console.log(` Attempt ${attempt}: Screenshot read into Jimp image.`);

            // Use the decodeQrCode function which includes its own timeout
            const result = await decodeQrCode(image.bitmap, 2000); // Use a 2s timeout for decoding itself

            console.log(` Attempt ${attempt}: QR code decoding attempt complete.`);
            if (result) {
                console.log(` Attempt ${attempt}: QR Code decoded successfully: ${result.result}`);
                return { result: result.result, points: result.points };
            }
            console.log(` Attempt ${attempt}: QR Code not found or could not be decoded.`);
            // If decodeQrCode resolves to null, treat it as a failure for retry purposes

        } catch (error) {
            console.error(` Attempt ${attempt}: Error during screenshot or QR decoding:`, error);
            // Continue to the next attempt if error occurred
        }

        // If this wasn't the last attempt, wait before retrying
        if (attempt < maxAttempts) {
            console.log(` Attempt ${attempt} failed. Waiting ${retryDelayMs}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }

    // If all attempts failed
    console.error(`Failed to decode QR code after ${maxAttempts} attempts.`);
    return null;
}


// --- Jest Test Suite ---
describe('WebRTC Camera E2E Test', () => {
    // Apply timeout if needed
    jest.setTimeout(JEST_TIMEOUT * 2); // Give more time for video processing

    let pageA: Page;
    let pageB: Page;

    // Video generation parameters
    const videoWidth = 640;
    const videoHeight = 480;
    const videoFrames = 100; // Keep relatively low for faster generation
    const qrSize = 100;
    const qrContent = "book";
    const videoOutput = path.join(__dirname, 'setup', 'camera.mjpeg'); // Place in setup dir
    const tempFramesDir = path.join(__dirname, 'setup', 'temp_frames');
    const qrImagePath = path.join(tempFramesDir, 'qr.png');
    const qrResizedPath = path.join(tempFramesDir, 'qr_resized.png');
    const bgColor = "white";

    beforeAll(async () => {
        console.log('--- Generating test video for camera feed ---');
        try {
            // 1. Create temporary directory
            await fs.mkdir(tempFramesDir, { recursive: true });
            console.log(`Created temporary directory: ${tempFramesDir}`);

            // 2. Generate QR code
            console.log(`Generating QR code (${qrImagePath})...`);
            execSync(`qrencode -o ${qrImagePath} -s 10 "${qrContent}"`);

            // 3. Resize QR code
            console.log(`Resizing QR code (${qrResizedPath})...`);
            execSync(`convert ${qrImagePath} -resize ${qrSize}x${qrSize} ${qrResizedPath}`);

            // 4. Generate frames
            console.log(`Generating ${videoFrames} frames...`);
            for (let i = 0; i < videoFrames; i++) {
                const frameNumber = String(i).padStart(3, '0');
                const framePath = path.join(tempFramesDir, `frame_${frameNumber}.jpg`);
                // Calculate x position (moves across the screen)
                const x = Math.floor((i * (videoWidth - qrSize)) / videoFrames);
                const y = Math.floor(videoHeight / 2 - qrSize / 2);

                // Create blank background
                execSync(`convert -size ${videoWidth}x${videoHeight} xc:${bgColor} ${framePath}`);
                // Composite QR code
                execSync(`composite -geometry +${x}+${y} ${qrResizedPath} ${framePath} ${framePath}`);
                if ((i + 1) % 20 === 0) console.log(` Generated frame ${i + 1}/${videoFrames}`); // Progress indicator
            }
            console.log('All frames generated.');

            // 5. Create MJPEG video using ffmpeg
            console.log(`Creating MJPEG video (${videoOutput})...`);
            // Use yuvj420p for wider compatibility if yuv420p causes issues, though yuv420p is standard.
            execSync(`ffmpeg -y -framerate 25 -i ${path.join(tempFramesDir, 'frame_%03d.jpg')} -c:v mjpeg -q:v 5 -pix_fmt yuv420p ${videoOutput}`);
            console.log('Video generation complete.');

        } catch (error) {
            console.error('Error during video generation:', error);
            // Attempt cleanup even on error
            await fs.rm(tempFramesDir, { recursive: true, force: true }).catch(e => console.error("Error during cleanup after generation error:", e));
            throw new Error(`Failed to generate test video: ${error}`); // Fail fast
        }

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
        await pageA.waitForSelector(videoButtonSelector, { timeout: 1000 });
        console.log('Clicking video button on Page A...');
        await pageA.click(videoButtonSelector);
        console.log('Video button clicked.');

        // 2. Wait for the remote video stream to appear on Page B
        //    Selector assumes remote video is the first one NOT muted.
        const remoteVideoSelector = 'div.stream-container video:not([muted])';
        console.log('Waiting for remote video element on Page B...');
        try {
            await pageB.waitForSelector(remoteVideoSelector, { visible: true, timeout: 11000 }); // Increased timeout for stream setup
            console.log('Remote video element found on Page B.');
             // Add a small delay to ensure video rendering has started
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error("Remote video element did not appear on Page B within timeout.");
            // Capture final state for debugging
            await pageB.screenshot({ path: 'debug_screenshot_pageB_no_video.png' });
            throw error; // Re-throw to fail the test
        }

        // 3. Take 4 screenshots and decode QR codes without explicit waits between them
        const numScreenshots = 4;
        const results: (QrCodeResult | null)[] = [];
        const minXCoordinates: number[] = [];

        console.log(`Taking ${numScreenshots} screenshots on Page B...`);
        for (let i = 0; i < numScreenshots; i++) {
            console.log(`--- Screenshot ${i + 1}/${numScreenshots} ---`);
            const result = await takeScreenshotAndDecodeQR(pageB); // Uses retry logic internally
            results.push(result);

            // Assertions immediately after each attempt
            expect(result /* QR code decoding failed for screenshot ${i + 1} */).not.toBeNull();
            expect(result!.result /* QR code content mismatch for screenshot ${i + 1} */).toBe('book');

            const minX = Math.min(...result!.points.map(p => p.x));
            minXCoordinates.push(minX);
            console.log(`Screenshot ${i + 1}: QR code decoded successfully. Min X: ${minX}`);
        }

        // 4. Assert that the QR code position changed across the screenshots
        //    We check if there's more than one unique min X coordinate.
        const uniqueMinX = new Set(minXCoordinates);
        console.log(`Unique Min X coordinates found: ${Array.from(uniqueMinX).join(', ')}`);
        expect(uniqueMinX.size /* QR code position (min X) did not change across ${numScreenshots} screenshots */).toBeGreaterThan(1);
        console.log(`QR code position change verified (found ${uniqueMinX.size} unique positions).`);

        console.log('--- TEST SUCCESS: Video stream and QR code movement verified across multiple screenshots ---');

        // Optional: Turn off video on Page A afterwards
        const videoButtonOnSelector = 'button.pointer-events-auto ::-p-text(🎥)'; // Selector for the video button when ON
        try {
            await pageA.click(videoButtonOnSelector);
            console.log('Video turned off on Page A.');
        } catch (e) {
            console.warn("Could not find 'ON' video button to turn off video, maybe it failed to turn on?");
        }
    });

    afterAll(async () => {
        console.log('--- Cleaning up generated video and temporary files ---');
        try {
            // Remove the generated video file
            await fs.rm(videoOutput, { force: true });
            console.log(`Removed video file: ${videoOutput}`);
            // Remove the temporary frames directory and its contents
            await fs.rm(tempFramesDir, { recursive: true, force: true });
            console.log(`Removed temporary directory: ${tempFramesDir}`);
        } catch (error) {
            console.error('Error during cleanup:', error);
            // Don't fail the test run for cleanup errors, but log them.
        }
    });
});
