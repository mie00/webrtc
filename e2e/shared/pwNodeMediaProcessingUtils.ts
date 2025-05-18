import type { Page as PlaywrightPage } from '@playwright/test';
import QrCode from 'qrcode-reader';
// Jimp needs to be imported differently depending on its version and setup.
// Assuming a setup compatible with: import Jimp from 'jimp';
import { Jimp } from 'jimp';
import { type Bitmap } from "@jimp/types";
import Tesseract from 'tesseract.js';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_AUDIO_DURATION_SECONDS, DEFAULT_SAMPLE_RATE } from './pwMediaGeneration';
import { CAMERA_TEST_QR_CONTENT_PW } from './pwMediaTestHelpers'; // This will create a circular dependency if not careful.
                                                                    // Let's assume CAMERA_TEST_QR_CONTENT_PW might be better moved to a constants file or passed as arg.
                                                                    // For now, proceeding with the import as it exists.
import { type AudioAnalysisResult } from './pwBrowserMediaUtils'; // YuvAnalysisResult removed from this import


// --- YCbCr Analysis Result Interface ---
export interface YuvAnalysisResult {
    midLuminanceYValue: number; // e.g. 128
    yTolerancePercentage: number; // e.g. 0.10 for 10%
    percentageOfPixelsInYTolerance: number;
    averageCbForMidLuminancePixels: number | null; // Null if no pixels in tolerance
    averageCrForMidLuminancePixels: number | null; // Null if no pixels in tolerance
    error?: string;
}

// Regex for HH:MM:SS.mmm timestamp
const TIMESTAMP_REGEX = /\d{2}:\d{2}:\d{2}\.\d{3}/;

// --- OCR Helper (Node.js side) ---
export interface OcrResult {
    text: string | null;
    confidence: number;
    error?: string;
}

async function recognizeTextInImageBuffer(imageBuffer: Buffer): Promise<OcrResult> {
    try {
        const { data: { text, confidence } } = await Tesseract.recognize(imageBuffer, 'eng');
        return { text, confidence };
    } catch (error) {
        console.error(`NodeJS: Error during Tesseract OCR: ${(error as Error).message}`);
        return { text: null, confidence: 0, error: (error as Error).message };
    }
}

// --- Node.js Side QR Code Decoding from Screenshot / OCR ---
export interface QrCodeResult {
  result: string;
  points: { x: number; y: number }[];
}

const qr = new QrCode();

export async function takeScreenshotAndRecognizeText(
    page: PlaywrightPage,
    screenshotElementSelector?: string,
    maxAttempts: number = 5, // Increased attempts for text recognition
    retryDelayMs: number = 1000,
    flip: boolean = false
): Promise<OcrResult | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Taking screenshot (flip: ${flip}) and attempting OCR...`);
        try {
            let screenshotBuffer: Buffer;
            if (screenshotElementSelector) {
                const element = page.locator(screenshotElementSelector);
                await element.waitFor({ state: 'visible', timeout: 5000 });
                screenshotBuffer = await element.screenshot({ type: 'png' });
            } else {
                screenshotBuffer = await page.screenshot({ type: 'png' });
            }

            if (flip) {
                console.log(` Attempt ${attempt}: Flipping image horizontally for local stream view.`);
                const image = await Jimp.read(screenshotBuffer);
                image.flip({ horizontal: true });
                screenshotBuffer = await image.getBuffer("image/png");
            }

            const ocrResult = await recognizeTextInImageBuffer(screenshotBuffer);
            console.log(` Attempt ${attempt}: OCR attempt complete. Text: "${ocrResult.text}", Confidence: ${ocrResult.confidence}`);
            if (ocrResult.text && TIMESTAMP_REGEX.test(ocrResult.text)) {
                // If text matching the timestamp pattern is found, return the result.
                // The calling function will handle extracting the specific timestamp and checking for uniqueness.
                return ocrResult;
            }
        } catch (error) {
            console.error(` Attempt ${attempt}: Error during screenshot or OCR:`, (error as Error).message || error);
        }

        if (attempt < maxAttempts) {
            console.log(` Waiting ${retryDelayMs}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    console.error(`Failed to recognize target text after ${maxAttempts} attempts.`);
    return null;
}


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
        if ((error as Error).message?.includes("timed out")) {
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
    retryDelayMs: number = 500,
    flip: boolean = false // New parameter to indicate if the view is mirrored
): Promise<QrCodeResult | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Taking screenshot (flip: ${flip}) and attempting to decode QR code...`);
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

            if (flip) {
                console.log(` Attempt ${attempt}: Flipping image horizontally for local stream view.`);
                image.flip({horizontal: true}); // Flip horizontally, not vertically
                // await image.writeAsync(`./debug-image-flipped-attempt-${attempt}.png`); // For debugging flipped image
            }
            const result = await decodeQrCodeWithTimeout(image.bitmap, 2000);

            console.log(` Attempt ${attempt}: QR code decoding attempt complete.`);
            if (result && result.result) {
                console.log(` Attempt ${attempt}: QR Code decoded successfully: ${result.result}`);
                return result;
            }
            console.log(` Attempt ${attempt}: QR Code not found or could not be decoded (result: ${result}).`);

        } catch (error) {
            console.error(` Attempt ${attempt}: Error during screenshot or QR decoding:`, (error as Error).message || error);
        }

        if (attempt < maxAttempts) {
            console.log(` Waiting ${retryDelayMs}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    console.error(`Failed to decode QR code after ${maxAttempts} attempts.`);
    return null;
}

// Node.js equivalent for analyzing YUV from an image buffer
export async function analyzeImageBufferForYuvNode(
    imageBuffer: Buffer,
    targetY: number = 128,
    yTolerance: number = 0.30 // Matches analyzeImageForYuvAveragesInBrowser default
): Promise<YuvAnalysisResult> {
    try {
        const image = await Jimp.read(imageBuffer);
        const { data, width, height } = image.bitmap;
        const totalPixels = width * height;

        let sumCbOfMidLuminance = 0;
        let sumCrOfMidLuminance = 0;
        let midLuminancePixelCount = 0;

        const yMin = targetY * (1 - yTolerance);
        const yMax = targetY * (1 + yTolerance);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // const a = data[i + 3]; // Alpha

            // Standard BT.601 coefficients for YCbCr
            const y = 0.299 * r + 0.587 * g + 0.114 * b;

            if (y >= yMin && y <= yMax) {
                midLuminancePixelCount++;
                const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
                const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
                sumCbOfMidLuminance += cb;
                sumCrOfMidLuminance += cr;
            }
        }

        const percentageInTolerance = (midLuminancePixelCount / totalPixels);
        const avgCb = midLuminancePixelCount > 0 ? sumCbOfMidLuminance / midLuminancePixelCount : null;
        const avgCr = midLuminancePixelCount > 0 ? sumCrOfMidLuminance / midLuminancePixelCount : null;

        return {
            midLuminanceYValue: targetY,
            yTolerancePercentage: yTolerance,
            percentageOfPixelsInYTolerance: percentageInTolerance,
            averageCbForMidLuminancePixels: avgCb,
            averageCrForMidLuminancePixels: avgCr,
        };
    } catch (error) {
        console.error(`NodeJS: Error during YUV analysis of image buffer: ${(error as Error).message}`);
        return {
            midLuminanceYValue: targetY,
            yTolerancePercentage: yTolerance,
            percentageOfPixelsInYTolerance: 0,
            averageCbForMidLuminancePixels: null,
            averageCrForMidLuminancePixels: null,
            error: (error as Error).message,
        };
    }
}


// --- Node.js-based Video File Analysis Utilities ---
export interface FrameAnalysis {
    frameIndex: number;
    qrResults: QrCodeResult[]; // Array to hold multiple QR codes found in one frame
}

export interface OcrFrameAnalysis {
    frameIndex: number;
    ocrResult: OcrResult | null;
}

export interface VideoFileAnalysisNodeResult {
    framesAnalysis: FrameAnalysis[]; // For QR code based analysis
    yuvFramesAnalysis?: YuvAnalysisResult[]; // For YUV based analysis (e.g. Firefox camera)
    ocrFramesAnalysis?: OcrFrameAnalysis[]; // For OCR based analysis (e.g. WebKit camera)
    audioAnalysis: AudioAnalysisResult | null;
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
    expectedQrContent: string, 
    analyzeAudio: boolean,
    numFramesToExtract: number = 4,
    browserName?: string // Added browserName
): Promise<VideoFileAnalysisNodeResult> {
    console.log(`NodeJS: Starting analysis of video file: ${videoFilePath}`);
    console.log(`NodeJS: Expected QR content (for context): "${expectedQrContent}", Analyze audio: ${analyzeAudio}, Frames to extract: ${numFramesToExtract}, Browser: ${browserName}`);

    const result: VideoFileAnalysisNodeResult = {
        framesAnalysis: [],
        yuvFramesAnalysis: [],
        ocrFramesAnalysis: [], // Initialize OCR analysis results
        audioAnalysis: null,
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-analysis-'));
    console.log(`NodeJS: Created temp directory for analysis: ${tempDir}`);

    try {
        // 1. Frame Extraction
        const videoDurationSeconds: number = DEFAULT_AUDIO_DURATION_SECONDS;
        console.log(`NodeJS: Using constant video duration for ${videoFilePath}: ${videoDurationSeconds}s (from DEFAULT_AUDIO_DURATION_SECONDS)`);

        const calculatedTimemarks: string[] = [];
        if (numFramesToExtract > 0) {
            for (let i = 1; i <= numFramesToExtract; i++) {
                const timePoint = videoDurationSeconds * (i / (numFramesToExtract + 1));
                calculatedTimemarks.push(timePoint.toFixed(6));
            }
            console.log(`NodeJS: Calculated timemarks for ${numFramesToExtract} frames: ${calculatedTimemarks}`);
        }

        if (numFramesToExtract <= 0) {
            console.log("NodeJS: numFramesToExtract is 0 or less, no frames will be extracted.");
        } else {
            console.log(`NodeJS: Extracting ${numFramesToExtract} frames from ${videoFilePath} to ${tempDir} using calculated timemarks.`);
            if (calculatedTimemarks.length === 0) {
                 // This should not be reached if numFramesToExtract > 0 due to the duration check above.
                console.error("NodeJS: No timemarks calculated for frame extraction despite numFramesToExtract > 0. This indicates an issue.");
                throw new Error("No timemarks available for frame extraction.");
            }
            await new Promise<void>((resolve, reject) => {
                ffmpeg(videoFilePath)
                    .screenshots({
                        timemarks: calculatedTimemarks,
                        folder: tempDir,
                        filename: 'frame-%i.png',
                        size: '640x?',
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => {
                        console.error(`NodeJS: Error extracting frames with timemarks: ${err.message}`);
                        reject(err);
                    });
            });
            console.log(`NodeJS: Frame extraction complete.`);
        }

        // 2. Frame Analysis (QR, YUV, or OCR)
        const isFirefoxCamera = browserName === 'firefox' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW;
        const isWebKitCamera = browserName === 'webkit' && expectedQrContent === CAMERA_TEST_QR_CONTENT_PW;

        if (isFirefoxCamera) {
            console.log(`NodeJS: Performing YUV analysis for Firefox camera recording.`);
            result.yuvFramesAnalysis = result.yuvFramesAnalysis || []; // Ensure array is initialized
            for (let i = 1; i <= numFramesToExtract; i++) {
                const framePath = path.join(tempDir, `frame-${i}.png`);
                if (!await fs.pathExists(framePath)) {
                    console.warn(`NodeJS: Frame ${framePath} for YUV analysis not found, skipping.`);
                    continue;
                }
                console.log(`NodeJS: YUV analyzing frame ${framePath}`);
                const frameBuffer = await fs.readFile(framePath);
                const yuvResult = await analyzeImageBufferForYuvNode(frameBuffer); // Using defaults for targetY, yTolerance
                result.yuvFramesAnalysis.push(yuvResult);
                console.log(`NodeJS: Frame ${i-1} YUV analysis complete. ` +
                            `Pixel Percentage=${(yuvResult.percentageOfPixelsInYTolerance * 100).toFixed(2)}%, ` +
                            `Avg Cb=${yuvResult.averageCbForMidLuminancePixels?.toFixed(2)}, ` +
                            `Avg Cr=${yuvResult.averageCrForMidLuminancePixels?.toFixed(2)}`);
            }
        } else if (isWebKitCamera) {
            console.log(`NodeJS: Performing OCR analysis for WebKit camera recording.`);
            result.ocrFramesAnalysis = result.ocrFramesAnalysis || []; // Ensure array is initialized
            for (let i = 1; i <= numFramesToExtract; i++) {
                const framePath = path.join(tempDir, `frame-${i}.png`);
                if (!await fs.pathExists(framePath)) {
                    console.warn(`NodeJS: Frame ${framePath} for OCR analysis not found, skipping.`);
                    result.ocrFramesAnalysis.push({ frameIndex: i - 1, ocrResult: { text: null, confidence: 0, error: "Frame not found" } });
                    continue;
                }
                console.log(`NodeJS: OCR analyzing frame ${framePath}`);
                const frameBuffer = await fs.readFile(framePath);
                const ocrScanResult = await recognizeTextInImageBuffer(frameBuffer);
                result.ocrFramesAnalysis.push({ frameIndex: i - 1, ocrResult: ocrScanResult });
                console.log(`NodeJS: Frame ${i-1} OCR analysis complete. Text: "${ocrScanResult.text}", Confidence: ${ocrScanResult.confidence}`);
            }
        } else { // Default to QR code analysis
            console.log(`NodeJS: Performing QR code analysis for frames (Browser: ${browserName}, Expected Content: ${expectedQrContent}).`);
            for (let i = 1; i <= numFramesToExtract; i++) {
                const framePath = path.join(tempDir, `frame-${i}.png`);
                if (!await fs.pathExists(framePath)) {
                    console.warn(`NodeJS: Frame ${framePath} for QR analysis not found, skipping.`);
                    continue;
                }
                console.log(`NodeJS: QR decoding frame ${framePath}`);
                const frameBuffer = await fs.readFile(framePath);
                const image = await Jimp.read(frameBuffer);
                const frameQrResults: QrCodeResult[] = [];

                const { width, height } = image.bitmap;
                const crops = [
                    { x: 0, y: 0, w: width / 2, h: height }, // Left half
                    { x: width / 2, y: 0, w: width / 2, h: height }, // Right half
                ];

                for (const crop of crops) {
                    try {
                        const croppedImage = image.clone().crop(crop);
                        const croppedQr = await decodeQrCodeWithTimeout(croppedImage.bitmap, 1000);
                        if (croppedQr) {
                            const alreadyFound = frameQrResults.some(existingQr =>
                                existingQr.result === croppedQr.result &&
                                Math.abs(existingQr.points[0].x - (croppedQr.points[0].x + crop.x)) < width * 0.1 &&
                                Math.abs(existingQr.points[0].y - (croppedQr.points[0].y + crop.y)) < height * 0.1
                            );
                            if (!alreadyFound) {
                                const adjustedPoints = croppedQr.points.map(p => ({ x: p.x + crop.x, y: p.y + crop.y }));
                                frameQrResults.push({ result: croppedQr.result, points: adjustedPoints });
                            }
                        }
                    } catch (cropError) {
                        console.warn(`NodeJS: Error decoding QR from cropped section: ${(cropError as Error).message}`);
                    }
                }
                
                const uniqueFrameQrResults: QrCodeResult[] = [];
                for (const r of frameQrResults) {
                    if (!uniqueFrameQrResults.some(uq => uq.result === r.result && Math.abs(uq.points[0].x - r.points[0].x) < 10)) {
                        uniqueFrameQrResults.push(r);
                    }
                }

                result.framesAnalysis.push({ frameIndex: i - 1, qrResults: uniqueFrameQrResults });
                console.log(`NodeJS: Frame ${i-1} yielded ${uniqueFrameQrResults.length} unique QR codes.`);
            }
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
                    .on('end', () => resolve())
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
        console.error(`NodeJS: Error in extractFramesAndAnalyzeVideoFileNode: ${(error as Error).message || String(error)}`);
        result.error = (error as Error).message || String(error);
    } finally {
        try {
            // await fs.remove(tempDir); // Intentionally keep for debugging for now
            console.log(`NodeJS: Cleaned up temp directory ${tempDir} (or left for debugging).`);
        } catch (cleanupError) {
            console.error(`NodeJS: Error cleaning up temp directory ${tempDir}: ${(cleanupError as Error).message}`);
        }
    }

    return result;
}
