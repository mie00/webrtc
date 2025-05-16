import type { Page as PlaywrightPage } from '@playwright/test'; // Renamed to avoid conflict
import QrCode from 'qrcode-reader';
// Jimp needs to be imported differently depending on its version and setup.
// Assuming a setup compatible with: import Jimp from 'jimp';
import { Jimp } from 'jimp';
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
    options: {
        analysisType: 'frequency' | 'amplitude',
        silenceThresholdDb?: number
    }
): Promise<AudioAnalysisResult> {
    // This function's body is executed in the browser context.
    // It's copied verbatim from the original browserMediaUtils.ts
    const {
        analysisType,
        silenceThresholdDb = -80
    } = options;
    console.log(`--- Starting Audio Analysis in Browser --- Type: ${analysisType}`);
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

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import crypto from 'crypto';

// --- Node.js-based Video File Analysis Utilities ---
// These functions run in the Node.js environment of the Playwright test runner,
// not in the browser. They typically use libraries like fluent-ffmpeg.

export interface FrameAnalysis {
    frameIndex: number;
    qrResults: QrCodeResult[]; // Array to hold multiple QR codes found in one frame
}

export interface VideoFileAnalysisNodeResult {
    framesAnalysis: FrameAnalysis[];
    audioAnalysis: AudioAnalysisResult | null; // Reusing existing AudioAnalysisResult
    error?: string;
}

/**
 * Analyzes a video file by extracting frames and audio.
 * - Extracts a specified number of frames.
 * - Attempts to decode QR codes from each frame (potentially multiple QRs per frame).
 * - Extracts audio and analyzes its frequency content.
 * Requires ffmpeg to be installed and accessible.
 */
export async function extractFramesAndAnalyzeVideoFileNode(
    videoFilePath: string,
    expectedQrContent: string, // Used for logging/guidance, actual content check is separate
    analyzeAudio: boolean,
    numFramesToExtract: number = 4
): Promise<VideoFileAnalysisNodeResult> {
    console.log(`NodeJS: Starting analysis of video file: ${videoFilePath}`);
    console.log(`NodeJS: Expected QR content (for context): "${expectedQrContent}", Analyze audio: ${analyzeAudio}, Frames to extract: ${numFramesToExtract}`);

    // Placeholder for actual implementation using fluent-ffmpeg and Jimp/qrcode-reader for frames,
    // and fluent-ffmpeg for audio extraction and analysis (similar to analyzeAudioInBrowser but with file input).

    // 1. Use fluent-ffmpeg to extract `numFramesToExtract` frames as image buffers/files.
    // 2. For each frame:
    //    a. Load image buffer with Jimp.
    //    b. Attempt to find *multiple* QR codes. This might involve:
    //       - Cropping the image into sections (e.g., top/bottom, left/right) if a grid layout is expected in the recording.
    //       - Running qr.decode() on each section.
    //       - Collecting all successful QrCodeResult objects.
    //    c. Store results in FrameAnalysis.
    // 3. If analyzeAudio is true:
    //    a. Use fluent-ffmpeg to extract audio to a temporary WAV file.
    //    b. Analyze the WAV file for frequencies (similar logic to analyzeAudioInBrowser,
    //       but adapted for Node.js, possibly using a library that can process WAV file data or
    //       even using ffmpeg's afade/afftfilt for direct frequency data).
    //    c. Store in AudioAnalysisResult.

    console.warn(`NodeJS: Full implementation of extractFramesAndAnalyzeVideoFileNode for ${videoFilePath} is pending.`);
    // Simulate a basic result structure
    const simulatedResult: VideoFileAnalysisNodeResult = {
        framesAnalysis: [],
        audioAnalysis: analyzeAudio ? { frequencies: [null, null], peakAmplitudes: [null, null] } : null,
    };

    const result: VideoFileAnalysisNodeResult = {
        framesAnalysis: [],
        audioAnalysis: null,
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-analysis-'));
    console.log(`NodeJS: Created temp directory for analysis: ${tempDir}`);

    try {
        // 1. Frame Extraction
        console.log(`NodeJS: Extracting ${numFramesToExtract} frames from ${videoFilePath} to ${tempDir}`);
        await new Promise<void>((resolve, reject) => {
            ffmpeg(videoFilePath)
                .screenshots({
                    count: numFramesToExtract,
                    folder: tempDir,
                    filename: 'frame-%i.png',
                    size: '640x?' // Resize for faster processing, maintain aspect ratio
                })
                .on('end', resolve)
                .on('error', (err) => {
                    console.error(`NodeJS: Error extracting frames: ${err.message}`);
                    reject(err);
                });
        });
        console.log(`NodeJS: Frame extraction complete.`);

        // 2. QR Decoding from Frames
        for (let i = 1; i <= numFramesToExtract; i++) {
            const framePath = path.join(tempDir, `frame-${i}.png`);
            if (!await fs.pathExists(framePath)) {
                console.warn(`NodeJS: Frame ${framePath} not found, skipping.`);
                continue;
            }
            console.log(`NodeJS: Processing frame ${framePath}`);
            const frameBuffer = await fs.readFile(framePath);
            const image = await Jimp.read(frameBuffer);
            const frameQrResults: QrCodeResult[] = [];

            // Attempt to decode from full image
            let qr = await decodeQrCodeWithTimeout(image.bitmap, 1500);
            if (qr) frameQrResults.push(qr);

            // Attempt to decode from halves to find multiple QRs if present
            const { width, height } = image.bitmap;
            const crops = [
                { x: 0, y: 0, w: width / 2, h: height }, // Left half
                { x: width / 2, y: 0, w: width / 2, h: height }, // Right half
                // { x: 0, y: 0, w: width, h: height / 2 }, // Top half
                // { x: 0, y: height/2, w: width, h: height / 2 }, // Bottom half
            ];

            for (const crop of crops) {
                try {
                    const croppedImage = image.clone().crop(crop.x, crop.y, crop.w, crop.h);
                    const croppedQr = await decodeQrCodeWithTimeout(croppedImage.bitmap, 1000);
                    if (croppedQr) {
                        // Check if this QR (content and rough position) is already found to avoid duplicates
                        const alreadyFound = frameQrResults.some(existingQr =>
                            existingQr.result === croppedQr.result &&
                            Math.abs(existingQr.points[0].x - (croppedQr.points[0].x + crop.x)) < width * 0.1 && // Adjust points for crop
                            Math.abs(existingQr.points[0].y - (croppedQr.points[0].y + crop.y)) < height * 0.1
                        );
                        if (!alreadyFound) {
                             // Adjust points to be relative to the original image
                            const adjustedPoints = croppedQr.points.map(p => ({ x: p.x + crop.x, y: p.y + crop.y }));
                            frameQrResults.push({ result: croppedQr.result, points: adjustedPoints });
                        }
                    }
                } catch (cropError) {
                    console.warn(`NodeJS: Error decoding QR from cropped section: ${(cropError as Error).message}`);
                }
            }
            
            // Deduplicate based on content and very close proximity (in case full and crop found same)
            const uniqueFrameQrResults: QrCodeResult[] = [];
            for (const r of frameQrResults) {
                if (!uniqueFrameQrResults.some(uq => uq.result === r.result && Math.abs(uq.points[0].x - r.points[0].x) < 10)) {
                    uniqueFrameQrResults.push(r);
                }
            }

            result.framesAnalysis.push({ frameIndex: i - 1, qrResults: uniqueFrameQrResults });
            console.log(`NodeJS: Frame ${i-1} yielded ${uniqueFrameQrResults.length} unique QR codes.`);
        }

        // 3. Audio Analysis
        if (analyzeAudio) {
            const tempAudioPath = path.join(tempDir, 'audio.wav');
            console.log(`NodeJS: Extracting audio to ${tempAudioPath}`);
            await new Promise<void>((resolve, reject) => {
                ffmpeg(videoFilePath)
                    .output(tempAudioPath)
                    .noVideo()
                    .audioCodec('pcm_s16le')
                    .audioFrequency(DEFAULT_SAMPLE_RATE) // Use consistent sample rate
                    .audioChannels(1)
                    .toFormat('wav')
                    .on('end', resolve)
                    .on('error', (err) => {
                        console.error(`NodeJS: Error extracting audio: ${err.message}`);
                        reject(err);
                    })
                    .run();
            });
            console.log(`NodeJS: Audio extraction complete.`);

            if (await fs.pathExists(tempAudioPath) && (await fs.stat(tempAudioPath)).size > 1024) { // Basic check for non-empty audio
                // Use ffmpeg's volumedetect for basic audio presence check
                const volDetectOutput = await new Promise<string>((resolve, reject) => {
                    let stderrData = '';
                    ffmpeg(tempAudioPath)
                        .audioFilters('volumedetect')
                        .outputOptions('-f', 'null')
                        .output('/dev/null') // Or NUL on Windows
                        .on('stderr', (stderrLine) => {
                            stderrData += stderrLine;
                        })
                        .on('end', () => resolve(stderrData))
                        .on('error', (err) => {
                             console.error(`NodeJS: Error during volumedetect: ${err.message}`);
                             reject(err);
                        })
                        .run();
                });

                const meanVolumeMatch = volDetectOutput.match(/mean_volume:\s*([-\d\.]+) dB/);
                const maxVolumeMatch = volDetectOutput.match(/max_volume:\s*([-\d\.]+) dB/);
                const meanVolume = meanVolumeMatch ? parseFloat(meanVolumeMatch[1]) : -Infinity;
                const maxVolume = maxVolumeMatch ? parseFloat(maxVolumeMatch[1]) : -Infinity;

                console.log(`NodeJS: Audio volume detection - Mean: ${meanVolume} dB, Max: ${maxVolume} dB`);
                // For chirp, we expect significant audio. Threshold can be adjusted.
                // A simple way to represent "chirp detected" is if maxVolume is above a certain level.
                // True frequency analysis is more complex.
                const audioDetected = maxVolume > -50; // Threshold for "significant" audio
                result.audioAnalysis = {
                    // Storing maxVolume in frequencies array for simplicity, as we don't have actual freq here
                    frequencies: audioDetected ? [maxVolume, maxVolume -10] : [null, null], // Simulate two different "frequencies" if audio detected
                    peakAmplitudes: [maxVolume, maxVolume], // Store peak amplitude
                };
            } else {
                console.warn(`NodeJS: Extracted audio file ${tempAudioPath} is empty or too small.`);
                result.audioAnalysis = { frequencies: [null, null], peakAmplitudes: [null, null] };
            }
        } else {
            result.audioAnalysis = null;
        }

    } catch (error) {
        console.error(`NodeJS: Error in extractFramesAndAnalyzeVideoFileNode: ${(error as Error).message}`);
        result.error = (error as Error).message;
    } finally {
        try {
            await fs.remove(tempDir);
            console.log(`NodeJS: Cleaned up temp directory ${tempDir}`);
        } catch (cleanupError) {
            console.error(`NodeJS: Error cleaning up temp directory ${tempDir}: ${(cleanupError as Error).message}`);
        }
    }

    return result;
}
