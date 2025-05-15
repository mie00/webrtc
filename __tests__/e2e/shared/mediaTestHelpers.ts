import type { Page } from 'puppeteer';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { expect } from '@jest/globals';
import {
    generateChirpAudioFile,
    generateMovingQrVideoFile,
    combineAudioAndVideo,
    cleanupMedia,
    DEFAULT_AUDIO_DURATION_SECONDS,
    DEFAULT_START_FREQ_HZ,
    DEFAULT_END_FREQ_HZ,
    DEFAULT_SAMPLE_RATE,
    DEFAULT_VIDEO_WIDTH,
    DEFAULT_VIDEO_HEIGHT,
    DEFAULT_VIDEO_FRAMERATE,
    DEFAULT_QR_SIZE,
    DEFAULT_BG_COLOR,
} from './mediaGeneration';
import {
    analyzeAudioInBrowser,
    takeScreenshotAndDecodeQR,
    type AudioAnalysisResult,
    type QrCodeResult,
} from './browserMediaUtils';
import {
    TOGGLE_AUDIO_BUTTON_SELECTOR,
    TOGGLE_VIDEO_BUTTON_SELECTOR,
    SHARE_VIDEO_BUTTON_SELECTOR,
    UPLOAD_VIDEO_INPUT_SELECTOR,
    PUPPETEER_TIMEOUT,
} from '../setup/testHelpers';

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // This will be __tests__/e2e/shared

const MEDIA_SETUP_DIR = path.join(__dirname, '..', 'setup'); // To place generated files in __tests__/e2e/setup/
const REMOTE_VIDEO_CONTAINER_SELECTOR = 'div.stream-container[id^="test-remote-video-"]';
const REMOTE_VIDEO_ELEMENT_SELECTOR = `${REMOTE_VIDEO_CONTAINER_SELECTOR} video`;
const LOCAL_VIDEO_CONTAINER_SELECTOR_FILE = 'div#test-local-video-file';
const LOCAL_VIDEO_ELEMENT_SELECTOR_FILE = `${LOCAL_VIDEO_CONTAINER_SELECTOR_FILE} video`;


// --- Mic Test Media ---
export const MIC_TEST_AUDIO_FILE_NAME = 'mic_test_generated_audio.wav';
export const micTestAudioPath = path.join(MEDIA_SETUP_DIR, MIC_TEST_AUDIO_FILE_NAME);
let micTestTempDir: string | undefined;

export async function setupMicTestMedia(): Promise<void> {
    console.log('--- Generating test audio file (chirp) for Mic Test ---');
    await generateChirpAudioFile(
        micTestAudioPath,
        DEFAULT_AUDIO_DURATION_SECONDS,
        DEFAULT_START_FREQ_HZ,
        DEFAULT_END_FREQ_HZ,
        DEFAULT_SAMPLE_RATE
    );
}
export async function teardownMicTestMedia(): Promise<void> {
    await cleanupMedia([micTestAudioPath], micTestTempDir ? [micTestTempDir] : []);
}

// --- Camera Test Media ---
export const CAMERA_TEST_VIDEO_FILE_NAME = 'camera_test_generated_video.mjpeg';
export const cameraTestVideoPath = path.join(MEDIA_SETUP_DIR, CAMERA_TEST_VIDEO_FILE_NAME);
export const CAMERA_TEST_QR_CONTENT = "book";
let cameraTestTempFramesDir: string | undefined;

export async function setupCameraTestMedia(): Promise<void> {
    console.log('--- Generating test video for Camera Test ---');
    const videoGenResult = await generateMovingQrVideoFile(
        cameraTestVideoPath,
        CAMERA_TEST_QR_CONTENT,
        DEFAULT_VIDEO_FRAMERATE * DEFAULT_AUDIO_DURATION_SECONDS, // Match typical duration
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        DEFAULT_QR_SIZE,
        DEFAULT_BG_COLOR,
        DEFAULT_VIDEO_FRAMERATE,
        'mjpeg'
    );
    cameraTestTempFramesDir = videoGenResult.tempFramesDir;
}
export async function teardownCameraTestMedia(): Promise<void> {
    const dirsToClean = cameraTestTempFramesDir ? [cameraTestTempFramesDir] : [];
    await cleanupMedia([cameraTestVideoPath], dirsToClean);
}

// --- Watch Test Media ---
export const WATCH_TEST_QR_CONTENT = "watch_test_qr_content";
const WATCH_VIDEO_FRAMES = DEFAULT_AUDIO_DURATION_SECONDS * DEFAULT_VIDEO_FRAMERATE;
const WATCH_TEMP_VIDEO_FILE_NAME = 'watch_test_temp_video_qr.mp4';
const WATCH_AUDIO_FILE_NAME = 'watch_test_audio_chirp.wav';
export const WATCH_FINAL_MP4_FILE_NAME = 'watch_test_combined_video_audio.mp4';

const watchTestTempVideoPath = path.join(MEDIA_SETUP_DIR, WATCH_TEMP_VIDEO_FILE_NAME);
const watchTestAudioPath = path.join(MEDIA_SETUP_DIR, WATCH_AUDIO_FILE_NAME);
export const watchTestFinalMp4Path = path.join(MEDIA_SETUP_DIR, WATCH_FINAL_MP4_FILE_NAME);

let watchTestTempVideoFramesDir: string | undefined;
const watchTestFilesToClean: string[] = [watchTestTempVideoPath, watchTestAudioPath, watchTestFinalMp4Path];
// dirsToClean will include MEDIA_SETUP_DIR if we create it, or specific temp frame dirs.
// For now, let's rely on cleanupMedia to handle individual files.

export async function setupWatchTestMedia(): Promise<void> {
    console.log('--- Generating test media for Watch Test ---');
    const videoGenResult = await generateMovingQrVideoFile(
        watchTestTempVideoPath,
        WATCH_TEST_QR_CONTENT,
        WATCH_VIDEO_FRAMES,
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        DEFAULT_QR_SIZE,
        DEFAULT_BG_COLOR,
        DEFAULT_VIDEO_FRAMERATE,
        'mp4'
    );
    watchTestTempVideoFramesDir = videoGenResult.tempFramesDir;

    await generateChirpAudioFile(
        watchTestAudioPath,
        DEFAULT_AUDIO_DURATION_SECONDS,
        DEFAULT_START_FREQ_HZ,
        DEFAULT_END_FREQ_HZ,
        DEFAULT_SAMPLE_RATE
    );
    await combineAudioAndVideo(watchTestTempVideoPath, watchTestAudioPath, watchTestFinalMp4Path);
}
export async function teardownWatchTestMedia(): Promise<void> {
    const dirsToClean = watchTestTempVideoFramesDir ? [watchTestTempVideoFramesDir] : [];
    await cleanupMedia(watchTestFilesToClean, dirsToClean);
}


// --- Helper Verification Functions ---
async function verifyAudioStreamOnPage(page: Page, pageName: string, expectedToPlay: boolean = true): Promise<void> {
    console.log(`${pageName}: Verifying audio stream (expected: ${expectedToPlay ? 'playing' : 'silent/no source'})...`);
    const analysisOptions = { silenceThresholdDb: -70 }; // Standard threshold
    const audioResult: AudioAnalysisResult = await page.evaluate(analyzeAudioInBrowser as any, 'frequency', analysisOptions);

    expect(audioResult.err).toBeUndefined();

    if (expectedToPlay) {
        expect(audioResult.frequencies.length).toBeGreaterThanOrEqual(2); // Expecting chirp
        audioResult.frequencies.forEach(freq => expect(freq).not.toBeNull());
        const uniqueFreqs = new Set(audioResult.frequencies.filter(f => f !== null));
        expect(uniqueFreqs.size).toBeGreaterThan(1); // Chirp should have changing frequencies
        console.log(`${pageName}: Audio chirp verified (Found ${uniqueFreqs.size} unique frequencies).`);
    } else {
        // This case is for checking if audio is NOT playing or no suitable source is found
        // analyzeAudioInBrowser returns [null] for peakAmplitudes if no source, or low amplitude for frequencies
        // For frequency check, it might return [null, null, null, null] if silent.
        // The crucial part is that it shouldn't detect a changing chirp.
        const uniqueFreqs = new Set(audioResult.frequencies.filter(f => f !== null && f > 0)); // Filter out nulls and 0 Hz
        expect(uniqueFreqs.size).toBeLessThanOrEqual(1); // Should not detect multiple frequencies of a chirp
        console.log(`${pageName}: Verified audio is not playing a chirp or no suitable source found.`);
    }
}

async function verifyVideoStreamOnPage(page: Page, pageName: string, videoElementSelector: string, expectedQrContent: string): Promise<void> {
    console.log(`${pageName}: Verifying video stream (QR content: "${expectedQrContent}") from element "${videoElementSelector}"...`);
    const qrMinXCoords: number[] = [];
    const numScreenshots = 2; // Sufficient to detect movement

    for (let i = 0; i < numScreenshots; i++) {
        await page.waitForSelector(videoElementSelector, { visible: true, timeout: PUPPETEER_TIMEOUT });
        // Add a small delay to ensure video frame is updated, especially between screenshots
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 1500));
        else await new Promise(resolve => setTimeout(resolve, 500)); // Initial wait for render

        const result = await takeScreenshotAndDecodeQR(page, videoElementSelector);
        console.log(`${pageName}: Screenshot ${i + 1}/${numScreenshots} taken for QR check.`);
        expect(result).not.toBeNull();
        const qrResult = result as QrCodeResult;
        expect(qrResult.result).toBe(expectedQrContent);
        qrMinXCoords.push(Math.min(...qrResult.points.map(p => p.x)));
    }
    const uniqueXCoords = new Set(qrMinXCoords);
    expect(uniqueXCoords.size).toBeGreaterThan(1); // QR code should have moved
    console.log(`${pageName}: Video QR movement verified (${uniqueXCoords.size} unique X positions).`);
}

// --- Perform Test Functions ---
export interface PageInfo {
    page: Page;
    name: string;
}

export async function performMicTest(
    sender: PageInfo,
    receivers: PageInfo[],
    checkSenderMutedState: boolean = false // For the original mic.test.ts behavior
): Promise<void> {
    console.log(`--- Starting Mic Test: ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    // 1. Enable audio on Sender
    console.log(`${sender.name}: Clicking audio button.`);
    const audioButton = await sender.page.waitForSelector(TOGGLE_AUDIO_BUTTON_SELECTOR, { timeout: PUPPETEER_TIMEOUT });
    await audioButton?.click();
    await sender.page.waitForSelector(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`, { timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: Audio button ON. Waiting for stream propagation...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Propagation delay

    // 2. Verify audio on Receivers
    for (const receiver of receivers) {
        await verifyAudioStreamOnPage(receiver.page, receiver.name, true);
    }

    // 3. Special check for original mic.test.ts: sender's own audio state after initial send (should be "muted" or no source for its own analyzer)
    if (checkSenderMutedState) {
        console.log(`${sender.name}: Verifying its own audio state (expected: no playable chirp for self-analysis).`);
        // This check assumes that the sender's own microphone input is not directly played back to its own output analysis
        // in a way that would register as a clear, changing chirp by analyzeAudioInBrowser.
        // analyzeAudioInBrowser looks for playing <audio> or <video> elements.
        // If the sender page is not playing back its own mic through such an element, this should pass.
        const analysisResultA: AudioAnalysisResult = await sender.page.evaluate(analyzeAudioInBrowser as any, 'amplitude', {silenceThresholdDb: -80});
        expect(analysisResultA.peakAmplitudes.length).toBe(1);
        expect(analysisResultA.peakAmplitudes[0]).toBe(null); // Indicates no suitable source found by analyzeAudioInBrowser
        console.log(`${sender.name}: Own audio state verified (no suitable source found for self-analysis).`);
    }

    // 4. Disable audio on Sender
    console.log(`${sender.name}: Clicking audio button to turn OFF.`);
    await audioButton?.click();
    await sender.page.waitForSelector(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`, { timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: Audio button OFF.`);
}

export async function performCameraTest(
    sender: PageInfo,
    receivers: PageInfo[]
): Promise<void> {
    console.log(`--- Starting Camera Test: ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    // 1. Enable video on Sender
    console.log(`${sender.name}: Clicking video button.`);
    const videoButton = await sender.page.waitForSelector(TOGGLE_VIDEO_BUTTON_SELECTOR, { timeout: PUPPETEER_TIMEOUT });
    await videoButton?.click();
    await sender.page.waitForSelector(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`, { timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: Video button ON. Waiting for stream propagation...`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Propagation delay

    // 2. Verify video on Receivers
    for (const receiver of receivers) {
        await receiver.page.waitForSelector(REMOTE_VIDEO_ELEMENT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 });
        console.log(`${receiver.name}: Remote video element found.`);
        await verifyVideoStreamOnPage(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT);
    }

    // 3. Disable video on Sender
    console.log(`${sender.name}: Clicking video button to turn OFF.`);
    await videoButton?.click();
    await sender.page.waitForSelector(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`, { timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: Video button OFF.`);
}

export async function performWatchTest(
    sender: PageInfo,
    receivers: PageInfo[]
): Promise<void> {
    console.log(`--- Starting Watch Test: ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    // 1. On Sender: Share the MP4 file
    console.log(`${sender.name}: Waiting for file input and uploading file...`);
    const fileInputElement = await sender.page.waitForSelector(UPLOAD_VIDEO_INPUT_SELECTOR, { hidden: true });
    expect(fileInputElement).toBeTruthy();
    await fileInputElement!.uploadFile(watchTestFinalMp4Path);
    console.log(`${sender.name}: File "${watchTestFinalMp4Path}" selected for upload.`);
    await sender.page.waitForSelector(`${SHARE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`, { timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: "Share Video" button indicates video is shared.`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Allow time for video to load and play locally

    // 2. Verify remote stream on Receivers
    for (const receiver of receivers) {
        console.log(`${receiver.name}: Waiting for remote video element...`);
        await receiver.page.waitForSelector(REMOTE_VIDEO_ELEMENT_SELECTOR, { visible: true, timeout: PUPPETEER_TIMEOUT * 2 });
        console.log(`${receiver.name}: Remote video element found. Verifying stream...`);
        await verifyVideoStreamOnPage(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, WATCH_TEST_QR_CONTENT);
        await verifyAudioStreamOnPage(receiver.page, receiver.name, true);
    }

    // 3. Verify local playback on Sender
    console.log(`${sender.name}: Verifying local video playback...`);
    await verifyVideoStreamOnPage(sender.page, sender.name, LOCAL_VIDEO_ELEMENT_SELECTOR_FILE, WATCH_TEST_QR_CONTENT);
    console.log(`${sender.name}: Verifying local audio playback...`);
    await verifyAudioStreamOnPage(sender.page, sender.name, true);

    // 4. On Sender: Stop sharing
    console.log(`${sender.name}: Clicking "Share Video" button again to stop sharing...`);
    await sender.page.click(SHARE_VIDEO_BUTTON_SELECTOR);
    await sender.page.waitForFunction(
        (selector: string) => !document.querySelector(selector)?.classList.contains('bg-blue-600'),
        { timeout: PUPPETEER_TIMEOUT },
        SHARE_VIDEO_BUTTON_SELECTOR
    );
    console.log(`${sender.name}: "Share Video" button indicates video sharing stopped.`);
    await sender.page.waitForSelector(LOCAL_VIDEO_CONTAINER_SELECTOR_FILE, { hidden: true, timeout: PUPPETEER_TIMEOUT });
    console.log(`${sender.name}: Local video element for shared file is hidden/removed.`);
}
