import type { Page as PlaywrightPage } from '@playwright/test';
import { expect } from '@playwright/test';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    generateChirpAudioFile,
    generateMovingQrVideoFile,
    combineAudioAndVideo,
    cleanupMedia,
    fileExists,
    DEFAULT_AUDIO_DURATION_SECONDS,
    DEFAULT_START_FREQ_HZ,
    DEFAULT_END_FREQ_HZ,
    DEFAULT_SAMPLE_RATE,
    DEFAULT_VIDEO_WIDTH,
    DEFAULT_VIDEO_HEIGHT,
    DEFAULT_VIDEO_FRAMERATE,
    DEFAULT_QR_SIZE,
    DEFAULT_BG_COLOR,
} from './pwMediaGeneration'; // Use Playwright version
import {
    analyzeAudioInBrowser,
    takeScreenshotAndDecodeQR,
    type AudioAnalysisResult,
    type QrCodeResult,
} from './pwBrowserMediaUtils'; // Use Playwright version
import {
    TOGGLE_AUDIO_BUTTON_SELECTOR,
    TOGGLE_VIDEO_BUTTON_SELECTOR,
    SHARE_VIDEO_BUTTON_SELECTOR,
    UPLOAD_VIDEO_INPUT_SELECTOR,
    RECORD_BUTTON_SELECTOR, // Added
    PW_TIMEOUT, // Use Playwright timeout
} from '../setup/pwTestHelpers'; // Use Playwright helpers

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // This will be e2e/shared

// Store generated media in a Playwright-specific subdirectory within e2e/setup
export const MEDIA_SETUP_DIR_PW = path.join(__dirname, '..', 'setup', 'generated-media-pw');
const REMOTE_VIDEO_CONTAINER_SELECTOR = 'div.stream-container[id^="test-remote-video-"]';
const REMOTE_VIDEO_ELEMENT_SELECTOR = `${REMOTE_VIDEO_CONTAINER_SELECTOR} video`;

const LOCAL_VIDEO_CONTAINER_SELECTOR_CAMERA = 'div#test-local-video-camera'; // Added
const LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA = `${LOCAL_VIDEO_CONTAINER_SELECTOR_CAMERA} video`; // Added

const LOCAL_VIDEO_CONTAINER_SELECTOR_FILE = 'div#test-local-video-file';
const LOCAL_VIDEO_ELEMENT_SELECTOR_FILE = `${LOCAL_VIDEO_CONTAINER_SELECTOR_FILE} video`;

// --- Mic Test Media ---
export const MIC_TEST_AUDIO_FILE_NAME_PW = 'mic_test_generated_audio_pw.wav';
export const micTestAudioPathPw = path.join(MEDIA_SETUP_DIR_PW, MIC_TEST_AUDIO_FILE_NAME_PW);
// let micTestTempDirPw: string | undefined; // Not used by generateChirpAudioFile

export async function setupMicTestMediaPw(): Promise<void> {
    console.log('--- Generating test audio file (chirp) for Mic Test (Playwright) ---');
    await generateChirpAudioFile( // This function creates the directory if it doesn't exist
        micTestAudioPathPw,
        DEFAULT_AUDIO_DURATION_SECONDS,
        DEFAULT_START_FREQ_HZ,
        DEFAULT_END_FREQ_HZ,
        DEFAULT_SAMPLE_RATE
    );
}
export async function teardownMicTestMediaPw(): Promise<void> {
    // Main mic audio file (micTestAudioPathPw) is preserved.
    // Chirp generation doesn't create other temp dirs that this function manages.
    console.log(`Skipping cleanup of main mic audio file: ${micTestAudioPathPw}`);
    await cleanupMedia([], []); 
}

// --- Camera Test Media ---
export const CAMERA_TEST_VIDEO_FILE_NAME_PW = 'camera_test_generated_video_pw.mjpeg';
export const cameraTestVideoPathPw = path.join(MEDIA_SETUP_DIR_PW, CAMERA_TEST_VIDEO_FILE_NAME_PW);
export const CAMERA_TEST_QR_CONTENT_PW = "book_pw";
let cameraTestTempFramesDirPw: string | undefined;

export async function setupCameraTestMediaPw(): Promise<void> {
    console.log('--- Generating test video for Camera Test (Playwright) ---');
    const videoGenResult = await generateMovingQrVideoFile(
        cameraTestVideoPathPw,
        CAMERA_TEST_QR_CONTENT_PW,
        DEFAULT_VIDEO_FRAMERATE * DEFAULT_AUDIO_DURATION_SECONDS,
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        DEFAULT_QR_SIZE,
        DEFAULT_BG_COLOR,
        DEFAULT_VIDEO_FRAMERATE,
        'mjpeg'
    );
    if (videoGenResult.tempFramesDir) {
        cameraTestTempFramesDirPw = videoGenResult.tempFramesDir;
    }
}
export async function teardownCameraTestMediaPw(): Promise<void> {
    // Main camera video file (cameraTestVideoPathPw) is preserved.
    const dirsToClean = cameraTestTempFramesDirPw ? [cameraTestTempFramesDirPw] : [];
    if (dirsToClean.length > 0) {
        console.log(`Cleaning up temporary camera frames directory: ${cameraTestTempFramesDirPw}`);
    }
    console.log(`Skipping cleanup of main camera video file: ${cameraTestVideoPathPw}`);
    await cleanupMedia([], dirsToClean);
    cameraTestTempFramesDirPw = undefined; // Reset for subsequent runs if any issue
}

// --- Watch Test Media ---
export const WATCH_TEST_QR_CONTENT_PW = "watch_test_qr_content_pw";
const WATCH_VIDEO_FRAMES_PW = DEFAULT_AUDIO_DURATION_SECONDS * DEFAULT_VIDEO_FRAMERATE;
const WATCH_TEMP_VIDEO_FILE_NAME_PW = 'watch_test_temp_video_qr_pw.mp4';
const WATCH_AUDIO_FILE_NAME_PW = 'watch_test_audio_chirp_pw.wav';
export const WATCH_FINAL_MP4_FILE_NAME_PW = 'watch_test_combined_video_audio_pw.mp4';

const watchTestTempVideoPathPw = path.join(MEDIA_SETUP_DIR_PW, WATCH_TEMP_VIDEO_FILE_NAME_PW);
const watchTestAudioPathPw = path.join(MEDIA_SETUP_DIR_PW, WATCH_AUDIO_FILE_NAME_PW);
export const watchTestFinalMp4PathPw = path.join(MEDIA_SETUP_DIR_PW, WATCH_FINAL_MP4_FILE_NAME_PW);

let watchTestTempVideoFramesDirPw: string | undefined;
const watchTestFilesToCleanPw: string[] = [watchTestTempVideoPathPw, watchTestAudioPathPw, watchTestFinalMp4PathPw];

export async function setupWatchTestMediaPw(): Promise<void> {
    if (await fileExists(watchTestFinalMp4PathPw)) {
        console.log(`Watch file ${watchTestFinalMp4PathPw} already exists. Skipping generation.`);
        return;
    }
    console.log('--- Generating test media for Watch Test (Playwright) ---');
    const videoGenResult = await generateMovingQrVideoFile(
        watchTestTempVideoPathPw,
        WATCH_TEST_QR_CONTENT_PW,
        WATCH_VIDEO_FRAMES_PW,
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        DEFAULT_QR_SIZE,
        DEFAULT_BG_COLOR,
        DEFAULT_VIDEO_FRAMERATE,
        'mp4'
    );
    if (videoGenResult.tempFramesDir) {
        watchTestTempVideoFramesDirPw = videoGenResult.tempFramesDir;
    }

    // These are intermediate files, so they should be generated if the final file doesn't exist.
    // The generateChirpAudioFile and combineAudioAndVideo will handle their own existence checks
    // for their direct outputs.
    await generateChirpAudioFile(
        watchTestAudioPathPw,
        DEFAULT_AUDIO_DURATION_SECONDS,
        DEFAULT_START_FREQ_HZ,
        DEFAULT_END_FREQ_HZ,
        DEFAULT_SAMPLE_RATE
    );
    await combineAudioAndVideo(watchTestTempVideoPathPw, watchTestAudioPathPw, watchTestFinalMp4PathPw);
}
export async function teardownWatchTestMediaPw(): Promise<void> {
    // Main watch video file (watchTestFinalMp4PathPw) is preserved.
    // Intermediate files used for its creation are cleaned up.
    const intermediateFiles = [watchTestTempVideoPathPw, watchTestAudioPathPw];
    const dirsToClean = watchTestTempVideoFramesDirPw ? [watchTestTempVideoFramesDirPw] : [];
    
    console.log(`Cleaning up intermediate files for watch test: ${intermediateFiles.join(', ')}`);
    if (dirsToClean.length > 0) {
        console.log(`Cleaning up temporary watch frames directory: ${watchTestTempVideoFramesDirPw}`);
    }
    console.log(`Skipping cleanup of main watch video file: ${watchTestFinalMp4PathPw}`);
    await cleanupMedia(intermediateFiles, dirsToClean);
    watchTestTempVideoFramesDirPw = undefined; // Reset
}

// --- Helper Verification Functions (Playwright) ---
async function verifyAudioStreamOnPagePw(page: PlaywrightPage, pageName: string, expectedToPlay: boolean = true): Promise<void> {
    console.log(`${pageName}: Verifying audio stream (expected: ${expectedToPlay ? 'playing' : 'silent/no source'})...`);
    const analysisOptions = { analysisType: 'frequency' as const, silenceThresholdDb: -70 };
    const audioResult: AudioAnalysisResult = await page.evaluate(analyzeAudioInBrowser, analysisOptions);

    expect(audioResult.err).toBeUndefined();

    if (expectedToPlay) {
        expect(audioResult.frequencies.length).toBeGreaterThanOrEqual(2);
        audioResult.frequencies.forEach(freq => expect(freq).not.toBeNull());
        const uniqueFreqs = new Set(audioResult.frequencies.filter(f => f !== null));
        expect(uniqueFreqs.size).toBeGreaterThan(1);
        console.log(`${pageName}: Audio chirp verified (Found ${uniqueFreqs.size} unique frequencies).`);
    } else {
        const uniqueFreqs = new Set(audioResult.frequencies.filter(f => f !== null && f > 0));
        expect(uniqueFreqs.size).toBeLessThanOrEqual(1);
        console.log(`${pageName}: Verified audio is not playing a chirp or no suitable source found.`);
    }
}

async function verifyVideoStreamOnPagePw(page: PlaywrightPage, pageName: string, videoElementSelector: string, expectedQrContent: string): Promise<void> {
    console.log(`${pageName}: Verifying video stream (QR content: "${expectedQrContent}") from element "${videoElementSelector}"...`);
    const qrMinXCoords: number[] = [];
    const numScreenshots = 2;

    for (let i = 0; i < numScreenshots; i++) {
        await page.locator(videoElementSelector).waitFor({ state: 'visible', timeout: PW_TIMEOUT });
        if (i > 0) await page.waitForTimeout(1500);
        else await page.waitForTimeout(500);

        const result = await takeScreenshotAndDecodeQR(page, videoElementSelector);
        console.log(`${pageName}: Screenshot ${i + 1}/${numScreenshots} taken for QR check.`);
        expect(result).not.toBeNull();
        const qrResult = result as QrCodeResult; // Cast since we expect it not to be null
        expect(qrResult.result).toBe(expectedQrContent);

        // Verify QR code is reasonably square
        const xCoords = qrResult.points.map(p => p.x);
        const yCoords = qrResult.points.map(p => p.y);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords);
        const maxY = Math.max(...yCoords);
        const qrWidth = maxX - minX;
        const qrHeight = maxY - minY;

        // Allow a small tolerance for squareness (e.g., 10% of the smaller dimension)
        const tolerance = Math.min(qrWidth, qrHeight) * 0.15; // 15% tolerance
        expect(Math.abs(qrWidth - qrHeight)).toBeLessThanOrEqual(tolerance);
        console.log(`${pageName}: QR code squareness verified (Width: ${qrWidth.toFixed(2)}, Height: ${qrHeight.toFixed(2)}).`);

        qrMinXCoords.push(minX);
    }
    const uniqueXCoords = new Set(qrMinXCoords);
    expect(uniqueXCoords.size).toBeGreaterThan(1);
    console.log(`${pageName}: Video QR movement verified (${uniqueXCoords.size} unique X positions).`);
}

// --- Perform Test Functions (Playwright) ---
export interface PageInfoPw {
    page: PlaywrightPage;
    name: string;
}

export async function performMicTestPw(
    sender: PageInfoPw,
    receivers: PageInfoPw[],
    checkSenderMutedState: boolean = false
): Promise<void> {
    console.log(`--- Starting Mic Test (Playwright): ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    console.log(`${sender.name}: Clicking audio button.`);
    const audioButton = sender.page.locator(TOGGLE_AUDIO_BUTTON_SELECTOR);
    await audioButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await audioButton.click();
    await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: Audio button ON. Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000);

    for (const receiver of receivers) {
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true);
    }

    if (checkSenderMutedState) {
        console.log(`${sender.name}: Verifying its own audio state (expected: no playable chirp for self-analysis).`);
        const analysisResultA: AudioAnalysisResult = await sender.page.evaluate(analyzeAudioInBrowser, {analysisType: 'amplitude' as const, silenceThresholdDb: -80});
        expect(analysisResultA.peakAmplitudes.length).toBe(1);
        expect(analysisResultA.peakAmplitudes[0]).toBe(null);
        console.log(`${sender.name}: Own audio state verified (no suitable source found for self-analysis).`);
    }

    console.log(`${sender.name}: Clicking audio button to turn OFF.`);
    await audioButton.click();
    await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: Audio button OFF.`);
}

export async function performCameraTestPw(
    sender: PageInfoPw,
    receivers: PageInfoPw[]
): Promise<void> {
    console.log(`--- Starting Camera Test (Playwright): ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    console.log(`${sender.name}: Clicking video button.`);
    const videoButton = sender.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);
    await videoButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await videoButton.click();
    await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: Video button ON. Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000);

    for (const receiver of receivers) {
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: PW_TIMEOUT * 2 });
        console.log(`${receiver.name}: Remote video element found.`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);
    }

    console.log(`${sender.name}: Clicking video button to turn OFF.`);
    await videoButton.click();
    await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: Video button OFF.`);
}

export async function performWatchTestPw(
    sender: PageInfoPw,
    receivers: PageInfoPw[]
): Promise<void> {
    console.log(`--- Starting Watch Test (Playwright): ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    console.log(`${sender.name}: Waiting for file input and uploading file...`);
    // UPLOAD_VIDEO_INPUT_SELECTOR is 'input[type="file"][accept="video/*"]'
    // This input is visually hidden but can be interacted with.
    const fileInputElement = sender.page.locator(UPLOAD_VIDEO_INPUT_SELECTOR);
    // No need to wait for hidden:true, setInputFiles works on hidden inputs
    await fileInputElement.setInputFiles(watchTestFinalMp4PathPw);
    console.log(`${sender.name}: File "${watchTestFinalMp4PathPw}" selected for upload.`);
    await expect(sender.page.locator(`${SHARE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: "Share Video" button indicates video is shared.`);
    await sender.page.waitForTimeout(3000);

    for (const receiver of receivers) {
        console.log(`${receiver.name}: Waiting for remote video element...`);
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: PW_TIMEOUT * 2 });
        console.log(`${receiver.name}: Remote video element found. Verifying stream...`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, WATCH_TEST_QR_CONTENT_PW);
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true);
    }

    console.log(`${sender.name}: Verifying local video playback...`);
    await verifyVideoStreamOnPagePw(sender.page, sender.name, LOCAL_VIDEO_ELEMENT_SELECTOR_FILE, WATCH_TEST_QR_CONTENT_PW);
    console.log(`${sender.name}: Verifying local audio playback...`);
    await verifyAudioStreamOnPagePw(sender.page, sender.name, true);

    console.log(`${sender.name}: Clicking "Share Video" button again to stop sharing...`);
    await sender.page.locator(SHARE_VIDEO_BUTTON_SELECTOR).click();
    await expect(sender.page.locator(`${SHARE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: "Share Video" button indicates video sharing stopped.`);
    await expect(sender.page.locator(LOCAL_VIDEO_CONTAINER_SELECTOR_FILE)).toBeHidden({ timeout: PW_TIMEOUT });
    console.log(`${sender.name}: Local video element for shared file is hidden/removed.`);
}

export async function performCombinedMediaTestPw(
    sender: PageInfoPw,
    receivers: PageInfoPw[],
    order: 'audioFirst' | 'videoFirst'
): Promise<void> {
    console.log(`--- Starting Combined Media Test (Playwright): ${sender.name} sends to ${receivers.map(r => r.name).join(', ')}, order: ${order} ---`);

    const audioButton = sender.page.locator(TOGGLE_AUDIO_BUTTON_SELECTOR);
    const videoButton = sender.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);

    // Turn on media
    if (order === 'audioFirst') {
        console.log(`${sender.name}: Clicking audio button.`);
        await audioButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Audio button ON.`);
        await sender.page.waitForTimeout(1000); // Wait briefly before next action

        console.log(`${sender.name}: Clicking video button.`);
        await videoButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Video button ON.`);
    } else { // videoFirst
        console.log(`${sender.name}: Clicking video button.`);
        await videoButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Video button ON.`);
        await sender.page.waitForTimeout(1000); // Wait briefly before next action

        console.log(`${sender.name}: Clicking audio button.`);
        await audioButton.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Audio button ON.`);
    }

    console.log(`${sender.name}: Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000); // Main wait after both media types are enabled

    // Verify streams on receivers
    for (const receiver of receivers) {
        console.log(`${receiver.name}: Verifying audio stream...`);
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true);
        
        console.log(`${receiver.name}: Verifying video stream...`);
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: PW_TIMEOUT * 2 });
        console.log(`${receiver.name}: Remote video element found.`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);
    }

    // Turn off media in reverse order of activation
    if (order === 'audioFirst') { // Activated A then V. Turn off V then A.
        console.log(`${sender.name}: Clicking video button to turn OFF.`);
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Video button OFF.`);
        await sender.page.waitForTimeout(500);

        console.log(`${sender.name}: Clicking audio button to turn OFF.`);
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Audio button OFF.`);
    } else { // videoFirst. Activated V then A. Turn off A then V.
        console.log(`${sender.name}: Clicking audio button to turn OFF.`);
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Audio button OFF.`);
        await sender.page.waitForTimeout(500);

        console.log(`${sender.name}: Clicking video button to turn OFF.`);
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
        console.log(`${sender.name}: Video button OFF.`);
    }
    console.log(`--- Combined Media Test (Order: ${order}) Completed ---`);
}

interface VideoFileAnalysisResult {
    qrCodesDetected: Array<{ content: string, points: { x: number, y: number }[], frameIndex: number, instanceId?: string }>;
    audioAnalysis: AudioAnalysisResult | null;
    // Add other relevant fields like movement verification, squareness, etc.
}

async function verifyVideoFilePw(
    filePath: string,
    expectedQrContent: string,
    expectedAudio: boolean,
    pageName: string // For logging
): Promise<void> {
    console.log(`${pageName}: Verifying downloaded video file: ${filePath}`);
    console.log(`${pageName}: Expected QR content: "${expectedQrContent}", Expected Audio: ${expectedAudio}`);

    // This function will use helpers from pwBrowserMediaUtils.ts (Node.js context)
    // to process the video file.
    // 1. Extract ~4 frames using ffmpeg.
    // 2. For each frame:
    //    - Load frame into Jimp.
    //    - Attempt to decode *two* QR codes. This is the complex part.
    //      Strategy: If the recorded layout is a grid (e.g., 2x1),
    //      crop the frame into two halves and run QR decoder on each.
    //      Alternatively, if a QR library can find multiple, use that.
    //      For now, we'll aim to find at least two distinct QR instances across frames.
    //    - Store all QR results (content, points, frame index).
    // 3. Analyze collected QR results:
    //    - Expect `expectedQrContent` to be found.
    //    - Expect at least two distinct QR "instances" (based on coordinates/movement)
    //      if the recording captured two video streams.
    //    - Verify squareness for all found QRs.
    //    - Verify movement for these QR instances across the frames.
    // 4. Extract audio from the video file using ffmpeg.
    // 5. Analyze the extracted audio for the chirp if expectedAudio is true.

    // Placeholder for actual implementation:
    // const analysisResult = await extractFramesAndAnalyzeVideoFileNode(filePath, expectedQrContent, expectedAudio);
    
    // Example assertions (these would use data from analysisResult):
    // expect(analysisResult.qrCodesDetected.length).toBeGreaterThanOrEqual(4 * 2); // e.g. 4 frames, 2 QRs per frame
    // expect(all QR contents match expectedQrContent)
    // expect(qr codes are square)
    // expect(qr codes show movement for two distinct instances)
    // if (expectedAudio) {
    //   expect(analysisResult.audioAnalysis?.frequencies.length).toBeGreaterThanOrEqual(2);
    //   expect(unique freqs > 1)
    // } else {
    //   expect(audio is silent or not present)
    // }

    console.warn(`${pageName}: Actual video file verification (QR, audio) in verifyVideoFilePw is not fully implemented yet.`);
    // For now, just check if the file exists and is non-empty as a basic step
    const fs = require('fs');
    expect(fs.existsSync(filePath)).toBe(true);
    const stats = fs.statSync(filePath);
    expect(stats.size).toBeGreaterThan(0);
    console.log(`${pageName}: Basic file check passed for ${filePath} (exists and non-empty). Full analysis pending.`);
}


export async function performRecordingTestPw(
    pageInfoA: PageInfoPw,
    pageInfoB: PageInfoPw
): Promise<void> {
    console.log(`--- Starting Recording Test (Playwright): ${pageInfoA.name} and ${pageInfoB.name} ---`);
    const recordingDurationMs = 5000;

    // 1. Enable camera on Page A
    console.log(`${pageInfoA.name}: Clicking video button.`);
    const videoButtonA = pageInfoA.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);
    await videoButtonA.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await videoButtonA.click();
    await expect(pageInfoA.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${pageInfoA.name}: Video button ON.`);

    // 2. Enable camera on Page B
    console.log(`${pageInfoB.name}: Clicking video button.`);
    const videoButtonB = pageInfoB.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);
    await videoButtonB.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await videoButtonB.click();
    await expect(pageInfoB.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${pageInfoB.name}: Video button ON.`);

    // 3. Enable mic on Page A
    console.log(`${pageInfoA.name}: Clicking audio button.`);
    const audioButtonA = pageInfoA.page.locator(TOGGLE_AUDIO_BUTTON_SELECTOR);
    await audioButtonA.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await audioButtonA.click();
    await expect(pageInfoA.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${pageInfoA.name}: Audio button ON.`);

    await pageInfoA.page.waitForTimeout(3000); // Wait for streams to establish

    // 4. Verify Page A sees its local camera and remote camera from B
    console.log(`${pageInfoA.name}: Verifying local camera stream.`);
    await verifyVideoStreamOnPagePw(pageInfoA.page, `${pageInfoA.name} (local view)`, LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA, CAMERA_TEST_QR_CONTENT_PW);
    console.log(`${pageInfoA.name}: Verifying remote camera stream from ${pageInfoB.name}.`);
    await verifyVideoStreamOnPagePw(pageInfoA.page, `${pageInfoA.name} (remote view of ${pageInfoB.name})`, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);
    
    // 5. Verify Page B sees its local camera and remote camera from A
    console.log(`${pageInfoB.name}: Verifying local camera stream.`);
    await verifyVideoStreamOnPagePw(pageInfoB.page, `${pageInfoB.name} (local view)`, LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA, CAMERA_TEST_QR_CONTENT_PW);
    console.log(`${pageInfoB.name}: Verifying remote camera stream from ${pageInfoA.name}.`);
    await verifyVideoStreamOnPagePw(pageInfoB.page, `${pageInfoB.name} (remote view of ${pageInfoA.name})`, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);

    // 6. Verify Page B hears audio from Page A
    console.log(`${pageInfoB.name}: Verifying audio stream from ${pageInfoA.name}.`);
    await verifyAudioStreamOnPagePw(pageInfoB.page, pageInfoB.name, true);

    // 7. Start recording on Page A
    console.log(`${pageInfoA.name}: Clicking record button.`);
    const recordButtonA = pageInfoA.page.locator(RECORD_BUTTON_SELECTOR);
    await recordButtonA.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await recordButtonA.click();
    await expect(pageInfoA.page.locator(`${RECORD_BUTTON_SELECTOR}[class*="bg-red-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${pageInfoA.name}: Record button ON.`);

    // 8. Start recording on Page B
    console.log(`${pageInfoB.name}: Clicking record button.`);
    const recordButtonB = pageInfoB.page.locator(RECORD_BUTTON_SELECTOR);
    await recordButtonB.waitFor({ state: 'visible', timeout: PW_TIMEOUT });
    await recordButtonB.click();
    await expect(pageInfoB.page.locator(`${RECORD_BUTTON_SELECTOR}[class*="bg-red-600"]`)).toBeVisible({ timeout: PW_TIMEOUT });
    console.log(`${pageInfoB.name}: Record button ON.`);

    // 9. Wait for recording duration
    console.log(`Waiting ${recordingDurationMs}ms for recording...`);
    await pageInfoA.page.waitForTimeout(recordingDurationMs);

    // 10. Stop recording on Page A (triggers download_A)
    console.log(`${pageInfoA.name}: Clicking record button to stop and download.`);
    const downloadPromiseA = pageInfoA.page.waitForEvent('download', {timeout: PW_TIMEOUT * 2});
    await recordButtonA.click();
    await expect(pageInfoA.page.locator(`${RECORD_BUTTON_SELECTOR}:not([class*="bg-red-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
    const downloadA = await downloadPromiseA;
    const filePathA = path.join(MEDIA_SETUP_DIR_PW, `recording_${pageInfoA.name.replace(' ', '_')}_${Date.now()}.webm`);
    await downloadA.saveAs(filePathA);
    console.log(`${pageInfoA.name}: Downloaded recording to ${filePathA}`);

    // 11. Stop recording on Page B (triggers download_B)
    console.log(`${pageInfoB.name}: Clicking record button to stop and download.`);
    const downloadPromiseB = pageInfoB.page.waitForEvent('download', {timeout: PW_TIMEOUT * 2});
    await recordButtonB.click();
    await expect(pageInfoB.page.locator(`${RECORD_BUTTON_SELECTOR}:not([class*="bg-red-600"])`)).toBeVisible({ timeout: PW_TIMEOUT });
    const downloadB = await downloadPromiseB;
    const filePathB = path.join(MEDIA_SETUP_DIR_PW, `recording_${pageInfoB.name.replace(' ', '_')}_${Date.now()}.webm`);
    await downloadB.saveAs(filePathB);
    console.log(`${pageInfoB.name}: Downloaded recording to ${filePathB}`);

    // 12. Analyze download_A
    // Expected: 2 QRs (CAMERA_TEST_QR_CONTENT_PW from local, CAMERA_TEST_QR_CONTENT_PW from remote B), movement for both, audio chirp (from A's mic).
    await verifyVideoFilePw(filePathA, CAMERA_TEST_QR_CONTENT_PW, true, `${pageInfoA.name} recording`);

    // 13. Analyze download_B
    // Expected: 2 QRs (CAMERA_TEST_QR_CONTENT_PW from local, CAMERA_TEST_QR_CONTENT_PW from remote A), movement for both, audio chirp (from A's mic, received by B).
    await verifyVideoFilePw(filePathB, CAMERA_TEST_QR_CONTENT_PW, true, `${pageInfoB.name} recording`);

    // Cleanup: Turn off media
    console.log(`${pageInfoA.name}: Turning off audio and video.`);
    await audioButtonA.click();
    await videoButtonA.click();
    console.log(`${pageInfoB.name}: Turning off video.`);
    await videoButtonB.click();

    console.log(`--- Recording Test Completed ---`);
}
