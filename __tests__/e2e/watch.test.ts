import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import {
    generateMovingQrVideoFile,
    generateChirpAudioFile,
    combineAudioAndVideo,
    cleanupMedia,
    DEFAULT_VIDEO_WIDTH,
    DEFAULT_VIDEO_HEIGHT,
    DEFAULT_AUDIO_DURATION_SECONDS, // Use audio duration for video frames
    DEFAULT_QR_SIZE,
    DEFAULT_BG_COLOR,
    DEFAULT_VIDEO_FRAMERATE,
    DEFAULT_START_FREQ_HZ,
    DEFAULT_END_FREQ_HZ,
    DEFAULT_SAMPLE_RATE
} from './shared/mediaGeneration';
import { analyzeAudioInBrowser, takeScreenshotAndDecodeQR, type AudioAnalysisResult, type QrCodeResult } from './shared/browserMediaUtils';

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_FILES_BASE_PATH = path.join(__dirname, 'setup', 'watch_test_media');

const QR_CONTENT = "watch_test_qr";
const VIDEO_FRAMES_FOR_AUDIO_DURATION = DEFAULT_AUDIO_DURATION_SECONDS * DEFAULT_VIDEO_FRAMERATE;

const tempVideoPath = path.join(TEST_FILES_BASE_PATH, 'temp_video_qr.mp4');
const audioOutputPath = path.join(TEST_FILES_BASE_PATH, 'audio_chirp.wav');
const finalMp4Path = path.join(TEST_FILES_BASE_PATH, 'combined_video_audio.mp4');

let tempVideoFramesDir: string | undefined;
const filesToClean: string[] = [tempVideoPath, audioOutputPath, finalMp4Path];
const dirsToClean: string[] = [TEST_FILES_BASE_PATH]; // Will include tempVideoFramesDir if created

const SHARE_VIDEO_BUTTON_SELECTOR = '#test-share-video-button';
const UPLOAD_VIDEO_INPUT_SELECTOR = 'input[type="file"][accept="video/*"]'; // From MediaArea.svelte
const LOCAL_VIDEO_CONTAINER_SELECTOR_A = 'div#test-local-video-local'; // Stream key is 'local'
const LOCAL_VIDEO_ELEMENT_SELECTOR_A = `${LOCAL_VIDEO_CONTAINER_SELECTOR_A} video`;
const REMOTE_VIDEO_CONTAINER_SELECTOR_B = 'div.stream-container[id^="test-remote-video-"]'; // Generic for 2 peers
const REMOTE_VIDEO_ELEMENT_SELECTOR_B = `${REMOTE_VIDEO_CONTAINER_SELECTOR_B} video`;


describe('WebRTC Watch (Share Video File) E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT * 3); // Increased timeout for media generation, upload, and analysis

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        console.log('--- Generating test media for Watch Test ---');
        try {
            // 1. Generate MP4 video with moving QR code
            console.log(`Generating temporary QR video: ${tempVideoPath}`);
            const videoGenResult = await generateMovingQrVideoFile(
                tempVideoPath,
                QR_CONTENT,
                VIDEO_FRAMES_FOR_AUDIO_DURATION,
                DEFAULT_VIDEO_WIDTH,
                DEFAULT_VIDEO_HEIGHT,
                DEFAULT_QR_SIZE,
                DEFAULT_BG_COLOR,
                DEFAULT_VIDEO_FRAMERATE,
                'mp4' // Output directly as MP4
            );
            tempVideoFramesDir = videoGenResult.tempFramesDir;
            if (tempVideoFramesDir) dirsToClean.push(tempVideoFramesDir); // Add for cleanup

            // 2. Generate WAV audio file with chirp
            console.log(`Generating chirp audio: ${audioOutputPath}`);
            await generateChirpAudioFile(
                audioOutputPath,
                DEFAULT_AUDIO_DURATION_SECONDS,
                DEFAULT_START_FREQ_HZ,
                DEFAULT_END_FREQ_HZ,
                DEFAULT_SAMPLE_RATE
            );

            // 3. Combine video and audio into a final MP4
            console.log(`Combining video and audio into: ${finalMp4Path}`);
            await combineAudioAndVideo(tempVideoPath, audioOutputPath, finalMp4Path);

            console.log('Test media generation complete.');
        } catch (error) {
            console.error('Error during Watch Test media generation:', error);
            await cleanupMedia(filesToClean, dirsToClean);
            throw new Error(`Failed to generate test media: ${error}`);
        }

        // Run the standard setup
        const setupResult = await standardSetup();
        pageA = setupResult.pageA;
        pageB = setupResult.pageB;
    });

    afterAll(async () => {
        await standardTeardown({ pageA, pageB });
        await cleanupMedia(filesToClean, dirsToClean);
    });

    test('should share an MP4 file from Page A, play on both A & B, and verify audio/video', async () => {
        console.log('--- Starting Watch (Share Video File) Test ---');

        // 1. On Page A: Click "Share Video" button and upload the MP4 file
        console.log('Page A: Clicking "Share Video" button...');
        await pageA.waitForSelector(SHARE_VIDEO_BUTTON_SELECTOR, { visible: true });
        await pageA.click(SHARE_VIDEO_BUTTON_SELECTOR);

        console.log('Page A: Waiting for file input and uploading file...');
        const fileInputElementA = await pageA.waitForSelector(UPLOAD_VIDEO_INPUT_SELECTOR, { hidden: true }); // Input is hidden
        expect(fileInputElementA).toBeTruthy();
        await fileInputElementA!.uploadFile(finalMp4Path);
        console.log(`Page A: File "${finalMp4Path}" selected for upload.`);

        // Wait for the button to appear active (shared)
        await pageA.waitForSelector(`${SHARE_VIDEO_BUTTON_SELECTOR}[class*="bg-blue-600"]`, { timeout: 5000 });
        console.log('Page A: "Share Video" button indicates video is shared.');


        // 2. Wait for local playback to start on Page A
        console.log(`Page A: Waiting for local video element (${LOCAL_VIDEO_ELEMENT_SELECTOR_A}) to be visible...`);
        await pageA.waitForSelector(LOCAL_VIDEO_ELEMENT_SELECTOR_A, { visible: true, timeout: 10000 });
        console.log('Page A: Local video element found. Giving time for playback to start...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Allow time for video to load and play

        // 3. Verify video on Page A (Local Playback)
        console.log('Page A: Verifying local video playback (QR code movement)...');
        const localQrMinXCoordsA: number[] = [];
        for (let i = 0; i < 2; i++) { // Take 2 screenshots
            const result = await takeScreenshotAndDecodeQR(pageA, LOCAL_VIDEO_ELEMENT_SELECTOR_A);
            expect(result, `Page A: QR decoding failed on local video, screenshot ${i + 1}`).not.toBeNull();
            const qrResult = result as QrCodeResult;
            expect(qrResult.result, `Page A: QR content mismatch on local video, screenshot ${i + 1}`).toBe(QR_CONTENT);
            localQrMinXCoordsA.push(Math.min(...qrResult.points.map(p => p.x)));
            if (i < 1) await new Promise(resolve => setTimeout(resolve, 1500)); // Wait between screenshots
        }
        const uniqueLocalXCoordsA = new Set(localQrMinXCoordsA);
        expect(uniqueLocalXCoordsA.size, 'Page A: QR code did not move on local video').toBeGreaterThan(1);
        console.log('Page A: Local video QR movement verified.');

        // 4. Verify audio on Page A (Local Playback)
        console.log('Page A: Verifying local audio playback (chirp frequency change)...');
        const audioResultA: AudioAnalysisResult = await pageA.evaluate(analyzeAudioInBrowser as any, 'frequency', { silenceThresholdDb: -70 });
        expect(audioResultA.err).toBeUndefined();
        expect(audioResultA.frequencies.length).toBeGreaterThanOrEqual(2);
        audioResultA.frequencies.forEach(freq => expect(freq).not.toBeNull());
        const uniqueLocalFreqsA = new Set(audioResultA.frequencies.filter(f => f !== null));
        expect(uniqueLocalFreqsA.size, 'Page A: Audio frequency did not change on local playback').toBeGreaterThan(1);
        console.log(`Page A: Local audio chirp verified (Found ${uniqueLocalFreqsA.size} unique frequencies).`);

        // 5. Wait for remote stream to start on Page B
        console.log(`Page B: Waiting for remote video element (${REMOTE_VIDEO_ELEMENT_SELECTOR_B}) to be visible...`);
        await pageB.waitForSelector(REMOTE_VIDEO_ELEMENT_SELECTOR_B, { visible: true, timeout: 15000 });
        console.log('Page B: Remote video element found. Giving time for stream to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 6. Verify video on Page B (Remote Stream)
        console.log('Page B: Verifying remote video stream (QR code movement)...');
        const remoteQrMinXCoordsB: number[] = [];
        for (let i = 0; i < 2; i++) { // Take 2 screenshots
            const result = await takeScreenshotAndDecodeQR(pageB, REMOTE_VIDEO_ELEMENT_SELECTOR_B);
            expect(result, `Page B: QR decoding failed on remote video, screenshot ${i + 1}`).not.toBeNull();
            const qrResult = result as QrCodeResult;
            expect(qrResult.result, `Page B: QR content mismatch on remote video, screenshot ${i + 1}`).toBe(QR_CONTENT);
            remoteQrMinXCoordsB.push(Math.min(...qrResult.points.map(p => p.x)));
            if (i < 1) await new Promise(resolve => setTimeout(resolve, 1500)); // Wait between screenshots
        }
        const uniqueRemoteXCoordsB = new Set(remoteQrMinXCoordsB);
        expect(uniqueRemoteXCoordsB.size, 'Page B: QR code did not move on remote video').toBeGreaterThan(1);
        console.log('Page B: Remote video QR movement verified.');

        // 7. Verify audio on Page B (Remote Stream)
        console.log('Page B: Verifying remote audio stream (chirp frequency change)...');
        const audioResultB: AudioAnalysisResult = await pageB.evaluate(analyzeAudioInBrowser as any, 'frequency', { silenceThresholdDb: -70 });
        expect(audioResultB.err).toBeUndefined();
        expect(audioResultB.frequencies.length).toBeGreaterThanOrEqual(2);
        audioResultB.frequencies.forEach(freq => expect(freq).not.toBeNull());
        const uniqueRemoteFreqsB = new Set(audioResultB.frequencies.filter(f => f !== null));
        expect(uniqueRemoteFreqsB.size, 'Page B: Audio frequency did not change on remote stream').toBeGreaterThan(1);
        console.log(`Page B: Remote audio chirp verified (Found ${uniqueRemoteFreqsB.size} unique frequencies).`);

        // 8. On Page A: Click "Share Video" button again to stop sharing
        console.log('Page A: Clicking "Share Video" button again to stop sharing...');
        await pageA.click(SHARE_VIDEO_BUTTON_SELECTOR);
        
        // Wait for the button to appear inactive
        await pageA.waitForFunction(
            (selector) => !document.querySelector(selector)?.classList.contains('bg-blue-600'),
            { timeout: 5000 },
            SHARE_VIDEO_BUTTON_SELECTOR
        );
        console.log('Page A: "Share Video" button indicates video sharing stopped.');

        // 9. Verify local video element is removed/hidden on Page A
        console.log(`Page A: Verifying local video element (${LOCAL_VIDEO_CONTAINER_SELECTOR_A}) is no longer present...`);
        await pageA.waitForSelector(LOCAL_VIDEO_CONTAINER_SELECTOR_A, { hidden: true, timeout: 5000 });
        console.log('Page A: Local video element for shared file is hidden/removed.');

        console.log('--- TEST SUCCESS: Watch (Share Video File) verified on both pages ---');
    });
});
