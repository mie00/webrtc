import type { Page as PlaywrightPage } from '@playwright/test';
import { expect } from '@playwright/test';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
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
    PW_TIMEOUT, // Use Playwright timeout
} from '../setup/pwTestHelpers'; // Use Playwright helpers

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // This will be e2e/shared

// Store generated media in a Playwright-specific subdirectory within e2e/setup
const MEDIA_SETUP_DIR_PW = path.join(__dirname, '..', 'setup', 'generated-media-pw');
const REMOTE_VIDEO_CONTAINER_SELECTOR = 'div.stream-container[id^="test-remote-video-"]';
const REMOTE_VIDEO_ELEMENT_SELECTOR = `${REMOTE_VIDEO_CONTAINER_SELECTOR} video`;
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
    await cleanupMedia([micTestAudioPathPw], []); // No specific temp dir for chirp audio
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
    cameraTestTempFramesDirPw = videoGenResult.tempFramesDir;
}
export async function teardownCameraTestMediaPw(): Promise<void> {
    const dirsToClean = cameraTestTempFramesDirPw ? [cameraTestTempFramesDirPw] : [];
    await cleanupMedia([cameraTestVideoPathPw], dirsToClean);
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
    watchTestTempVideoFramesDirPw = videoGenResult.tempFramesDir;

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
    const dirsToClean = watchTestTempVideoFramesDirPw ? [watchTestTempVideoFramesDirPw] : [];
    await cleanupMedia(watchTestFilesToCleanPw, dirsToClean);
}

// --- Helper Verification Functions (Playwright) ---
async function verifyAudioStreamOnPagePw(page: PlaywrightPage, pageName: string, expectedToPlay: boolean = true): Promise<void> {
    console.log(`${pageName}: Verifying audio stream (expected: ${expectedToPlay ? 'playing' : 'silent/no source'})...`);
    const analysisOptions = { analysisType: 'frequency', silenceThresholdDb: -70 };
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
        qrMinXCoords.push(Math.min(...qrResult.points.map(p => p.x)));
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
        const analysisResultA: AudioAnalysisResult = await sender.page.evaluate(analyzeAudioInBrowser, {analysisType: 'amplitude', silenceThresholdDb: -80});
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
