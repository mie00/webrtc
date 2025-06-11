import { writable, get } from 'svelte/store';
import type { Position } from './streamLayout';
import { getStreamMetadata } from '../stores/localFileStreamStore';
import type { IRecorder, RecorderState, StreamInfo } from './recorderTypes';
import { electronAPI } from './recorderTypes';
import { BrowserRecorder } from './browserRecorder';
import { ElectronRecorder, electronRecorderSingletonWrapper } from './electronRecorder';

export const recorderStore = writable<RecorderState>({
  isRecording: false
  // error: null // Optional: for UI feedback
});

// Initialize the singleton wrapper for ElectronRecorder if in Electron environment
if (electronAPI) {
  electronRecorderSingletonWrapper.recorderStore = recorderStore;
}

const activeRecorder: IRecorder = electronAPI
  ? new ElectronRecorder()
  : new BrowserRecorder();

export async function startRecording(): Promise<void> {
  if (get(recorderStore).isRecording) {
    console.warn('Recording is already in progress.');
    return;
  }
  try {
    await activeRecorder.start();
    recorderStore.update((s) => ({ ...s, isRecording: true /*, error: null */ }));
  } catch (error: any) {
    console.error('Failed to start recording:', error);
    recorderStore.update((s) => ({ ...s, isRecording: false /*, error: error.message */ }));
    throw error; // Re-throw to allow UI to handle if needed
  }
}

export function stopRecording(): void {
  if (!get(recorderStore).isRecording) {
    // console.warn('Recording is not in progress.'); // Can be noisy if UI allows spamming stop
    return;
  }
  try {
    activeRecorder.stop();
    recorderStore.update((s) => ({ ...s, isRecording: false }));
  } catch (error: any) {
    console.error('Failed to stop recording:', error);
    // Still update store to reflect intent, but maybe set an error
    recorderStore.update((s) => ({ ...s, isRecording: false /*, error: error.message */ }));
    throw error;
  }
}

export function toggleRecording(): void {
  const currentlyRecording = get(recorderStore).isRecording;
  if (currentlyRecording) {
    stopRecording();
  } else {
    startRecording().catch((error) => {
      // Error is already logged by startRecording and store updated
      // UI can subscribe to recorderStore.error if that field is added and used
      console.info('Toggle recording: startRecording attempt failed (error already handled).');
    });
  }
}

// Utility function - calculateFit
// Imported by BrowserRecorder. Could be moved to a more general util file or streamLayout.
type FitResult = { dx: number; dy: number; width: number; height: number };

export function calculateFit(position: Position, streamInfo: StreamInfo): FitResult {
  let videoAspectRatio: number;
  const streamMetadata = getStreamMetadata(streamInfo.id); // streamInfo.id is normalized

  if (streamMetadata?.width && streamMetadata?.height) {
    videoAspectRatio = streamMetadata.width / streamMetadata.height;
  } else {
    const videoTrack = streamInfo.stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn(`No video track found for stream id ${streamInfo.id} (key ${streamInfo.key}), using 16:9.`);
      videoAspectRatio = 16 / 9; // Default fallback
    } else {
      const settings = videoTrack.getSettings();
      const { width: videoWidth, height: videoHeight } = settings;
      if (videoWidth === undefined || videoHeight === undefined || videoWidth === 0 || videoHeight === 0) {
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
  let dx = 0, dy = 0, width = position.width, height = position.height;

  if (Math.abs(videoAspectRatio - positionAspectRatio) < 0.01) { // If aspect ratios are very close
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
