import { getStreamMetadata } from '../stores/localFileStreamStore';
import type { StreamInfo } from './recorderTypes';
import type { Position } from './streamLayout';

// Type for calculateFit result
export type FitResult = { dx: number; dy: number; width: number; height: number };

export function calculateFit(position: Position, streamInfo: StreamInfo): FitResult {
  let videoAspectRatio: number;
  const streamMetadata = getStreamMetadata(streamInfo.id); // streamInfo.id is normalized

  if (streamMetadata?.width && streamMetadata?.height) {
    videoAspectRatio = streamMetadata.width / streamMetadata.height;
  } else {
    const videoTrack = streamInfo.stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn(
        `No video track found for stream id ${streamInfo.id} (key ${streamInfo.key}), using 16:9.`
      );
      videoAspectRatio = 16 / 9; // Default fallback
    } else {
      const settings = videoTrack.getSettings();
      const { width: videoWidth, height: videoHeight } = settings;
      if (
        videoWidth === undefined ||
        videoHeight === undefined ||
        videoWidth === 0 ||
        videoHeight === 0
      ) {
        console.warn(
          `Invalid video dimensions from track settings for stream id ${streamInfo.id} (key ${streamInfo.key}):`,
          settings,
          '. Using 16:9.'
        );
        videoAspectRatio = 16 / 9; // Default fallback
      } else {
        videoAspectRatio = videoWidth / videoHeight;
      }
    }
  }

  const positionAspectRatio = position.width / position.height;
  let dx = 0,
    dy = 0,
    width = position.width,
    height = position.height;

  if (Math.abs(videoAspectRatio - positionAspectRatio) < 0.01) {
    // If aspect ratios are very close
    // Use full position
  } else if (videoAspectRatio > positionAspectRatio) {
    height = width / videoAspectRatio; // Video is wider, fit to width, letterbox top/bottom
    dy = (position.height - height) / 2;
  } else {
    width = height * videoAspectRatio; // Video is taller, fit to height, letterbox sides
    dx = (position.width - width) / 2;
  }
  return { dx, dy, width, height };
}
