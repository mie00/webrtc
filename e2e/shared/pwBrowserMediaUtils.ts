import type { Page as PlaywrightPage } from '@playwright/test'; // Renamed to avoid conflict
import QrCode from 'qrcode-reader';
// Jimp needs to be imported differently depending on its version and setup.
// Assuming a setup compatible with: import Jimp from 'jimp';
import Jimp from 'jimp';
import { type Bitmap } from "@jimp/types";
// import fs from 'fs/promises'; // Only if saving debug screenshots

// --- Browser-Side Audio Analysis ---
// (This function is identical to the one in __tests__/e2e/shared/browserMediaUtils.ts
//  as it's designed to be stringified and run in the browser. Only its TS signature might differ if needed)
export interface AudioAnalysisResult {
    frequencies: (number | null)[];
    peakAmplitudes: (number | null)[];
    err?: any;
}

export async function analyzeAudioInBrowser(
    analysisType: 'frequency' | 'amplitude',
    options: {
        silenceThresholdDb?: number
    } = {silenceThresholdDb: -80}
): Promise<AudioAnalysisResult> {
    // This function's body is executed in the browser context.
    // It's copied verbatim from the original browserMediaUtils.ts
    console.log(`--- Starting Audio Analysis in Browser --- Type: ${analysisType}`);
    const {
        silenceThresholdDb = -80
    } = options;
    const MAX_FREQ_SAMPLES = 4;

    const results: AudioAnalysisResult = {
        frequencies: [],
        peakAmplitudes: []
    };

    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = analysisType === 'frequency' ? 4096 : 512;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);

        console.log('Searching for playing, unmuted <audio> or <video> elements with audio tracks...');
        const mediaElements = document.querySelectorAll('audio, video');
        console.log(` Found ${mediaElements.length} media elements.`);

        for (const el of mediaElements) {
            const mediaElement = el as HTMLAudioElement | HTMLVideoElement;
            const container = mediaElement.closest('div[id^="test-local-video-"], div[id^="test-remote-video-"], div[id*="stream-container"]');
            console.log(`  Checking element: Tag=${mediaElement.tagName}, Muted=${mediaElement.muted}, Paused=${mediaElement.paused}, SrcObject Type=${typeof mediaElement.srcObject}, In Test Container=${!!container}`);

            if (container && !mediaElement.muted && !mediaElement.paused) {
                if (mediaElement.srcObject instanceof MediaStream) {
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
                    try {
                        sourceNode = audioCtx.createMediaElementSource(mediaElement);
                        console.log(`   Successfully created source node from HTML5 Media Element.`);
                        break;
                    } catch (err) {
                         console.warn(`   Could not create source node from HTML5 Media Element: ${(err as Error).message}`);
                         sourceNode = null;
                    }
                }
            } else {
                 console.log(`   Element is muted, paused, has no valid MediaStream srcObject, or not in a recognized test container.`);
            }
        }

        if (!sourceNode) {
            console.error('Failed to find any suitable playing, unmuted audio stream source in a test container.');
            results.peakAmplitudes = analysisType === 'amplitude' ? [null] : [];
            results.frequencies = [];
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
            if (maxIndex === -1 || maxAmp < silenceThresholdDb!) {
                console.log(` Freq Analysis: Detected low amplitude (${maxAmp.toFixed(2)} dB), returning null.`);
                return null;
            }
            const nyquist = audioCtx!.sampleRate / 2;
            const frequency = maxIndex * nyquist / bufferLength;
            console.log(` Freq Analysis: Max Amp ${maxAmp.toFixed(2)} dB at Index ${maxIndex}, Calculated Freq: ${frequency.toFixed(2)} Hz`);
            return frequency;
        }

        function getPeakAmplitude(): number | null {
             if (!analyser) return null;
             analyser.getFloatFrequencyData(dataArray);
             let maxAmp = -Infinity;
             for (let i = 0; i < bufferLength; i++) {
                 if (dataArray[i] > maxAmp && isFinite(dataArray[i])) {
                     maxAmp = dataArray[i];
                 }
             }
             if (maxAmp === -Infinity) {
                console.log(` Amp Analysis: No valid signal detected, returning null.`);
                return null;
             }
             console.log(` Amp Analysis: Peak Amplitude: ${maxAmp.toFixed(2)} dB`);
             return maxAmp;
        }

        if (analysisType === 'frequency') {
            for (let i = 0; i < MAX_FREQ_SAMPLES; i++) {
                if (i > 0) {
                    const randomInterval = Math.random() * 1000 + 2000;
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
        } else {
            console.log(' Initial 500ms delay for analyser stabilization...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(` Taking amplitude sample 1/1...`);
            results.peakAmplitudes.push(getPeakAmplitude());
        }
    } catch (error) {
        console.error(`Error during audio analysis in browser: ${(error as Error).message}`);
        results.err = { message: (error as Error).message, stack: (error as Error).stack };
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
export interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[];
}

const qr = new QrCode();

async function decodeQrCodeWithTimeout(bitmap: Bitmap, timeoutMs: number = 2000): Promise<QrCodeResult | null> {
    const decodePromise = new Promise<QrCodeResult | null>((resolve, reject) => {
        qr.callback = (err: Error | null, value?: QrCodeResult) => {
            if (err) {
                reject(err);
            } else if (!value || !value.result) {
                resolve(null);
            } else {
                resolve(value);
            }
        };
        qr.decode(bitmap);
    });

    const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error(`QR code decoding timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([decodePromise, timeoutPromise]);
    } catch (error) {
        if ((error as Error).message.includes("timed out")) {
            console.warn((error as Error).message);
            return null;
        }
        throw error;
    }
}

export async function takeScreenshotAndDecodeQR(
    page: PlaywrightPage, // Use Playwright's Page type
    screenshotElementSelector?: string,
    maxAttempts: number = 3,
    retryDelayMs: number = 500
): Promise<QrCodeResult | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Taking screenshot and attempting to decode QR code...`);
        try {
            let screenshotBuffer: Buffer;
            if (screenshotElementSelector) {
                const element = page.locator(screenshotElementSelector);
                await element.waitFor({ state: 'visible', timeout: 5000 }); // Playwright's waitFor
                screenshotBuffer = await element.screenshot({ type: 'png' });
                console.log(` Attempt ${attempt}: Screenshot of element ${screenshotElementSelector} taken, buffer size: ${screenshotBuffer.length}`);
            } else {
                screenshotBuffer = await page.screenshot({ type: 'png' });
                console.log(` Attempt ${attempt}: Full page screenshot taken, buffer size: ${screenshotBuffer.length}`);
            }

            // await fs.writeFile(`./debug-screenshot-attempt-${attempt}.png`, screenshotBuffer); // For debugging

            const image = await Jimp.read(screenshotBuffer);
            // await image.writeAsync(`./debug-image-attempt-${attempt}.png`); // For debugging
            console.log(` Attempt ${attempt}: Screenshot read into Jimp image.`);

            const result = await decodeQrCodeWithTimeout(image.bitmap, 2000);

            console.log(` Attempt ${attempt}: QR code decoding attempt complete.`);
            if (result && result.result) {
                console.log(` Attempt ${attempt}: QR Code decoded successfully: ${result.result}`);
                return result;
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
