import type { Page as PlaywrightPage } from '@playwright/test';
import { expect } from '@playwright/test';
import os from 'os'; // Added for OS detection
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
    type AudioAnalysisResult,
} from './pwBrowserMediaUtils'; // Use Playwright version, YuvAnalysisResult and its function removed
import {
    takeScreenshotAndDecodeQR,
    extractFramesAndAnalyzeVideoFileNode,
    takeScreenshotAndRecognizeText,
    analyzeImageBufferForYuvNode, // Added
    type QrCodeResult,
    type VideoFileAnalysisNodeResult,
    type OcrResult,
    type YuvAnalysisResult, // Added
} from './pwNodeMediaProcessingUtils'; // Newly added import for Node.js utilities
import {
    TOGGLE_AUDIO_BUTTON_SELECTOR,
    TOGGLE_VIDEO_BUTTON_SELECTOR,
    SHARE_VIDEO_BUTTON_SELECTOR,
    UPLOAD_VIDEO_INPUT_SELECTOR,
    RECORD_BUTTON_SELECTOR, // Added
    PW_TIMEOUT, // Use Playwright timeout
} from '../setup/pwTestHelpers'; // Use Playwright helpers

// --- Timeout Helper ---
const WEBKIT_MACOS_TIMEOUT = 30000; // 30 seconds

function getEffectiveTimeout(page: PlaywrightPage, multiplier: number = 1): number {
    const browserName = page.context().browser()?.browserType().name();
    const isMac = os.platform() === 'darwin';
    if (browserName === 'webkit' && isMac) {
        return WEBKIT_MACOS_TIMEOUT * multiplier;
    }
    return PW_TIMEOUT * multiplier;
}

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // This will be e2e/shared

// Store generated media in a Playwright-specific subdirectory within e2e/setup
export const MEDIA_SETUP_DIR_PW = path.join(__dirname, '..', 'setup', 'generated-media-pw');
const REMOTE_VIDEO_CONTAINER_SELECTOR = 'div.stream-container[id^="test-remote-video-"]';
const REMOTE_VIDEO_ELEMENT_SELECTOR = `${REMOTE_VIDEO_CONTAINER_SELECTOR} video`;

const LOCAL_VIDEO_CONTAINER_SELECTOR_CAMERA = 'div[id^="test-local-video-camera"]'; // Added
const LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA = `${LOCAL_VIDEO_CONTAINER_SELECTOR_CAMERA} video`; // Added

const LOCAL_VIDEO_CONTAINER_SELECTOR_FILE = 'div[id^="test-local-video-file"]';
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
async function verifyAudioStreamOnPagePw(page: PlaywrightPage, pageName: string, expectedToPlay: boolean = true, isWatchTestAudio: boolean = false): Promise<void> {
    console.log(`${pageName}: Verifying audio stream (expected: ${expectedToPlay ? 'playing' : 'silent/no source'}, type: ${isWatchTestAudio ? 'watch-test (chirp)' : 'mic (chirp/sine)'})...`);

    if (expectedToPlay && !isWatchTestAudio) { // This is a mic test, check for remote stream container visibility before analyzing
        console.log(`${pageName}: Mic test, ensuring remote stream container is visible before audio analysis...`);
        await expect(page.locator(REMOTE_VIDEO_CONTAINER_SELECTOR)).toBeVisible({ timeout: getEffectiveTimeout(page) });
        console.log(`${pageName}: Remote stream container is visible.`);
    }

    const analysisOptions = { analysisType: 'frequency' as const, silenceThresholdDb: -70 };
    const audioResult: AudioAnalysisResult = await page.evaluate(analyzeAudioInBrowser, analysisOptions);

    expect(audioResult.err).toBeUndefined();
    const browserName = page.context().browser()?.browserType().name();

    if (expectedToPlay) {
        const validFrequencies = audioResult.frequencies.filter(f => f !== null);
        // Ensure at least one valid (non-null) frequency reading was captured.
        // analyzeAudioInBrowser aims for multiple samples but might get fewer if conditions are met or on error.
        expect(validFrequencies.length).toBeGreaterThanOrEqual(1); 
        const uniqueFreqs = new Set(validFrequencies);

        if (isWatchTestAudio) {
            // Watch test audio is a chirp from a file, expect multiple distinct frequencies for all browsers.
            expect(uniqueFreqs.size).toBeGreaterThan(1);
            console.log(`${pageName}: Watch test audio chirp verified (Found ${uniqueFreqs.size} unique non-null frequencies, expected >1).`);
        } else { // Mic test audio
            if (browserName === 'chromium') {
                // Chromium mic audio uses a chirp, expect multiple distinct frequencies.
                expect(uniqueFreqs.size).toBeGreaterThan(1);
                console.log(`${pageName}: Chromium mic audio chirp verified (Found ${uniqueFreqs.size} unique non-null frequencies, expected >1).`);
            } else if (browserName === 'webkit' || browserName === 'firefox') {
                // WebKit and Firefox mic audio use a sine wave or simpler audio, expect at least one frequency.
                expect(uniqueFreqs.size).toBeGreaterThanOrEqual(1);
                console.log(`${pageName}: ${browserName} mic audio verified (Found ${uniqueFreqs.size} unique non-null frequencies, expected >=1 for sine wave/simple audio).`);
            } else {
                // Default case for other browsers (if any) for mic audio.
                // Assuming lenient for unhandled browsers, similar to WebKit/Firefox.
                expect(uniqueFreqs.size).toBeGreaterThanOrEqual(1);
                console.log(`${pageName}: Mic audio verified for ${browserName || 'unknown browser'} (Found ${uniqueFreqs.size} unique non-null frequencies, expected >=1).`);
            }
        }
    } else {
        // For both Firefox and other browsers, if no audio is expected, verify silence.
        const isActiveAudio = audioResult.frequencies.some(f => f !== null && f > (analysisOptions.silenceThresholdDb || -80));
        expect(isActiveAudio).toBe(false);
        console.log(`${pageName}: Verified audio is not playing or no suitable source found.`);
    }
}


async function verifyVideoStreamOnPagePw(page: PlaywrightPage, pageName: string, videoElementSelector: string, expectedQrContent: string): Promise<void> {
    const browserName = page.context().browser()?.browserType().name();
    const isWebKitCamera = browserName === 'webkit' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW;
    const isFirefoxCamera = browserName === 'firefox' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW; // Watch tests use QR

    if (isFirefoxCamera) {
        console.log(`${pageName}: Verifying video stream (Firefox - Mid-Luminance YCbCr Dynamic Check) from element "${videoElementSelector}"...`);
        const numScreenshots = 3;
        const collectedMidLuminanceChroma: { cb: number | null, cr: number | null }[] = [];
        const minPercentageOfMidLuminancePixels = 0.20; // Expect at least 20% of pixels to be in Y tolerance.

        for (let i = 0; i < numScreenshots; i++) {
            await page.locator(videoElementSelector).waitFor({ state: 'visible', timeout: getEffectiveTimeout(page) });
            if (i > 0) await page.waitForTimeout(1000); // Wait for potential change in video
            else await page.waitForTimeout(500); // Initial wait

            const screenshotBuffer = await page.locator(videoElementSelector).screenshot({ type: 'png' });
            console.log(`${pageName}: Screenshot ${i + 1}/${numScreenshots} taken for YCbCr check.`);

            const analysisResult: YuvAnalysisResult = await analyzeImageBufferForYuvNode(screenshotBuffer);
            
            console.log(`${pageName}: Screenshot ${i + 1} Mid-Luminance (Y=${analysisResult.midLuminanceYValue} +/-${analysisResult.yTolerancePercentage*100}%) Analysis: ` +
                        `Pixel Percentage=${(analysisResult.percentageOfPixelsInYTolerance * 100).toFixed(2)}%, ` +
                        `Avg Cb=${analysisResult.averageCbForMidLuminancePixels?.toFixed(2)}, ` +
                        `Avg Cr=${analysisResult.averageCrForMidLuminancePixels?.toFixed(2)}`);

            expect(analysisResult.error, `Error in YCbCr analysis: ${analysisResult.error}`).toBeUndefined();
            expect(analysisResult.percentageOfPixelsInYTolerance).toBeGreaterThanOrEqual(minPercentageOfMidLuminancePixels);
            expect(analysisResult.averageCbForMidLuminancePixels).not.toBeNull();
            expect(analysisResult.averageCrForMidLuminancePixels).not.toBeNull();

            collectedMidLuminanceChroma.push({ 
                cb: analysisResult.averageCbForMidLuminancePixels, 
                cr: analysisResult.averageCrForMidLuminancePixels 
            });
        }

        const uniqueCbCrPairs = new Set(
            collectedMidLuminanceChroma.map(chroma => `${chroma.cb?.toFixed(1)},${chroma.cr?.toFixed(1)}`)
        );

        expect(uniqueCbCrPairs.size).toBeGreaterThan(1);
        console.log(`${pageName}: Video Cb/Cr (mid-lum) combination change verified (${uniqueCbCrPairs.size} unique avg (Cb,Cr) pairs: ${Array.from(uniqueCbCrPairs).join('; ')}).`);
    } else if (isWebKitCamera) {
        console.log(`${pageName}: Verifying video stream (WebKit OCR: timestamp format HH:MM:SS.mmm) from element "${videoElementSelector}"...`);
        const foundTimestamps = new Set<string>();
        const maxAttempts = 10; // Try up to 10 times to find at least two different timestamps
        const flip = videoElementSelector === LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA;
        const timestampRegex = /\d{2}:\d{2}:\d{2}\.\d{3}/;

        for (let i = 0; i < maxAttempts && foundTimestamps.size < 2; i++) {
            await page.locator(videoElementSelector).waitFor({ state: 'visible', timeout: getEffectiveTimeout(page) });
            if (i > 0) await page.waitForTimeout(1000); // Wait for video to change
            else await page.waitForTimeout(500); // Initial wait

            const ocrResult: OcrResult | null = await takeScreenshotAndRecognizeText(page, videoElementSelector, 1, 0, flip); // 1 attempt, no extra delay here
            console.log(`${pageName}: Screenshot ${i + 1}/${maxAttempts} for OCR (flip: ${flip}). Result: ${JSON.stringify(ocrResult)}`);

            if (ocrResult && ocrResult.text) {
                const match = ocrResult.text.match(timestampRegex);
                if (match && match[0]) {
                    foundTimestamps.add(match[0]);
                    console.log(`${pageName}: Found timestamp "${match[0]}" (Confidence: ${ocrResult.confidence}). Total unique: ${foundTimestamps.size}`);
                }
            }
        }
        expect(foundTimestamps.size, `${pageName}: Expected to find at least 2 different timestamps in video stream, found ${foundTimestamps.size}. Timestamps: ${Array.from(foundTimestamps).join(', ')}`).toBeGreaterThanOrEqual(2);
        console.log(`${pageName}: WebKit video OCR verification successful. Found ${foundTimestamps.size} unique timestamps.`);

    } else { // Default to QR code verification (Chromium camera, all Watch tests)
        console.log(`${pageName}: Verifying video stream (QR content: "${expectedQrContent}") from element "${videoElementSelector}"...`);
        const qrMinXCoords: number[] = [];
        const numScreenshots = 2;

        for (let i = 0; i < numScreenshots; i++) {
            await page.locator(videoElementSelector).waitFor({ state: 'visible', timeout: getEffectiveTimeout(page) });
            if (i > 0) await page.waitForTimeout(1500);
            else await page.waitForTimeout(500);

            const flip = videoElementSelector === LOCAL_VIDEO_ELEMENT_SELECTOR_CAMERA;
            const result = await takeScreenshotAndDecodeQR(page, videoElementSelector, 3, 500, flip);
            console.log(`${pageName}: Screenshot ${i + 1}/${numScreenshots} taken for QR check (flip: ${flip}).`);
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
    await audioButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
    await audioButton.click();
    await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
    console.log(`${sender.name}: Audio button ON. Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000);

    for (const receiver of receivers) {
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true, false); // Mic audio, not watch test
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
    await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
    console.log(`${sender.name}: Audio button OFF.`);
}

export async function performCameraTestPw(
    sender: PageInfoPw,
    receivers: PageInfoPw[]
): Promise<void> {
    console.log(`--- Starting Camera Test (Playwright): ${sender.name} sends to ${receivers.map(r => r.name).join(', ')} ---`);

    console.log(`${sender.name}: Clicking video button.`);
    const videoButton = sender.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);
    await videoButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
    await videoButton.click();
    await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
    console.log(`${sender.name}: Video button ON. Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000);

    for (const receiver of receivers) {
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: getEffectiveTimeout(receiver.page, 2) });
        console.log(`${receiver.name}: Remote video element found.`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);
    }

    console.log(`${sender.name}: Clicking video button to turn OFF.`);
    await videoButton.click();
    await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
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
    await expect(sender.page.locator(`${SHARE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
    console.log(`${sender.name}: "Share Video" button indicates video is shared.`);
    await sender.page.waitForTimeout(3000);

    for (const receiver of receivers) {
        console.log(`${receiver.name}: Waiting for remote video element...`);
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: getEffectiveTimeout(receiver.page, 2) });
        console.log(`${receiver.name}: Remote video element found. Verifying stream...`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, WATCH_TEST_QR_CONTENT_PW);
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true, true); // Watch test audio
    }

    console.log(`${sender.name}: Verifying local video playback...`);
    await verifyVideoStreamOnPagePw(sender.page, sender.name, LOCAL_VIDEO_ELEMENT_SELECTOR_FILE, WATCH_TEST_QR_CONTENT_PW);
    console.log(`${sender.name}: Verifying local audio playback...`);
    await verifyAudioStreamOnPagePw(sender.page, sender.name, true, true); // Watch test audio (local playback)

    console.log(`${sender.name}: Clicking "Share Video" button again to stop sharing...`);
    await sender.page.locator(SHARE_VIDEO_BUTTON_SELECTOR).click();
    await expect(sender.page.locator(`${SHARE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
    console.log(`${sender.name}: "Share Video" button indicates video sharing stopped.`);
    await expect(sender.page.locator(LOCAL_VIDEO_CONTAINER_SELECTOR_FILE)).toBeHidden({ timeout: getEffectiveTimeout(sender.page) });
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
        await audioButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Audio button ON.`);
        await sender.page.waitForTimeout(1000); // Wait briefly before next action

        console.log(`${sender.name}: Clicking video button.`);
        await videoButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Video button ON.`);
    } else { // videoFirst
        console.log(`${sender.name}: Clicking video button.`);
        await videoButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Video button ON.`);
        await sender.page.waitForTimeout(1000); // Wait briefly before next action

        console.log(`${sender.name}: Clicking audio button.`);
        await audioButton.waitFor({ state: 'visible', timeout: getEffectiveTimeout(sender.page) });
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Audio button ON.`);
    }

    console.log(`${sender.name}: Waiting for stream propagation...`);
    await sender.page.waitForTimeout(2000); // Main wait after both media types are enabled

    // Verify streams on receivers
    for (const receiver of receivers) {
        console.log(`${receiver.name}: Verifying audio stream...`);
        await verifyAudioStreamOnPagePw(receiver.page, receiver.name, true, false); // Mic audio, not watch test
        
        console.log(`${receiver.name}: Verifying video stream...`);
        await expect(receiver.page.locator(REMOTE_VIDEO_ELEMENT_SELECTOR)).toBeVisible({ timeout: getEffectiveTimeout(receiver.page, 2) });
        console.log(`${receiver.name}: Remote video element found.`);
        await verifyVideoStreamOnPagePw(receiver.page, receiver.name, REMOTE_VIDEO_ELEMENT_SELECTOR, CAMERA_TEST_QR_CONTENT_PW);
    }

    // Turn off media in reverse order of activation
    if (order === 'audioFirst') { // Activated A then V. Turn off V then A.
        console.log(`${sender.name}: Clicking video button to turn OFF.`);
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Video button OFF.`);
        await sender.page.waitForTimeout(500);

        console.log(`${sender.name}: Clicking audio button to turn OFF.`);
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Audio button OFF.`);
    } else { // videoFirst. Activated V then A. Turn off A then V.
        console.log(`${sender.name}: Clicking audio button to turn OFF.`);
        await audioButton.click();
        await expect(sender.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
        console.log(`${sender.name}: Audio button OFF.`);
        await sender.page.waitForTimeout(500);

        console.log(`${sender.name}: Clicking video button to turn OFF.`);
        await videoButton.click();
        await expect(sender.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}:not([class*="bg-blue-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(sender.page) });
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
    expectedQrContent: string, // Still used to determine if it's a camera feed or other (like watch test)
    expectedAudio: boolean,
    pageName: string, // For logging
    browserName?: string // Added browserName
): Promise<void> {
    console.log(`${pageName}: Verifying downloaded video file: ${filePath}`);
    console.log(`${pageName}: Expected QR/Source type (content: "${expectedQrContent}"), Expected Audio: ${expectedAudio}, Browser: ${browserName}`);

    const numFramesToAnalyze = 4;
    const analysisResult = await extractFramesAndAnalyzeVideoFileNode(
        filePath,
        expectedQrContent,
        expectedAudio,
        numFramesToAnalyze,
        browserName
    );

    expect(analysisResult.error, `Error during video file analysis: ${analysisResult.error}`).toBeUndefined();

    const isFirefoxCamera = browserName === 'firefox' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW;
    const isWebKitCamera = browserName === 'webkit' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW;

    if (isFirefoxCamera) {
        // --- YUV Verification for Firefox Camera Recording ---
        console.log(`${pageName}: Performing YUV verification for Firefox camera recording.`);
        expect(analysisResult.yuvFramesAnalysis, `${pageName}: yuvFramesAnalysis should be defined for Firefox camera.`).toBeDefined();
        expect(analysisResult.yuvFramesAnalysis!.length, `${pageName}: Expected ${numFramesToAnalyze} YUV frames.`).toBe(numFramesToAnalyze);

        const collectedMidLuminanceChroma: { cb: number | null, cr: number | null }[] = [];
        const minPercentageOfMidLuminancePixels = 0.15; // Adjusted threshold for recorded video

        analysisResult.yuvFramesAnalysis!.forEach((yuvResult, index) => {
            console.log(`${pageName}: Frame ${index} YUV Analysis: ` +
                        `Pixel Percentage=${(yuvResult.percentageOfPixelsInYTolerance * 100).toFixed(2)}%, ` +
                        `Avg Cb=${yuvResult.averageCbForMidLuminancePixels?.toFixed(2)}, ` +
                        `Avg Cr=${yuvResult.averageCrForMidLuminancePixels?.toFixed(2)}`);

            expect(yuvResult.error, `Error in YUV analysis for frame ${index}: ${yuvResult.error}`).toBeUndefined();
            expect(yuvResult.percentageOfPixelsInYTolerance).toBeGreaterThanOrEqual(minPercentageOfMidLuminancePixels);
            expect(yuvResult.averageCbForMidLuminancePixels).not.toBeNull();
            expect(yuvResult.averageCrForMidLuminancePixels).not.toBeNull();

            collectedMidLuminanceChroma.push({
                cb: yuvResult.averageCbForMidLuminancePixels,
                cr: yuvResult.averageCrForMidLuminancePixels
            });
        });

        // Verify that the average Cb and Cr value combinations change, indicating a dynamic video
        const uniqueCbCrPairs = new Set(
            collectedMidLuminanceChroma.map(chroma => `${chroma.cb?.toFixed(1)},${chroma.cr?.toFixed(1)}`)
        );
        // For a 2-peer recording, we expect to see dynamic content from both, leading to changes.
        // If only one stream was dynamic, this might still pass if that one stream is captured well.
        expect(uniqueCbCrPairs.size).toBeGreaterThan(1); // Expect at least some change
        console.log(`${pageName}: Video YUV dynamism verified (${uniqueCbCrPairs.size} unique avg (Cb,Cr) pairs from ${numFramesToAnalyze} frames).`);

    } else if (isWebKitCamera) {
        // --- OCR Verification for WebKit Camera Recording ---
        console.log(`${pageName}: Performing OCR verification for WebKit camera recording (timestamp format HH:MM:SS.mmm).`);
        expect(analysisResult.ocrFramesAnalysis, `${pageName}: ocrFramesAnalysis should be defined for WebKit camera.`).toBeDefined();
        expect(analysisResult.ocrFramesAnalysis!.length, `${pageName}: Expected ${numFramesToAnalyze} OCR frames.`).toBe(numFramesToAnalyze);

        const foundTimestamps = new Set<string>();
        const timestampRegex = /\d{2}:\d{2}:\d{2}\.\d{3}/;

        analysisResult.ocrFramesAnalysis!.forEach((ocrFrame, index) => {
            console.log(`${pageName}: Frame ${index} OCR Analysis: Text: "${ocrFrame.ocrResult?.text}", Confidence: ${ocrFrame.ocrResult?.confidence}`);
            expect(ocrFrame.ocrResult?.error, `Error in OCR analysis for frame ${index}: ${ocrFrame.ocrResult?.error}`).toBeUndefined();
            
            if (ocrFrame.ocrResult?.text) {
                const match = ocrFrame.ocrResult.text.match(timestampRegex);
                if (match && match[0]) {
                    foundTimestamps.add(match[0]);
                    console.log(`${pageName}: Found timestamp "${match[0]}" in frame ${index} (Confidence: ${ocrFrame.ocrResult.confidence}). Total unique: ${foundTimestamps.size}`);
                }
            }
        });
        
        expect(foundTimestamps.size, `${pageName}: Expected to find at least 2 different timestamps in recorded video OCR analysis, found ${foundTimestamps.size}. Timestamps: ${Array.from(foundTimestamps).join(', ')}`).toBeGreaterThanOrEqual(2);
        console.log(`${pageName}: WebKit recorded video OCR verification successful. Found ${foundTimestamps.size} unique timestamps.`);

    } else { // Default to QR Code Verification (Chromium Camera or other QR-based tests like Watch)
        console.log(`${pageName}: Performing QR code verification (Browser: ${browserName}, Expected Content: ${expectedQrContent}).`);
        const allFoundQrs: { result: string, points: { x: number, y: number }[], frameIndex: number }[] = [];
        let totalQrDetections = 0;

        analysisResult.framesAnalysis.forEach(frameAnalysis => {
            totalQrDetections += frameAnalysis.qrResults.length;
            frameAnalysis.qrResults.forEach(qr => {
                allFoundQrs.push({ ...qr, frameIndex: frameAnalysis.frameIndex });
                expect(qr.result).toBe(expectedQrContent); // Verify QR content

                const xCoords = qr.points.map(p => p.x);
                const yCoords = qr.points.map(p => p.y);
                const minX = Math.min(...xCoords);
                const maxX = Math.max(...xCoords);
                const minY = Math.min(...yCoords);
                const maxY = Math.max(...yCoords);
                const qrWidth = maxX - minX;
                const qrHeight = maxY - minY;
                const tolerance = Math.min(qrWidth, qrHeight) * 0.20; // 20% tolerance
                expect(Math.abs(qrWidth - qrHeight)).toBeLessThanOrEqual(tolerance); // Verify squareness
            });
        });

        console.log(`${pageName}: Found ${totalQrDetections} QR code detections across ${analysisResult.framesAnalysis.length} analyzed frames.`);
        expect(totalQrDetections).toBeGreaterThanOrEqual(numFramesToAnalyze * 1); // Expect at least one QR per frame on average
        // For a 2-peer recording, expect more QRs (e.g. 1.5x numFrames)
        if (expectedQrContent === CAMERA_TEST_QR_CONTENT_PW) { // Only apply stricter check for camera test recordings
             expect(totalQrDetections).toBeGreaterThanOrEqual(numFramesToAnalyze * 1.5);
        }


        if (allFoundQrs.length > 1) {
            const qrMinXCoords = allFoundQrs.map(qr => Math.min(...qr.points.map(p => p.x)));
            const uniqueXCoords = new Set(qrMinXCoords);
            expect(uniqueXCoords.size).toBeGreaterThan(1); // Verify movement
            console.log(`${pageName}: Video QR movement verified (${uniqueXCoords.size} unique X positions).`);
        } else if (allFoundQrs.length === 1 && numFramesToAnalyze > 1) {
            console.warn(`${pageName}: Only one QR code instance found across multiple frames. Movement not robustly verified.`);
        } else if (allFoundQrs.length === 0) {
             console.error(`${pageName}: No QR codes found in analyzed frames.`);
             expect(allFoundQrs.length).toBeGreaterThan(0); // Fail if no QRs found
        }
    }

    // --- Audio Verification (Common for both YUV and QR paths) ---
    if (expectedAudio) {
        expect(analysisResult.audioAnalysis).not.toBeNull();
        expect(analysisResult.audioAnalysis?.err).toBeUndefined();
        // Check if any "frequency" (placeholder for audio activity) was detected
        const audioActivityDetected = analysisResult.audioAnalysis!.frequencies.some(f => f !== null && f > -50); // Using -50dB as threshold from node analysis
        expect(audioActivityDetected, `${pageName}: Expected audio activity to be detected in the recording.`).toBe(true);
        
        const uniqueFreqs = new Set(analysisResult.audioAnalysis!.frequencies.filter(f => f !== null));
        
        const isWatchTestRecording = expectedQrContent === WATCH_TEST_QR_CONTENT_PW;
        let conditionDescription = "";

        if (isWatchTestRecording) {
            // Watch test audio is a chirp from a file, expect multiple distinct "frequencies" (levels) for all browsers.
            expect(uniqueFreqs.size).toBeGreaterThan(1);
            conditionDescription = ">1 (watch test recording)";
        } else { // Mic test recording (from CAMERA_TEST_QR_CONTENT_PW context)
            if (browserName === 'chromium') {
                // Chromium mic audio uses a chirp, expect multiple distinct "frequencies" (levels).
                expect(uniqueFreqs.size).toBeGreaterThan(1);
                conditionDescription = `>1 (Chromium mic recording)`;
            } else if (browserName === 'webkit' || browserName === 'firefox') {
                // WebKit and Firefox mic audio use a sine wave or simpler audio, expect at least one "frequency" (level).
                expect(uniqueFreqs.size).toBeGreaterThanOrEqual(1);
                conditionDescription = `>=1 (${browserName} mic recording)`;
            } else {
                // Default case for other browsers (if any) for mic recording.
                // Assuming lenient for unhandled browsers, similar to WebKit/Firefox.
                expect(uniqueFreqs.size).toBeGreaterThanOrEqual(1);
                conditionDescription = `>=1 (${browserName || 'unknown browser'} mic recording)`;
            }
        }
        console.log(`${pageName}: Audio presence verified (Found ${uniqueFreqs.size} unique 'frequency' indicators/levels, expected ${conditionDescription}).`);
    } else {
        if (analysisResult.audioAnalysis) { // Audio might not have been analyzed if expectedAudio was false from start
            const audioActivityDetected = analysisResult.audioAnalysis.frequencies.some(f => f !== null && f > -50);
            expect(audioActivityDetected).toBe(false);
            console.log(`${pageName}: Verified audio is silent or not present as expected.`);
        } else {
            console.log(`${pageName}: Audio analysis was not performed (as expectedAudio=false), considered silent.`);
        }
    }
    console.log(`${pageName}: Video file verification completed for ${filePath}.`);
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
    await videoButtonA.waitFor({ state: 'visible', timeout: getEffectiveTimeout(pageInfoA.page) });
    await videoButtonA.click();
    await expect(pageInfoA.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoA.page) });
    console.log(`${pageInfoA.name}: Video button ON.`);

    // 2. Enable camera on Page B
    console.log(`${pageInfoB.name}: Clicking video button.`);
    const videoButtonB = pageInfoB.page.locator(TOGGLE_VIDEO_BUTTON_SELECTOR);
    await videoButtonB.waitFor({ state: 'visible', timeout: getEffectiveTimeout(pageInfoB.page) });
    await videoButtonB.click();
    await expect(pageInfoB.page.locator(`${TOGGLE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoB.page) });
    console.log(`${pageInfoB.name}: Video button ON.`);

    // 3. Enable mic on Page A
    console.log(`${pageInfoA.name}: Clicking audio button.`);
    const audioButtonA = pageInfoA.page.locator(TOGGLE_AUDIO_BUTTON_SELECTOR);
    await audioButtonA.waitFor({ state: 'visible', timeout: getEffectiveTimeout(pageInfoA.page) });
    await audioButtonA.click();
    await expect(pageInfoA.page.locator(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoA.page) });
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
    await verifyAudioStreamOnPagePw(pageInfoB.page, pageInfoB.name, true, false); // Mic audio, not watch test

    // 7. Start recording on Page A
    console.log(`${pageInfoA.name}: Clicking record button.`);
    const recordButtonA = pageInfoA.page.locator(RECORD_BUTTON_SELECTOR);
    await recordButtonA.waitFor({ state: 'visible', timeout: getEffectiveTimeout(pageInfoA.page) });
    await recordButtonA.click();
    await expect(pageInfoA.page.locator(`${RECORD_BUTTON_SELECTOR}[class*="bg-red-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoA.page) });
    console.log(`${pageInfoA.name}: Record button ON.`);

    // 8. Start recording on Page B
    console.log(`${pageInfoB.name}: Clicking record button.`);
    const recordButtonB = pageInfoB.page.locator(RECORD_BUTTON_SELECTOR);
    await recordButtonB.waitFor({ state: 'visible', timeout: getEffectiveTimeout(pageInfoB.page) });
    await recordButtonB.click();
    await expect(pageInfoB.page.locator(`${RECORD_BUTTON_SELECTOR}[class*="bg-red-600"]`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoB.page) });
    console.log(`${pageInfoB.name}: Record button ON.`);

    // 9. Wait for recording duration
    console.log(`Waiting ${recordingDurationMs}ms for recording...`);
    await pageInfoA.page.waitForTimeout(recordingDurationMs);

    // 10. Stop recording on Page A (triggers download_A)
    console.log(`${pageInfoA.name}: Clicking record button to stop and download.`);
    const downloadPromiseA = pageInfoA.page.waitForEvent('download', {timeout: getEffectiveTimeout(pageInfoA.page, 2)});
    await recordButtonA.click();
    await expect(pageInfoA.page.locator(`${RECORD_BUTTON_SELECTOR}:not([class*="bg-red-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoA.page) });
    const downloadA = await downloadPromiseA;
    const filePathA = path.join(MEDIA_SETUP_DIR_PW, `recording_${pageInfoA.name.replace(' ', '_')}_${Date.now()}.webm`);
    await downloadA.saveAs(filePathA);
    console.log(`${pageInfoA.name}: Downloaded recording to ${filePathA}`);

    // 11. Stop recording on Page B (triggers download_B)
    console.log(`${pageInfoB.name}: Clicking record button to stop and download.`);
    const downloadPromiseB = pageInfoB.page.waitForEvent('download', {timeout: getEffectiveTimeout(pageInfoB.page, 2)});
    await recordButtonB.click();
    await expect(pageInfoB.page.locator(`${RECORD_BUTTON_SELECTOR}:not([class*="bg-red-600"])`)).toBeVisible({ timeout: getEffectiveTimeout(pageInfoB.page) });
    const downloadB = await downloadPromiseB;
    const filePathB = path.join(MEDIA_SETUP_DIR_PW, `recording_${pageInfoB.name.replace(' ', '_')}_${Date.now()}.webm`);
    await downloadB.saveAs(filePathB);
    console.log(`${pageInfoB.name}: Downloaded recording to ${filePathB}`);

    // 12. Analyze download_A
    // Expected: 2 QRs (CAMERA_TEST_QR_CONTENT_PW from local, CAMERA_TEST_QR_CONTENT_PW from remote B), movement for both, audio chirp (from A's mic).
    // OR YUV dynamics for Firefox
    const browserNameA = pageInfoA.page.context().browser()?.browserType().name();
    await verifyVideoFilePw(filePathA, CAMERA_TEST_QR_CONTENT_PW, true, `${pageInfoA.name} recording`, browserNameA);

    // 13. Analyze download_B
    // Expected: 2 QRs (CAMERA_TEST_QR_CONTENT_PW from local, CAMERA_TEST_QR_CONTENT_PW from remote A), movement for both, audio chirp (from A's mic, received by B).
    // OR YUV dynamics for Firefox
    const browserNameB = pageInfoB.page.context().browser()?.browserType().name();
    await verifyVideoFilePw(filePathB, CAMERA_TEST_QR_CONTENT_PW, true, `${pageInfoB.name} recording`, browserNameB);

    // Cleanup: Turn off media
    console.log(`${pageInfoA.name}: Turning off audio and video.`);
    await audioButtonA.click();
    await videoButtonA.click();
    console.log(`${pageInfoB.name}: Turning off video.`);
    await videoButtonB.click();

    console.log(`--- Recording Test Completed ---`);
}
