import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// --- Audio Generation ---
export const DEFAULT_AUDIO_DURATION_SECONDS = 6;
export const DEFAULT_START_FREQ_HZ = 40; // A4-ish note start
export const DEFAULT_END_FREQ_HZ = 1200; // Higher note end
export const DEFAULT_SAMPLE_RATE = 44100; // Standard CD quality sample rate

export async function generateChirpAudioFile(
  outputPath: string,
  duration: number = DEFAULT_AUDIO_DURATION_SECONDS,
  startFreq: number = DEFAULT_START_FREQ_HZ,
  endFreq: number = DEFAULT_END_FREQ_HZ,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Promise<void> {
  if (await fileExists(outputPath)) {
    console.log(`Audio file ${outputPath} already exists. Skipping generation.`);
    return;
  }
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const chirpExpression = `sin(2*PI*(${startFreq}*t + (${endFreq}-${startFreq})/(2*${duration})*t*t))`;
    const ffmpegCommand = `ffmpeg -y -f lavfi -i "aevalsrc='${chirpExpression}':s=${sampleRate}:d=${duration}" -ar ${sampleRate} -ac 2 -acodec pcm_s16le ${outputPath}`;

    console.log(`Generating chirp audio: ${outputPath}`);
    console.log(`Executing: ${ffmpegCommand}`);
    execSync(ffmpegCommand);
    console.log(`Generated chirp audio successfully: ${outputPath}`);
  } catch (error) {
    console.error(`Error generating chirp audio file ${outputPath}:`, error);
    throw error;
  }
}

// --- Video Generation (Moving QR Code) ---
export const DEFAULT_VIDEO_WIDTH = 640;
export const DEFAULT_VIDEO_HEIGHT = 480;
export const DEFAULT_VIDEO_FRAMES = 100; // Number of frames for the video
export const DEFAULT_QR_SIZE = 200; // Pixels
export const DEFAULT_BG_COLOR = 'white';
export const DEFAULT_VIDEO_FRAMERATE = 25;

async function generateMovingQrVideoFrames(
  tempFramesDir: string,
  numFrames: number,
  qrContent: string,
  qrSize: number,
  videoWidth: number,
  videoHeight: number,
  bgColor: string
): Promise<void> {
  await fs.mkdir(tempFramesDir, { recursive: true });
  const qrImagePath = path.join(tempFramesDir, 'qr.png');
  const qrResizedPath = path.join(tempFramesDir, 'qr_resized.png');

  console.log(`Generating QR code image (${qrImagePath}) for content: "${qrContent}"`);
  execSync(`qrencode -o ${qrImagePath} -s 10 "${qrContent}"`);

  console.log(`Resizing QR code to ${qrSize}x${qrSize} (${qrResizedPath})`);
  execSync(`convert ${qrImagePath} -resize ${qrSize}x${qrSize} ${qrResizedPath}`);

  console.log(`Generating ${numFrames} video frames in ${tempFramesDir}...`);
  for (let i = 0; i < numFrames; i++) {
    const frameNumber = String(i).padStart(3, '0');
    const framePath = path.join(tempFramesDir, `frame_${frameNumber}.jpg`);
    const x = Math.floor((i * (videoWidth - qrSize)) / (numFrames - 1 || 1));
    const y = Math.floor((videoHeight - qrSize) / 2);

    execSync(`convert -size ${videoWidth}x${videoHeight} xc:${bgColor} ${framePath}`);
    execSync(`composite -geometry +${x}+${y} ${qrResizedPath} ${framePath} ${framePath}`);

    if ((i + 1) % 20 === 0 || i === numFrames - 1) {
      console.log(` Generated frame ${i + 1}/${numFrames}`);
    }
  }
  console.log('All video frames generated.');
}

async function createVideoFromFrames(
  tempFramesDir: string,
  outputVideoPath: string,
  framerate: number,
  videoCodec: string,
  pixelFormat: string,
  extraArgs: string
): Promise<void> {
  const inputFramesPattern = path.join(tempFramesDir, 'frame_%03d.jpg');
  const ffmpegCommand = `ffmpeg -y -framerate ${framerate} -i "${inputFramesPattern}" -c:v ${videoCodec} ${extraArgs} -pix_fmt ${pixelFormat} ${outputVideoPath}`;

  console.log(
    `Creating video (${outputVideoPath}) with codec ${videoCodec}, pixel format ${pixelFormat}...`
  );
  console.log(`Executing: ${ffmpegCommand}`);
  execSync(ffmpegCommand);
  console.log(`Video creation complete: ${outputVideoPath}`);
}

export async function generateMovingQrVideoFile(
  outputVideoPath: string,
  qrContent: string,
  numFrames: number = DEFAULT_VIDEO_FRAMES,
  videoWidth: number = DEFAULT_VIDEO_WIDTH,
  videoHeight: number = DEFAULT_VIDEO_HEIGHT,
  qrSize: number = DEFAULT_QR_SIZE,
  bgColor: string = DEFAULT_BG_COLOR,
  framerate: number = DEFAULT_VIDEO_FRAMERATE,
  format: 'mjpeg' | 'mp4' = 'mjpeg'
): Promise<{ tempFramesDir: string | undefined }> {
  if (await fileExists(outputVideoPath)) {
    console.log(`Video file ${outputVideoPath} already exists. Skipping generation.`);
    return { tempFramesDir: undefined };
  }
  const tempFramesDir = path.join(
    path.dirname(outputVideoPath),
    `temp_frames_${path.basename(outputVideoPath)}_${Date.now()}`
  );
  try {
    await generateMovingQrVideoFrames(
      tempFramesDir,
      numFrames,
      qrContent,
      qrSize,
      videoWidth,
      videoHeight,
      bgColor
    );

    let videoCodec: string;
    let pixelFormat: string;
    let extraArgs: string;

    if (format === 'mp4') {
      videoCodec = 'libvpx-vp9';
      pixelFormat = 'yuv420p';
      extraArgs = '-b:v 2M';
    } else {
      // mjpeg
      videoCodec = 'mjpeg';
      pixelFormat = 'yuvj420p';
      extraArgs = '-q:v 5';
    }
    await createVideoFromFrames(
      tempFramesDir,
      outputVideoPath,
      framerate,
      videoCodec,
      pixelFormat,
      extraArgs
    );
    return { tempFramesDir };
  } catch (error) {
    console.error(`Error generating moving QR video file ${outputVideoPath}:`, error);
    await fs
      .rm(tempFramesDir, { recursive: true, force: true })
      .catch((e) =>
        console.error(`Error cleaning up ${tempFramesDir} after video generation error:`, e)
      );
    throw error;
  }
}

export async function combineAudioAndVideo(
  videoInputPath: string,
  audioInputPath: string,
  outputMp4Path: string
): Promise<void> {
  if (await fileExists(outputMp4Path)) {
    console.log(`Combined video file ${outputMp4Path} already exists. Skipping generation.`);
    return;
  }
  try {
    await fs.mkdir(path.dirname(outputMp4Path), { recursive: true });
    const isInputMjpeg = videoInputPath.toLowerCase().endsWith('.mjpeg');
    const videoCodecParams = isInputMjpeg ? '-c:v libx264 -pix_fmt yuv420p -crf 23' : '-c:v copy';
    const ffmpegCommand = `ffmpeg -y -i "${videoInputPath}" -i "${audioInputPath}" ${videoCodecParams} -c:a flac -shortest "${outputMp4Path}"`;

    console.log(
      `Combining video from "${videoInputPath}" and audio from "${audioInputPath}" into "${outputMp4Path}"...`
    );
    console.log(`Executing: ${ffmpegCommand}`);
    execSync(ffmpegCommand);
    console.log(`Combined MP4 video created successfully: ${outputMp4Path}`);
  } catch (error) {
    console.error(`Error combining audio and video into ${outputMp4Path}:`, error);
    throw error;
  }
}

export async function cleanupMedia(filesToRemove: string[], dirsToRemove: string[]): Promise<void> {
  console.log('--- Cleaning up generated media files and directories ---');
  for (const filePath of filesToRemove) {
    try {
      await fs.rm(filePath, { force: true });
      console.log(`Removed file: ${filePath}`);
    } catch (error: any) {
      console.error(`Error removing file ${filePath}:`, error.message);
    }
  }
  for (const dirPath of dirsToRemove) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`Removed directory: ${dirPath}`);
    } catch (error: any) {
      console.error(`Error removing directory ${dirPath}:`, error.message);
    }
  }
}
