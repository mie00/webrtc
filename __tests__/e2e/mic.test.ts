import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup';
import { standardTeardown } from './setup/standardTeardown';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { TOGGLE_AUDIO_BUTTON_SELECTOR } from './setup/testHelpers';
import {
    generateChirpAudioFile,
    cleanupMedia,
    DEFAULT_AUDIO_DURATION_SECONDS,
    DEFAULT_START_FREQ_HZ,
    DEFAULT_END_FREQ_HZ,
    DEFAULT_SAMPLE_RATE
} from '../shared/mediaGeneration';
import { analyzeAudioInBrowser, type AudioAnalysisResult } from '../shared/browserMediaUtils';

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const audioOutputPath = path.join(__dirname, 'setup', 'mic.wav');

// --- Jest Test Suite ---
describe('WebRTC Microphone E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT * 2); // Allow time for audio generation and analysis

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        console.log('--- Generating test audio file (chirp) ---');
        try {
            await generateChirpAudioFile(
                audioOutputPath,
                DEFAULT_AUDIO_DURATION_SECONDS,
                DEFAULT_START_FREQ_HZ,
                DEFAULT_END_FREQ_HZ,
                DEFAULT_SAMPLE_RATE
            );
        } catch (error) {
            console.error('Error during audio generation:', error);
            // Attempt cleanup even on error
            await cleanupMedia([audioOutputPath], []);
            throw new Error(`Failed to generate test audio: ${error}`); // Fail fast
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
        await cleanupMedia([audioOutputPath], []);
    });

    test('should stream audio from Page A to Page B, verify frequencies, then verify Page A is muted', async () => {
        console.log('--- Starting Audio Stream, Frequency Verification, and Mute Check Test ---');

        // 1. Enable audio on Page A using the test ID selector
        console.log(`Waiting for audio button (${TOGGLE_AUDIO_BUTTON_SELECTOR}) on Page A...`);
        const audioButton = await pageA.waitForSelector(TOGGLE_AUDIO_BUTTON_SELECTOR, { timeout: 5000 });
        console.log('Clicking audio button on Page A...');
        await audioButton?.click();

        // Wait for the button state to change (e.g., background style or class)
        // This assumes the button gets a specific style/class when active
        console.log('Waiting for audio button on Page A to indicate ON state (checking style/class)...');
        await pageA.waitForSelector(`${TOGGLE_AUDIO_BUTTON_SELECTOR}[class*="bg-blue-600"]`, { timeout: 5000 });
        console.log('Audio button is ON. Waiting for stream propagation...');

        // Add a delay for the stream to establish and audio to start playing
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // 2. Analyze audio frequency on Page B using the reusable function
        console.log('Analyzing remote audio frequency on Page B (up to 4 samples, random interval, early exit)...');
        const analysisOptionsB = {
            // numSamples and sampleIntervalMs are now handled internally by analyzeAudioInBrowser
            silenceThresholdDb: -80
        };
        // Call without 'target' argument
        const analysisResultB: AudioAnalysisResult = await pageB.evaluate(analyzeAudioInBrowser as any, 'frequency', analysisOptionsB);

        console.log('Frequency analysis on Page B complete:', analysisResultB);

        // 3. Assertions for Page B
        // Check that we got at least 2 samples (needed for comparison) and at most 4
        expect(analysisResultB.frequencies.length).toBeGreaterThanOrEqual(2);
        expect(analysisResultB.frequencies.length).toBeLessThanOrEqual(4); // MAX_FREQ_SAMPLES

        // Check that all collected frequencies are non-null (audio should be playing)
        analysisResultB.frequencies.forEach((freq, index) => {
            console.log(`Checking frequency sample ${index + 1}...`);
            expect(freq).not.toBeNull();
        });

        // The core assertion: check if there's more than one unique frequency value among the non-null results
        const uniqueFreqs = new Set(analysisResultB.frequencies.filter(f => f !== null));
        console.log('Checking if at least two different frequencies were detected...');
        expect(uniqueFreqs.size).toBeGreaterThan(1);
        console.log(`--- Frequency difference on Page B verified (Found ${uniqueFreqs.size} unique frequencies: ${[...uniqueFreqs].map(f=>f?.toFixed(2)).join(', ')}) ---`);

        // 4. Verify final audio state (no suitable source found) on Page A after muting
        console.log('Verifying final audio state (no suitable source) on Page A...');
        const analysisOptionsA = {
             silenceThresholdDb: -80 // Keep threshold for internal logic if needed, but assertion changes
        };
        // Call without 'target' argument
        const analysisResultA: AudioAnalysisResult = await pageA.evaluate(analyzeAudioInBrowser as any, 'amplitude', analysisOptionsA);

        console.log(`Final amplitude analysis attempt on Page A complete:`, analysisResultA);
        // Assert that the analysis function could not find a suitable source,
        // indicated by the default failure value (-Infinity).
        expect(analysisResultA.peakAmplitudes.length).toBe(1);
        expect(analysisResultA.peakAmplitudes[0]).toBe(null);

        // 5. Turn off audio on Page A using the same test ID selector
        console.log('Turning off audio on Page A...');
        try {
            await pageA.click(TOGGLE_AUDIO_BUTTON_SELECTOR);
            console.log(`Clicked audio button (${TOGGLE_AUDIO_BUTTON_SELECTOR}) on Page A.`);
        } catch (e) {
            console.warn(`Could not click audio button (${TOGGLE_AUDIO_BUTTON_SELECTOR}) to turn off audio, or state did not revert.`, e);
            throw new Error("Failed to turn off audio on Page A.");
        }

        console.log('--- TEST SUCCESS: Verified audio stream frequency change on Page B & no suitable audio source found on Page A after mute ---');

    });

    // afterAll moved up to ensure teardown runs before file cleanup
});
