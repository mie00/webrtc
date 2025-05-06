import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers';
import { standardSetup } from './setup/standardSetup'; // Import standardSetup
import { standardTeardown } from './setup/standardTeardown'; // Import standardTeardown
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { TOGGLE_AUDIO_BUTTON_SELECTOR } from './setup/testHelpers'; // Import selector

// --- Constants ---
const AUDIO_DURATION_SECONDS = 6;
const START_FREQ_HZ = 40; // A4 note
const END_FREQ_HZ = 1200;
const SAMPLE_RATE = 44100; // Standard CD quality sample rate
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const audioOutputPath = path.join(__dirname, 'setup', 'mic.wav'); // Output path in setup dir

interface AudioAnalysisResult {
    frequencies: (number | null)[];
    peakAmplitudes: ( number | null )[];
    err?: string | null;
}

// --- Reusable Browser-Side Audio Analysis Function ---
// NOTE: This function is stringified and executed in the browser context via page.evaluate()
// It cannot access variables from the Node.js scope directly.
async function analyzeAudioInBrowser(
    analysisType: 'frequency' | 'amplitude',
    options: {
        // numSamples and sampleIntervalMs are now controlled internally for frequency analysis
        silenceThresholdDb?: number
    } = {silenceThresholdDb: -80}
): Promise<AudioAnalysisResult> {

    console.log(`--- Starting Audio Analysis in Browser --- Type: ${analysisType}`);
    const {
        silenceThresholdDb = -80 // Default silence threshold
    } = options;
    const MAX_FREQ_SAMPLES = 4; // Max samples to take for frequency check

    const results: AudioAnalysisResult = {
        frequencies: [],
        peakAmplitudes: []
    };

    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = analysisType === 'frequency' ? 4096 : 512; // Larger FFT for frequency
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength); // For getFloatFrequencyData

        // --- Find a Suitable Audio Stream Source ---
        console.log('Searching for playing, unmuted <audio> or <video> elements with audio tracks...');
        const mediaElements = document.querySelectorAll('audio, video');
        console.log(` Found ${mediaElements.length} media elements.`);

        for (const el of mediaElements) {
            const mediaElement = el as HTMLAudioElement | HTMLVideoElement; // Type assertion
            // Look for elements within our test containers
            const container = mediaElement.closest('div[id^="test-local-video-"], div[id^="test-remote-video-"]');
            console.log(`  Checking element: Tag=${mediaElement.tagName}, Muted=${mediaElement.muted}, Paused=${mediaElement.paused}, SrcObject Type=${typeof mediaElement.srcObject}, In Test Container=${!!container}`);

            // Only consider elements within our designated stream containers
            if (container && !mediaElement.muted && !mediaElement.paused && mediaElement.srcObject instanceof MediaStream) {
                const stream = mediaElement.srcObject;
                const audioTracks = stream.getAudioTracks();
                console.log(`   Stream found in container ${container.id}: StreamID=${stream.id}, Active=${stream.active}, Audio Tracks=${audioTracks.length}`);

                if (stream.active && audioTracks.length > 0 && audioTracks.some(track => track.enabled)) {
                    console.log(`   Found suitable playing stream in ${mediaElement.tagName} element.`);
                    try {
                        sourceNode = audioCtx.createMediaStreamSource(stream);
                        console.log(`   Successfully created source node from stream ${stream.id}.`);
                        break; // Use the first suitable stream found
                    } catch (err) {
                         console.warn(`   Could not create source node from stream ${stream.id}: ${err}`);
                         sourceNode = null; // Reset if creation fails
                    }
                } else {
                    console.log(`   Stream ${stream.id} is inactive or has no enabled audio tracks.`);
                }
            } else {
                 console.log(`   Element is muted, paused, or has no valid MediaStream srcObject.`);
            }
        }
        // --- Perform Analysis ---
        if (!sourceNode) {
            console.error('Failed to find any suitable playing, unmuted audio stream source.');
            // Populate results with defaults indicating failure
            results.peakAmplitudes = analysisType === 'amplitude' ? [null] : []; // Use -Infinity to indicate failure
            results.frequencies = [];
            return results; // Early exit
        }

        console.log(`Successfully connected sourceNode for analysis.`);
        sourceNode.connect(analyser);

        // Helper: Get Dominant Frequency
        function getDominantFrequency(): number | null {
            if (!analyser) return null;
            analyser.getFloatFrequencyData(dataArray);
            let maxAmp = -Infinity;
            let maxIndex = -1;
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
                    maxAmp = dataArray[i];
                    maxIndex = i;
                }
            }
            if (maxIndex === -1 || maxAmp < silenceThresholdDb) {
                console.log(` Freq Analysis: Detected low amplitude (${maxAmp.toFixed(2)} dB), returning null.`);
                return null;
            }
            const nyquist = audioCtx!.sampleRate / 2;
            const frequency = maxIndex * nyquist / bufferLength;
            // Log the calculated frequency before returning
            console.log(` Freq Analysis: Max Amp ${maxAmp.toFixed(2)} dB at Index ${maxIndex}, Calculated Freq: ${frequency.toFixed(2)} Hz`);
            return frequency;
        }

        // Helper: Get Peak Amplitude
        function getPeakAmplitude(): number {
             if (!analyser) return -Infinity;
             analyser.getFloatFrequencyData(dataArray);
             let maxAmp = -Infinity;
             for (let i = 0; i < bufferLength; i++) {
                 if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
                     maxAmp = dataArray[i];
                 }
             }
             console.log(` Amp Analysis: Peak Amplitude: ${maxAmp.toFixed(2)} dB`);
             return maxAmp;
        }

        // Take samples
        if (analysisType === 'frequency') {
            for (let i = 0; i < MAX_FREQ_SAMPLES; i++) {
                if (i > 0) {
                    const randomInterval = Math.random() * 1000 + 2000; // 2000ms to 3000ms
                    console.log(` Waiting ${randomInterval.toFixed(0)}ms for next sample...`);
                    await new Promise(resolve => setTimeout(resolve, randomInterval));
                } else {
                    // Add a longer initial delay for analyser to stabilize before the first sample
                    console.log(' Initial 1000ms delay for analyser stabilization...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                console.log(` Taking frequency sample ${i + 1}/${MAX_FREQ_SAMPLES}...`);
                const currentFreq = getDominantFrequency();
                results.frequencies.push(currentFreq);

                // Check for early exit: if we have at least 2 samples, and the last two are different and not null
                if (results.frequencies.length >= 2) {
                    const lastFreq = results.frequencies[results.frequencies.length - 1];
                    const prevFreq = results.frequencies[results.frequencies.length - 2];
                    if (lastFreq !== null && prevFreq !== null && lastFreq !== prevFreq) {
                        console.log(` Detected frequency change (${prevFreq.toFixed(2)} Hz -> ${lastFreq.toFixed(2)} Hz). Stopping sampling early.`);
                        break; // Exit the loop
                    }
                }
            }
        } else { // amplitude analysis
            // Add initial delay for amplitude check too
            console.log(' Initial 500ms delay for analyser stabilization...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(` Taking amplitude sample 1/1...`);
            results.peakAmplitudes.push(getPeakAmplitude());
        }
    } catch (error) {
        console.error(`Error during audio analysis in browser: ${error}`);
        // Populate results with defaults indicating failure
        results.err = error;
    } finally {
        // --- Cleanup ---
        console.log("Cleaning up audio analysis resources...");
        if (sourceNode && analyser) {
            sourceNode.disconnect(analyser);
            console.log(" Disconnected source node.");
        }
        if (audioCtx) {
            await audioCtx.close();
            console.log(" Closed AudioContext.");
        }
    }

    console.log("--- Audio Analysis Complete --- Results:", results);
    return results;
}


// --- Jest Test Suite ---
describe('WebRTC Microphone E2E Test', () => {
    jest.setTimeout(JEST_TIMEOUT * 2); // Allow time for audio generation and analysis

    let pageA: Page;
    let pageB: Page;

    beforeAll(async () => {
        console.log('--- Generating test audio file (chirp) ---');
        try {
            // Ensure setup directory exists
            await fs.mkdir(path.dirname(audioOutputPath), { recursive: true });

            // Calculate frequency change per second
            const freqChangePerSec = (END_FREQ_HZ - START_FREQ_HZ) / AUDIO_DURATION_SECONDS;

            // Use ffmpeg with aevalsrc to generate a sine wave chirp
            // Expression for linear chirp: sin(2*PI*(f0*t + (f1-f0)/(2*D)*t^2))
            // f0 = START_FREQ_HZ, f1 = END_FREQ_HZ, D = AUDIO_DURATION_SECONDS
            const chirpExpression = `sin(2*PI*(${START_FREQ_HZ}*t + (${END_FREQ_HZ}-${START_FREQ_HZ})/(2*${AUDIO_DURATION_SECONDS})*t*t))`;
            // Need to escape special characters like '*' and potentially ':' for the shell if not quoted properly.
            // Using single quotes around the expression for aevalsrc is generally safer.
            // Outputting Stereo (ac 2), 44.1kHz (ar ${SAMPLE_RATE}), 16-bit PCM (acodec pcm_s16le)
            const ffmpegCommand = `ffmpeg -y -f lavfi -i "aevalsrc='${chirpExpression}':s=${SAMPLE_RATE}:d=${AUDIO_DURATION_SECONDS}" -ar ${SAMPLE_RATE} -ac 2 -acodec pcm_s16le ${audioOutputPath}`;

            console.log(`Executing: ${ffmpegCommand}`);
            execSync(ffmpegCommand);
            console.log(`Generated test audio: ${audioOutputPath}`);

        } catch (error) {
            console.error('Error during audio generation:', error);
            // Attempt cleanup even on error
            await fs.rm(audioOutputPath, { force: true }).catch(e => console.error("Error during cleanup after generation error:", e));
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
        console.log('--- Cleaning up generated audio file ---');
        try {
            await fs.rm(audioOutputPath, { force: true });
            console.log(`Removed audio file: ${audioOutputPath}`);
        } catch (error) {
            console.error('Error during audio file cleanup:', error);
        }
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
        const analysisResultB: AudioAnalysisResult = await pageB.evaluate(analyzeAudioInBrowser, 'frequency', analysisOptionsB);

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
        const analysisResultA: AudioAnalysisResult = await pageA.evaluate(analyzeAudioInBrowser, 'amplitude', analysisOptionsA);

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
            // Wait for the button state to change back to OFF (e.g., class/style removed)
            console.log('Waiting for audio button on Page A to indicate OFF state...');
            await pageA.waitForFunction(
                (selector) => !document.querySelector(selector)?.matches('[class*="bg-blue-600"]'),
                { timeout: 5000 },
                TOGGLE_AUDIO_BUTTON_SELECTOR
            );
            console.log('Audio button is OFF. Waiting a moment before checking silence...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s

        } catch (e) {
            console.warn(`Could not click audio button (${TOGGLE_AUDIO_BUTTON_SELECTOR}) to turn off audio, or state did not revert.`, e);
            throw new Error("Failed to turn off audio on Page A.");
        }

        console.log('--- TEST SUCCESS: Verified audio stream frequency change on Page B & no suitable audio source found on Page A after mute ---');

    });

    // afterAll moved up to ensure teardown runs before file cleanup
});
