import type { Page } from 'puppeteer';
import QrCode from 'qrcode-reader';
import Jimp from 'jimp'; // Corrected import for Jimp v0.16+
import { type Bitmap } from "@jimp/types"; // Corrected import for Bitmap
// import fs from 'fs/promises'; // Only if saving debug screenshots

// --- Browser-Side Audio Analysis ---

export interface AudioAnalysisResult {
    frequencies: (number | null)[];
    peakAmplitudes: (number | null)[];
    err?: any; // Store error object if evaluation fails
}

// NOTE: This function is stringified and executed in the browser context via page.evaluate()
// It cannot access variables from the Node.js scope directly.
// It's moved here from mic.test.ts
export async function analyzeAudioInBrowser(
    analysisType: 'frequency' | 'amplitude',
    options: {
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

        console.log('Searching for playing, unmuted <audio> or <video> elements with audio tracks...');
        const mediaElements = document.querySelectorAll('audio, video');
        console.log(` Found ${mediaElements.length} media elements.`);

        for (const el of mediaElements) {
            const mediaElement = el as HTMLAudioElement | HTMLVideoElement;
            const container = mediaElement.closest('div[id^="test-local-video-"], div[id^="test-remote-video-"], div[id*="stream-container"]'); // More generic container check
            console.log(`  Checking element: Tag=${mediaElement.tagName}, Muted=${mediaElement.muted}, Paused=${mediaElement.paused}, SrcObject Type=${typeof mediaElement.srcObject}, In Test Container=${!!container}`);

            if (container && !mediaElement.muted && !mediaElement.paused && mediaElement.srcObject instanceof MediaStream) {
                const stream = mediaElement.srcObject;
                const audioTracks = stream.getAudioTracks();
                console.log(`   Stream found in container ${container.id || 'unknown'}: StreamID=${stream.id}, Active=${stream.active}, Audio Tracks=${audioTracks.length}`);

                if (stream.active && audioTracks.length > 0 && audioTracks.some(track => track.enabled)) {
                    console.log(`   Found suitable playing stream in ${mediaElement.tagName} element.`);
                    try {
                        sourceNode = audioCtx.createMediaStreamSource(stream);
                        console.log(`   Successfully created source node from stream ${stream.id}.`);
                        break;
                    } catch (err) {
                         console.warn(`   Could not create source node from stream ${stream.id}: ${(err as Error).message}`);
                         sourceNode = null;
                    }
                } else {
                    console.log(`   Stream ${stream.id} is inactive or has no enabled audio tracks.`);
                }
            } else {
                 console.log(`   Element is muted, paused, has no valid MediaStream srcObject, or not in a recognized test container.`);
            }
        }

        if (!sourceNode) {
            console.error('Failed to find any suitable playing, unmuted audio stream source in a test container.');
            results.peakAmplitudes = analysisType === 'amplitude' ? [null] : [];
            results.frequencies = []; // Ensure frequencies is also empty
            return results;
        }

        console.log(`Successfully connected sourceNode for analysis.`);
        sourceNode.connect(analyser);

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
            if (maxIndex === -1 || maxAmp < silenceThresholdDb!) { // Added non-null assertion for silenceThresholdDb
                console.log(` Freq Analysis: Detected low amplitude (${maxAmp.toFixed(2)} dB), returning null.`);
                return null;
            }
            const nyquist = audioCtx!.sampleRate / 2; // Added non-null assertion for audioCtx
            const frequency = maxIndex * nyquist / bufferLength;
            console.log(` Freq Analysis: Max Amp ${maxAmp.toFixed(2)} dB at Index ${maxIndex}, Calculated Freq: ${frequency.toFixed(2)} Hz`);
            return frequency;
        }

        function getPeakAmplitude(): number | null { // Return null if analyser is not present
             if (!analyser) return null;
             analyser.getFloatFrequencyData(dataArray);
             let maxAmp = -Infinity;
             for (let i = 0; i < bufferLength; i++) {
                 if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
                     maxAmp = dataArray[i];
                 }
             }
             if (maxAmp === -Infinity) { // No valid signal found
                console.log(` Amp Analysis: No valid signal detected, returning null.`);
                return null;
             }
             console.log(` Amp Analysis: Peak Amplitude: ${maxAmp.toFixed(2)} dB`);
             return maxAmp;
        }

        if (analysisType === 'frequency') {
            for (let i = 0; i < MAX_FREQ_SAMPLES; i++) {
                if (i > 0) {
                    const randomInterval = Math.random() * 1000 + 2000; // 2000ms to 3000ms
                    console.log(` Waiting ${randomInterval.toFixed(0)}ms for next sample...`);
                    await new Promise(resolve => setTimeout(resolve, randomInterval));
                } else {
                    console.log(' Initial 1000ms delay for analyser stabilization...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                console.log(` Taking frequency sample ${i + 1}/${MAX_FREQ_SAMPLES}...`);
                const currentFreq = getDominantFrequency();
                results.frequencies.push(currentFreq);

                if (results.frequencies.length >= 2) {
                    const lastFreq = results.frequencies[results.frequencies.length - 1];
                    const prevFreq = results.frequencies[results.frequencies.length - 2];
                    if (lastFreq !== null && prevFreq !== null && lastFreq !== prevFreq) {
                        console.log(` Detected frequency change (${prevFreq.toFixed(2)} Hz -> ${lastFreq.toFixed(2)} Hz). Stopping sampling early.`);
                        break;
                    }
                }
            }
        } else { // amplitude analysis
            console.log(' Initial 500ms delay for analyser stabilization...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(` Taking amplitude sample 1/1...`);
            results.peakAmplitudes.push(getPeakAmplitude());
        }
    } catch (error) {
        console.error(`Error during audio analysis in browser: ${(error as Error).message}`);
        results.err = { message: (error as Error).message, stack: (error as Error).stack };
        // Ensure arrays are initialized even on error, if not already
        if (!results.frequencies) results.frequencies = [];
        if (!results.peakAmplitudes) results.peakAmplitudes = analysisType === 'amplitude' ? [null] : [];

    } finally {
        console.log("Cleaning up audio analysis resources...");
        if (sourceNode && analyser) {
            try {
                sourceNode.disconnect(analyser);
                console.log(" Disconnected source node from analyser.");
            } catch (e) {
                console.warn("Could not disconnect source node:", (e as Error).message);
            }
        }
        // Note: Do not disconnect analyser from context destination if it wasn't connected there.
        // Only disconnect what was explicitly connected.
        if (audioCtx) {
            try {
                await audioCtx.close();
                console.log(" Closed AudioContext.");
            } catch (e) {
                console.warn("Could not close AudioContext:", (e as Error).message);
            }
        }
    }

    console.log("--- Audio Analysis Complete --- Results:", JSON.stringify(results));
    return results;
}


// --- Browser-Side QR Code Decoding from Screenshot ---
// Moved from camera.test.ts

// Define the type for the QR code decoding result explicitly
export interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[]; // Or more specific type if available from qrcode-reader
}

const qr = new QrCode();

// Convert qr.decode to a promise with a timeout
async function decodeQrCodeWithTimeout(bitmap: Bitmap, timeoutMs: number = 2000): Promise<QrCodeResult | null> {
    const decodePromise = new Promise<QrCodeResult | null>((resolve, reject) => {
        qr.callback = (err: Error | null, value?: QrCodeResult) => { // Make value optional
            if (err) {
                reject(err);
            } else if (!value || !value.result) { // Check if value or value.result is missing
                // qrcode-reader calls callback with (null, undefined) if not found
                resolve(null); // Resolve with null if QR code is not found
            } else {
                resolve(value);
            }
        };
        qr.decode(bitmap);
    });

    const timeoutPromise = new Promise<null>((_, reject) => { // Changed to Promise<null> for timeout
        setTimeout(() => reject(new Error(`QR code decoding timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([decodePromise, timeoutPromise]);
    } catch (error) {
        if ((error as Error).message.includes("timed out")) {
            console.warn((error as Error).message); // Log timeout as warning
            return null; // Return null on timeout
        }
        throw error; // Re-throw other errors
    }
}

export async function takeScreenshotAndDecodeQR(
    page: Page,
    screenshotElementSelector?: string, // Optional: selector for a specific element to screenshot
    maxAttempts: number = 3,
    retryDelayMs: number = 500
): Promise<QrCodeResult | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Taking screenshot and attempting to decode QR code...`);
        try {
            let screenshotBuffer: Buffer;
            if (screenshotElementSelector) {
                const element = await page.waitForSelector(screenshotElementSelector, { visible: true });
                if (!element) {
                    console.error(` Attempt ${attempt}: Element ${screenshotElementSelector} not found.`);
                    throw new Error(`Element ${screenshotElementSelector} not found.`);
                }
                screenshotBuffer = await element.screenshot({ type: 'png' }) as Buffer;
                 console.log(` Attempt ${attempt}: Screenshot of element ${screenshotElementSelector} taken, buffer size: ${screenshotBuffer.length}`);
            } else {
                screenshotBuffer = await page.screenshot({ type: 'png' }) as Buffer;
                console.log(` Attempt ${attempt}: Full page screenshot taken, buffer size: ${screenshotBuffer.length}`);
            }
            // Optional: Save screenshot for debugging
            // await fs.writeFile(`./debug-screenshot-attempt-${attempt}.png`, screenshotBuffer);

            const image = await Jimp.read(screenshotBuffer);
            console.log(` Attempt ${attempt}: Screenshot read into Jimp image.`);

            const result = await decodeQrCodeWithTimeout(image.bitmap, 2000); // 2s timeout for decoding

            console.log(` Attempt ${attempt}: QR code decoding attempt complete.`);
            if (result && result.result) { // Ensure result and result.result are valid
                console.log(` Attempt ${attempt}: QR Code decoded successfully: ${result.result}`);
                return result; // Return the full QrCodeResult object
            }
            console.log(` Attempt ${attempt}: QR Code not found or could not be decoded (result: ${result}).`);

        } catch (error) {
            console.error(` Attempt ${attempt}: Error during screenshot or QR decoding:`, (error as Error).message);
        }

        if (attempt < maxAttempts) {
            console.log(` Waiting ${retryDelayMs}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    console.error(`Failed to decode QR code after ${maxAttempts} attempts.`);
    return null;
}
