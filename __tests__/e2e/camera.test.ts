import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { TOGGLE_VIDEO_BUTTON_SELECTOR } from './setup/testHelpers';
import {
    generateMovingQrVideoFile,
    cleanupMedia,
    DEFAULT_VIDEO_WIDTH,
    DEFAULT_VIDEO_HEIGHT,
    DEFAULT_VIDEO_FRAMES,
    DEFAULT_QR_SIZE,
    DEFAULT_BG_COLOR,
    DEFAULT_VIDEO_FRAMERATE
} from './shared/mediaGeneration';
import { takeScreenshotAndDecodeQR, type QrCodeResult } from './shared/browserMediaUtils';

// --- Constants ---
const QR_CONTENT = "book";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const videoOutput = path.join(__dirname, 'setup', 'camera.mjpeg');
let tempFramesDir: string | undefined; // To store the temp directory for cleanup

// --- Jest Test Suite ---
describe('WebRTC Camera E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT * 2); // Give more time for video processing

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        console.log('--- Generating test video for camera feed ---');
        try {
            const videoGenResult = await generateMovingQrVideoFile(
                videoOutput,
                QR_CONTENT,
                DEFAULT_VIDEO_FRAMES,
                DEFAULT_VIDEO_WIDTH,
                DEFAULT_VIDEO_HEIGHT,
                DEFAULT_QR_SIZE,
                DEFAULT_BG_COLOR,
                DEFAULT_VIDEO_FRAMERATE,
                'mjpeg'
            );
            tempFramesDir = videoGenResult.tempFramesDir;
        } catch (error) {
            console.error('Error during video generation:', error);
            const dirsToClean = tempFramesDir ? [tempFramesDir] : [];
            await cleanupMedia([videoOutput], dirsToClean);
            throw new Error(`Failed to generate test video: ${error}`); // Fail fast
        }

        // Run the standard setup
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
    });

    afterAll(async () => {
        // Run the standard teardown first
        await standardTeardown({ pageA, pageB });

        // Then cleanup generated files
        const dirsToClean = tempFramesDir ? [tempFramesDir] : [];
        await cleanupMedia([videoOutput], dirsToClean);
    });


    test('should stream video from Page A to Page B and verify QR code movement', async () => {
        console.log('--- Starting Video Stream and QR Code Verification Test ---');

        // 1. Enable video on Page A using the test ID selector
        console.log(`Waiting for video button (${TOGGLE_VIDEO_BUTTON_SELECTOR}) on Page A...`);
        const videoButton = await pageA.waitForSelector(TOGGLE_VIDEO_BUTTON_SELECTOR, { timeout: 5000 });
        console.log('Clicking video button on Page A...');
        await videoButton?.click();
        console.log('Video button clicked.');

        // 2. Wait for the remote video stream container to appear on Page B
        const remoteVideoContainerSelector = 'div.stream-container[id^="test-remote-video-"]';
        console.log(`Waiting for remote video container (${remoteVideoContainerSelector}) on Page B...`);
        try {
            await pageB.waitForSelector(remoteVideoContainerSelector, { visible: true, timeout: 11000 });
            console.log('Remote video container found on Page B.');
            const remoteVideoElementSelector = `${remoteVideoContainerSelector} video`;
            console.log(`Waiting for video element (${remoteVideoElementSelector}) within container...`);
            await pageB.waitForSelector(remoteVideoElementSelector, { visible: true, timeout: 2000 });
            console.log('Remote video element found.');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Ensure rendering
        } catch (error) {
            console.error("Remote video element did not appear on Page B within timeout.");
            throw error;
        }

        // 3. Take screenshots and decode QR codes
        const numScreenshots = 4;
        const minXCoordinates: number[] = [];

        console.log(`Taking ${numScreenshots} screenshots on Page B...`);
        for (let i = 0; i < numScreenshots; i++) {
            console.log(`--- Screenshot ${i + 1}/${numScreenshots} ---`);
            // Screenshot the specific remote video element for better accuracy
            const result = await takeScreenshotAndDecodeQR(pageB, ``);
            
            expect(result).not.toBeNull();
            // Type assertion because we expect result to be non-null here
            const qrResult = result as QrCodeResult;
            expect(qrResult.result).toBe(QR_CONTENT);

            const minX = Math.min(...qrResult.points.map(p => p.x));
            minXCoordinates.push(minX);
            console.log(`Screenshot ${i + 1}: QR code decoded successfully. Min X: ${minX}`);
        }

        // 4. Assert that the QR code position changed
        const uniqueMinX = new Set(minXCoordinates);
        console.log(`Unique Min X coordinates found: ${Array.from(uniqueMinX).join(', ')}`);
        expect(uniqueMinX.size).toBeGreaterThan(1);
        console.log(`QR code position change verified (found ${uniqueMinX.size} unique positions).`);

        console.log('--- TEST SUCCESS: Video stream and QR code movement verified ---');

        // Optional: Turn off video on Page A
        try {
            console.log(`Clicking video button (${TOGGLE_VIDEO_BUTTON_SELECTOR}) again to turn off...`);
            await pageA.click(TOGGLE_VIDEO_BUTTON_SELECTOR);
            console.log('Video turned off on Page A.');
        } catch (e) {
            console.warn("Could not click video button to turn off video.", e);
        }
    });
});
