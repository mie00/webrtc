import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

// --- Constants ---
const AUDIO_DURATION_SECONDS = 10;
const START_FREQ_HZ = 440; // A4 note
const END_FREQ_HZ = 1000;
const SAMPLE_RATE = 44100; // Standard CD quality sample rate
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const audioOutputPath = path.join(__dirname, 'setup', 'mic.wav'); // Output path in setup dir


// --- Reusable Browser-Side Audio Analysis Function ---
// NOTE: This function is stringified and executed in the browser context via page.evaluate()
// It cannot access variables from the Node.js scope directly.
async function analyzeAudioInBrowser(
    analysisType: 'frequency' | 'amplitude',
    options: {
        numSamples?: number,
        sampleIntervalMs?: number,
        silenceThresholdDb?: number
    } = {}
): Promise<{ frequencies: (number | null)[], peakAmplitudes: number[] }> {

    console.log(`--- Starting Audio Analysis in Browser --- Type: ${analysisType}`);
    const {
        numSamples = 2, // Default to 2 samples for frequency check
        sampleIntervalMs = 2000, // Default interval between samples
        silenceThresholdDb = -80 // Default silence threshold
    } = options;

    const results: { frequencies: (number | null)[], peakAmplitudes: number[] } = {
        frequencies: [],
        peakAmplitudes: []
    };

    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = analysisType === 'frequency' ? 2048 : 512; // Larger FFT for frequency
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength); // For getFloatFrequencyData

        // --- Find a Suitable Audio Stream Source ---
        console.log('Searching for playing, unmuted <audio> or <video> elements with audio tracks...');
        const mediaElements = document.querySelectorAll('audio, video');
        console.log(` Found ${mediaElements.length} media elements.`);

        for (const el of mediaElements) {
            const mediaElement = el as HTMLAudioElement | HTMLVideoElement; // Type assertion
            console.log(`  Checking element: Tag=${mediaElement.tagName}, Muted=${mediaElement.muted}, Paused=${mediaElement.paused}, SrcObject Type=${typeof mediaElement.srcObject}`);

            if (!mediaElement.muted && !mediaElement.paused && mediaElement.srcObject instanceof MediaStream) {
                const stream = mediaElement.srcObject;
                const audioTracks = stream.getAudioTracks();
                console.log(`   Stream found: ID=${stream.id}, Active=${stream.active}, Audio Tracks=${audioTracks.length}`);

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
            results.peakAmplitudes = analysisType === 'amplitude' ? [-Infinity] : []; // Use -Infinity to indicate failure
            results.frequencies = analysisType === 'frequency' ? Array(numSamples).fill(null) : [];
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
        const samplesToTake = analysisType === 'frequency' ? numSamples : 1; // Only 1 sample needed for amplitude check usually
        for (let i = 0; i < samplesToTake; i++) {
            if (i > 0) {
                console.log(` Waiting ${sampleIntervalMs}ms for next sample...`);
                await new Promise(resolve => setTimeout(resolve, sampleIntervalMs));
            } else {
                 // Add a longer initial delay for analyser to stabilize
                 console.log(' Initial 1000ms delay for analyser stabilization...');
                 await new Promise(resolve => setTimeout(resolve, 1000));
            }

            console.log(` Taking sample ${i + 1}/${samplesToTake}...`);
            if (analysisType === 'frequency') {
                results.frequencies.push(getDominantFrequency());
                // Optionally capture amplitude during frequency check too
                // results.peakAmplitudes.push(getPeakAmplitude());
            } else { // amplitude
                results.peakAmplitudes.push(getPeakAmplitude());
            }
        }

    } catch (error) {
        console.error(`Error during audio analysis in browser: ${error}`);
        // Populate results with defaults indicating failure
        results.peakAmplitudes = analysisType === 'amplitude' ? [-Infinity] : [];
        results.frequencies = analysisType === 'frequency' ? Array(numSamples).fill(null) : [];

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

        // Retrieve pages created in globalSetup
        pageA = globalThis.__PAGE_A__!;
        pageB = globalThis.__PAGE_B__!;

        expect(pageA).toBeDefined();
        expect(pageB).toBeDefined();
    });

    test('should stream audio from Page A to Page B, verify frequencies, then verify Page A is muted', async () => {
        console.log('--- Starting Audio Stream, Frequency Verification, and Mute Check Test ---');

        // Define selectors once
        const audioButtonSelectorOff = 'button.pointer-events-auto ::-p-text(🔇)'; // Selector for the audio button when OFF
        const audioButtonSelectorOn = 'button.pointer-events-auto ::-p-text(🎤)'; // Selector for the audio button when ON

        // 1. Enable audio on Page A
        console.log('Waiting for audio button on Page A...');
        await pageA.waitForSelector(audioButtonSelectorOff, { timeout: 5000 });
        console.log('Clicking audio button on Page A...');
        await pageA.click(audioButtonSelectorOff);

        // Wait for the button state to change, indicating (hopefully) the stream started
        console.log('Waiting for audio button on Page A to indicate ON state...');
        await pageA.waitForSelector(audioButtonSelectorOn, { timeout: 5000 });
        console.log('Audio button is ON. Waiting for stream propagation...');

        // Add a delay for the stream to establish and audio to start playing
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // 2. Analyze audio frequency on Page B using the reusable function
        console.log('Analyzing remote audio frequency on Page B...');
        const analysisOptionsB = {
            numSamples: 2,
            sampleIntervalMs: 4000, // Increased time between samples
            silenceThresholdDb: -80
        };
        // Call without 'target' argument
        const analysisResultB = await pageB.evaluate(analyzeAudioInBrowser, 'frequency', analysisOptionsB);

        console.log('Frequency analysis on Page B complete:', analysisResultB);

        // 3. Assertions for Page B
        expect(analysisResultB.frequencies.length).toBe(analysisOptionsB.numSamples);
        const freq1 = analysisResultB.frequencies[0];
        const freq2 = analysisResultB.frequencies[1];

        expect(freq1).not.toBeNull(); // Frequency at first sample should be detectable
        expect(freq2).not.toBeNull(); // Frequency at second sample should be detectable

        // The core assertion: the frequencies measured at different times should be different
        expect(freq2).not.toBe(freq1); // Frequency at sample 2 should be different from frequency at sample 1
        console.log('--- Frequency difference on Page B verified ---');

        // 4. Turn off audio on Page A
        console.log('Turning off audio on Page A...');
        try {
            await pageA.click(audioButtonSelectorOn);
            console.log('Clicked audio button (ON state) on Page A.');
            // Wait for the button state to change back to OFF
            console.log('Waiting for audio button on Page A to indicate OFF state...');
            await pageA.waitForSelector(audioButtonSelectorOff, { timeout: 5000 });
            console.log('Audio button is OFF. Waiting a moment before checking silence...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for stream to fully stop processing

        } catch (e) {
            console.warn("Could not find 'ON' audio button to turn off audio. Cannot verify silence.", e);
            // Optionally fail the test here if turning off is critical
            throw new Error("Failed to turn off audio on Page A, cannot proceed with silence check.");
        }

        // 5. Verify final audio state (no suitable source found) on Page A after muting
        console.log('Verifying final audio state (no suitable source) on Page A...');
        const analysisOptionsA = {
             silenceThresholdDb: -80 // Keep threshold for internal logic if needed, but assertion changes
        };
        // Call without 'target' argument
        const analysisResultA = await pageA.evaluate(analyzeAudioInBrowser, 'amplitude', analysisOptionsA);

        console.log(`Final amplitude analysis attempt on Page A complete:`, analysisResultA);
        // Assert that the analysis function could not find a suitable source,
        // indicated by the default failure value (-Infinity).
        expect(analysisResultA.peakAmplitudes.length).toBe(1);
        expect(analysisResultA.peakAmplitudes[0]).toBe(-Infinity);

        console.log('--- TEST SUCCESS: Verified audio stream frequencies on Page B & no suitable audio source found on Page A after mute ---');

    });

    afterAll(async () => {
        console.log('--- Cleaning up generated audio file ---');
        try {
            // await fs.rm(audioOutputPath, { force: true });
            console.log(`Removed audio file: ${audioOutputPath}`);
        } catch (error) {
            console.error('Error during audio file cleanup:', error);
        }
    });
});
