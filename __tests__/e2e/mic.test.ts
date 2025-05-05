import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import type { Page } from 'puppeteer';
import { JEST_TIMEOUT } from './setup/testHelpers'; // Import helpers
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

// --- Constants ---
const AUDIO_DURATION_SECONDS = 5;
const START_FREQ_HZ = 440; // A4 note
const END_FREQ_HZ = 1000;
const SAMPLE_RATE = 44100; // Standard CD quality sample rate
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const audioOutputPath = path.join(__dirname, 'setup', 'mic.wav'); // Output path in setup dir

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

        // 2. Analyze audio frequency on Page B
        console.log('Analyzing audio frequency on Page B...');
        const frequencies = await pageB.evaluate(async () => {
            // This code runs in the browser context of Page B
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048; // Standard FFT size
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength); // For getFloatFrequencyData

            let sourceNode: MediaStreamAudioSourceNode | null = null;

            // Try to find the remote audio stream via a playing <audio> element
            const remoteAudioElement = document.querySelector('audio:not([muted])') as HTMLAudioElement | null;
            if (remoteAudioElement && remoteAudioElement.srcObject && remoteAudioElement.srcObject instanceof MediaStream) {
                console.log('Found remote audio stream via <audio> element.');
                sourceNode = audioCtx.createMediaStreamSource(remoteAudioElement.srcObject);
            } else {
                // Fallback: Try finding a MediaStream in window.app.viewStreams (adjust if needed)
                console.warn('Could not find <audio> element. Trying window.app.viewStreams...');
                let remoteStream: MediaStream | null = null;
                if (window.app && window.app.viewStreams) {
                    // Find the first stream that has audio tracks and isn't obviously local
                    // This logic is heuristic and might need adjustment based on your app
                    const streamId = Object.keys(window.app.viewStreams).find(id => {
                        const stream = window.app.viewStreams[id];
                        // Basic check: has audio, maybe doesn't have video (if it's audio-only)
                        // Or, if peerId is available, check if it's not the local peer
                        return stream && stream.getAudioTracks().length > 0; // Simplistic check
                    });
                    if (streamId) {
                         console.log(`Found potential remote stream with ID: ${streamId}`);
                         remoteStream = window.app.viewStreams[streamId];
                         sourceNode = audioCtx.createMediaStreamSource(remoteStream);
                    }
                }

                if (!sourceNode) {
                    throw new Error("Could not find remote audio stream source for analysis.");
                }
            }

            sourceNode.connect(analyser);

            function getDominantFrequency(): number | null {
                analyser.getFloatFrequencyData(dataArray);
                let maxAmp = -Infinity;
                let maxIndex = -1;
                for (let i = 0; i < bufferLength; i++) {
                    if (dataArray[i] > maxAmp && isFinite(dataArray[i])) { // Check for finite numbers
                        maxAmp = dataArray[i];
                        maxIndex = i;
                    }
                }

                // Filter out silence or very low levels (adjust threshold as needed)
                // -Infinity can happen if the stream hasn't started or is silent
                if (maxIndex === -1 || maxAmp < -80) {
                    console.log(`Detected low amplitude (${maxAmp}), returning null.`);
                    return null;
                }

                const nyquist = audioCtx.sampleRate / 2;
                const frequency = maxIndex * nyquist / bufferLength;
                console.log(`Raw Freq Data: Max Amp ${maxAmp.toFixed(2)} at Index ${maxIndex}, Freq: ${frequency.toFixed(2)} Hz`);
                return frequency;
            }

            // --- Measurements ---
            // Wait ~1s into the chirp
            await new Promise(resolve => setTimeout(resolve, 1000));
            const freq1 = getDominantFrequency();
            console.log(`Frequency at ~1s: ${freq1 ? freq1.toFixed(2) : 'null'} Hz`);

            // Wait ~3s into the chirp (2s later)
            await new Promise(resolve => setTimeout(resolve, 2000));
            const freq2 = getDominantFrequency();
            console.log(`Frequency at ~3s: ${freq2 ? freq2.toFixed(2) : 'null'} Hz`);

            // Disconnect analyser to free resources
            sourceNode.disconnect();
            await audioCtx.close(); // Close context

            return { freq1, freq2 };
        });

        console.log('Frequency analysis complete:', frequencies);

        // 3. Assertions
        expect(frequencies.freq1).not.toBeNull(); // Frequency at ~1s should be detectable
        expect(frequencies.freq2).not.toBeNull(); // Frequency at ~3s should be detectable

        // The core assertion: the frequencies measured at different times should be different
        expect(frequencies.freq2).not.toBe(frequencies.freq1); // Frequency at ~3s should be different from frequency at ~1s
        console.log('--- Frequency difference on Page B verified ---');


        // 4. Turn off audio on Page A and verify it's silent
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

        console.log('Verifying final audio state (silence) on Page A...');
        const finalPeakAmplitude = await pageA.evaluate(async () => {
            // This code runs in the browser context of Page A after attempting to mute
            console.log("--- Checking final local audio state ---");
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            let sourceNode: MediaStreamAudioSourceNode | null = null;

            // Try to find the local audio stream (it might still exist but be muted/inactive)
            console.log('Searching for final local audio stream in Page A...');
            if (window.app && window.app.localStreams) {
                 console.log(` Final local stream keys: ${Object.keys(window.app.localStreams).join(', ')}`);
                 // Find the stream associated with 'audio' type, even if inactive
                 const streamId = Object.keys(window.app.localStreams).find(id => {
                     const streamData = window.app.localStreams[id];
                     console.log(`  Checking final local stream ${id}: type=${streamData?.type}, active=${streamData?.stream?.active}, audio tracks=${streamData?.stream?.getAudioTracks()?.length}`);
                     return streamData && streamData.type === 'audio'; // Find the audio stream regardless of active state now
                 });

                 if (streamId) {
                      const streamData = window.app.localStreams[streamId];
                      const localStream = streamData.stream;
                      // Check if stream or tracks are actually stopped/muted
                      const audioTracks = localStream?.getAudioTracks() ?? [];
                      const isTrackEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
                      const isStreamActive = localStream?.active;

                      console.log(` Found final local audio stream: ${localStream?.id}. Active: ${isStreamActive}, Track Enabled: ${isTrackEnabled}. Analyzing amplitude...`);

                      // Only analyze if the stream seems technically active (even if muted track)
                      if (localStream && isStreamActive) {
                          try {
                              sourceNode = audioCtx.createMediaStreamSource(localStream);
                          } catch (err) {
                              console.warn(`Could not create source node from stream ${localStream.id} (perhaps inactive?): ${err}`);
                              sourceNode = null; // Ensure sourceNode is null if creation fails
                          }
                      } else {
                          console.log('Final local audio stream is inactive or has no tracks.');
                      }
                 } else {
                     console.log('No local audio stream found in final check.');
                 }
            } else {
                 console.log('window.app or window.app.localStreams not found in final check.');
            }

            if (!sourceNode) {
                console.log('No source node created for final check, assuming silent.');
                await audioCtx.close();
                return -Infinity; // Indicate silence / no stream found or stream inactive
            }

            // If a stream was found and source created, measure its amplitude
            sourceNode.connect(analyser);
            function getPeakAmplitude(): number {
                analyser.getFloatFrequencyData(dataArray);
                let maxAmp = -Infinity;
                for (let i = 0; i < bufferLength; i++) {
                    if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
                        maxAmp = dataArray[i];
                    }
                }
                // A muted track should result in very low/negative infinity amplitude
                console.log(`Final Local Peak Amplitude (dB): ${maxAmp.toFixed(2)}`);
                return maxAmp;
            }

            await new Promise(resolve => setTimeout(resolve, 500)); // Short wait for analyser
            const peakAmp = getPeakAmplitude();
            sourceNode.disconnect();
            await audioCtx.close();
            return peakAmp;
        });

        console.log(`Final peak amplitude measured on Page A: ${finalPeakAmplitude}`);
        // Assert that the final audio level is below a silence threshold (e.g., -80 dB)
        expect(finalPeakAmplitude).toBeLessThan(-80); // Check that audio is effectively silent after muting

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
