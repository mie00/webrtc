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
    target: 'local' | 'remote',
    analysisType: 'frequency' | 'amplitude',
    options: {
        numSamples?: number,
        sampleIntervalMs?: number,
        silenceThresholdDb?: number
    } = {}
): Promise<{ frequencies: (number | null)[], peakAmplitudes: number[] }> {

    console.log(`--- Starting Audio Analysis in Browser --- Target: ${target}, Type: ${analysisType}`);
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

        // --- Find the Audio Stream Source ---
        console.log(`Searching for ${target} audio stream...`);
        let streamFound = false;

        if (target === 'remote') {
            // Method 1: Find <audio> element
            const audioElements = document.querySelectorAll('audio');
            console.log(` Found ${audioElements.length} <audio> elements.`);
            for (const el of audioElements) {
                console.log(`  Checking audio element: muted=${el.muted}, srcObject type=${typeof el.srcObject}`);
                if (el.srcObject && el.srcObject instanceof MediaStream) {
                    const stream = el.srcObject;
                    console.log(`   Stream found: id=${stream.id}, active=${stream.active}, audio tracks=${stream.getAudioTracks().length}`);
                    if (stream.active && stream.getAudioTracks().length > 0) {
                        console.log('   Found suitable remote stream via <audio> element.');
                        sourceNode = audioCtx.createMediaStreamSource(stream);
                        streamFound = true;
                        break;
                    }
                }
            }
            // Method 2: Fallback to window.app.viewStreams
            if (!streamFound && window.app && window.app.viewStreams) {
                console.warn(' Could not find suitable <audio> element. Trying window.app.viewStreams...');
                console.log(` Available stream keys in window.app.viewStreams: ${Object.keys(window.app.viewStreams).join(', ')}`);
                const streamId = Object.keys(window.app.viewStreams).find(id => {
                    const stream = window.app.viewStreams[id];
                    console.log(`  Checking viewStream ${id}: active=${stream?.active}, audio tracks=${stream?.getAudioTracks()?.length}`);
                    return stream && stream.active && stream.getAudioTracks().length > 0;
                });
                if (streamId) {
                    const remoteStream = window.app.viewStreams[streamId];
                    console.log(` Found potential remote stream via viewStreams with ID: ${streamId}`);
                    sourceNode = audioCtx.createMediaStreamSource(remoteStream);
                    streamFound = true;
                } else {
                    console.warn(' No suitable stream found in window.app.viewStreams.');
                }
            }
        } else { // target === 'local'
            const MAX_RETRIES = 3;
            const RETRY_DELAY_MS = 500;
            for (let attempt = 1; attempt <= MAX_RETRIES && !streamFound; attempt++) {
                console.log(` Attempt ${attempt}/${MAX_RETRIES} to find local audio stream...`);
                if (window.app && window.app.localStreams) {
                    console.log(`  Available stream keys in window.app.localStreams: ${Object.keys(window.app.localStreams).join(', ')}`);
                    const streamId = Object.keys(window.app.localStreams).find(id => {
                        const streamData = window.app.localStreams[id];
                        console.log(`   Checking local stream ${id}: type=${streamData?.type}, active=${streamData?.stream?.active}, audio tracks=${streamData?.stream?.getAudioTracks()?.length}`);
                        // Find the audio stream, active state might vary depending on when this is called
                        return streamData && streamData.type === 'audio' && streamData.stream?.getAudioTracks().length > 0;
                    });

                    if (streamId) {
                        const streamData = window.app.localStreams[streamId];
                        const localStream = streamData.stream;
                        const audioTracks = localStream?.getAudioTracks() ?? [];
                        const isTrackEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
                        const isStreamActive = localStream?.active;
                        console.log(`  Found local audio stream: ${localStream?.id}. Active: ${isStreamActive}, Track Enabled: ${isTrackEnabled}.`);

                        // Need to handle cases where stream exists but might be inactive/muted for amplitude check
                        if (localStream) {
                             try {
                                sourceNode = audioCtx.createMediaStreamSource(localStream);
                                streamFound = true; // Found the stream container, analysis will determine level
                                console.log(`   Created source node for local stream ${localStream.id}`);
                                break; // Exit loop
                             } catch (err) {
                                 console.warn(`   Could not create source node from stream ${localStream.id} (attempt ${attempt}): ${err}`);
                                 sourceNode = null;
                             }
                        }
                    } else {
                        console.warn(`  Attempt ${attempt}: No suitable stream found yet in window.app.localStreams.`);
                    }
                } else {
                    console.warn(`  Attempt ${attempt}: window.app or window.app.localStreams not found.`);
                }
                if (!streamFound && attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }

        // --- Perform Analysis ---
        if (!sourceNode) {
            console.error(`Failed to find ${target} audio stream source.`);
            // Populate results with defaults indicating failure
            results.peakAmplitudes = analysisType === 'amplitude' ? [-Infinity] : [];
            results.frequencies = analysisType === 'frequency' ? Array(numSamples).fill(null) : [];
            return results; // Early exit
        }

        console.log(`Successfully created sourceNode for ${target} analysis.`);
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
            console.log(` Freq Analysis: Max Amp ${maxAmp.toFixed(2)} dB at Index ${maxIndex}, Freq: ${frequency.toFixed(2)} Hz`);
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
                 // Add a small initial delay for analyser to stabilize
                 await new Promise(resolve => setTimeout(resolve, 500));
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
            sampleIntervalMs: 2000, // Time between samples
            silenceThresholdDb: -80
        };
        const analysisResultB = await pageB.evaluate(analyzeAudioInBrowser, 'remote', 'frequency', analysisOptionsB);

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

        // 5. Verify final audio state (silence) on Page A using the reusable function
        console.log('Verifying final audio state (silence) on Page A...');
        const analysisOptionsA = {
             silenceThresholdDb: -80 // Use the threshold defined in the function
        };
        const analysisResultA = await pageA.evaluate(analyzeAudioInBrowser, 'local', 'amplitude', analysisOptionsA);

        console.log(`Final amplitude analysis on Page A complete:`, analysisResultA);
        // Assert that the final audio level is below the silence threshold
        expect(analysisResultA.peakAmplitudes.length).toBe(1); // Should have one amplitude sample
        const finalPeakAmplitude = analysisResultA.peakAmplitudes[0];
        expect(finalPeakAmplitude).toBeLessThan(analysisOptionsA.silenceThresholdDb); // Check that audio is effectively silent after muting

        console.log('--- TEST SUCCESS: Verified audio stream frequencies on Page B & final silence on Page A ---');

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
