import {
  VideoStreamMerger,
  type AddStreamOptions,
  type AudioEffect,
  type DrawFunction
} from 'video-stream-merger';
import { writable, get } from 'svelte/store';
import { normalizeStreamId } from './stream';
import { getStreamState, type StreamState } from '../stores/streamStore';
import { calculateStreamLayout, calculateGridPositions, type Position } from './streamLayout';
import { getStreamMetadata } from '../stores/localFileStreamStore';

// Constants
const FW = 1920;
const FH = 1080;
interface RecorderState {
  isRecording: boolean;
  merger: VideoStreamMerger | null;
  mediaRecorder: MediaRecorder | null; // Used for non-Electron recording
  updateInterval: number | null;
  lastStreams: string[]; // Used for non-Electron stream management
  // Electron-specific state
  isElectron: boolean;
  electronRecorders: Record<
    string,
    { recorder: MediaRecorder; fileIdentifier: string; firstChunkSent: boolean }
  >;
}

// Create a Svelte store for recorder state
export const recorderStore = writable<RecorderState>({
  isRecording: false,
  merger: null,
  mediaRecorder: null,
  updateInterval: null,
  lastStreams: [],
  // @ts-ignore // electronRecorderAPI is injected by preload script
  isElectron: typeof window !== 'undefined' && !!window.electronRecorderAPI,
  electronRecorders: {}
});

interface StreamInfo { // Used for merger layout
  id: string;
  key: string;
  stream: MediaStream;
}

// Set up streams in the merger
async function setupStreams(merger: VideoStreamMerger): Promise<void> {
  const state = get(recorderStore);
  const streamState = getStreamState();

  // Collect video streams
  const videoStreams: Array<StreamInfo> = [];

  // Add local video streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (data.stream && data.sendable && data.stream.getVideoTracks().length > 0) {
      videoStreams.push({
        id: normalizeStreamId(data.stream.id || ''),
        key,
        stream: data.stream
      });
    }
  });

  // Add remote video streams
  Object.values(streamState.remoteStreams).forEach((peerData) => {
    Object.entries(peerData.streams).forEach(([key, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        videoStreams.push({
          id: normalizeStreamId(stream.id),
          key,
          stream
        });
      }
    });
  });

  // Collect audio-only streams
  const audioStreams: Array<{ key: string; stream: MediaStream }> = [];

  // Add local audio streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (
      data.stream &&
      data.sendable &&
      data.stream.getVideoTracks().length === 0 &&
      data.stream.getAudioTracks().length > 0
    ) {
      audioStreams.push({ key, stream: data.stream });
    }
  });

  // Add remote audio streams
  Object.values(streamState.remoteStreams).forEach((peerData) => {
    Object.entries(peerData.streams).forEach(([key, stream]) => {
      if (stream.getVideoTracks().length === 0 && stream.getAudioTracks().length > 0) {
        audioStreams.push({ key, stream });
      }
    });
  });

  // Combine all stream keys
  const allStreamKeys = [...videoStreams.map((s) => s.key), ...audioStreams.map((s) => s.key)];

  // Check if streams have changed
  if (
    state.lastStreams.length === allStreamKeys.length &&
    state.lastStreams.every((stream) => allStreamKeys.includes(stream))
  ) {
    return;
  }

  // Remove old streams
  state.lastStreams.forEach((streamKey) => {
    merger.removeStream(streamKey);
  });

  // Update last streams
  recorderStore.update((s) => ({ ...s, lastStreams: allStreamKeys }));

  // Calculate grid layout using the shared function
  const { rows, cols } = calculateStreamLayout(FW, FH, videoStreams.length);
  console.log(`${videoStreams.length} streams will be displayed in ${rows}x${cols}`);

  // Calculate positions for video streams
  const streamInfoForLayout = videoStreams.map((stream) => ({
    id: stream.id,
    aspectRatio: 16 / 9 // Default aspect ratio
  }));

  const positions = calculateGridPositions(FW, FH, streamInfoForLayout);

  // Add video streams with positioning
  videoStreams.forEach((streamInfo, index) => {
    const position = positions.find((p) => p.id === streamInfo.id);
    if (!position) return;

    // stream needs to fit at into (x, x + width) and (y, y + height)
    const { dx, dy, width, height } = calculateFit(position, streamInfo);

    merger.addStream(streamInfo.stream, {
      x: position.x + dx,
      y: position.y + dy,
      width: width,
      height: height,
      mute: false,
      muted: false,
      index: 0,
      draw: null as unknown as DrawFunction,
      audioEffect: null as unknown as AudioEffect
    });
  });

  // Add audio-only streams
  audioStreams.forEach(({ stream }) => {
    merger.addStream(stream, { muted: false } as AddStreamOptions);
  });
}

type FitResult = { dx: number; dy: number; width: number; height: number };

export function calculateFit(position: Position, streamInfo: StreamInfo): FitResult {
  // Calculate the aspect ratio of the video track in the stream
  let videoAspectRatio: number;
  const streamMetadata = getStreamMetadata(streamInfo.id);
  if (streamMetadata?.width && streamMetadata?.height) {
    videoAspectRatio = streamMetadata?.width / streamMetadata?.height;
  } else {
    const videoTrack = streamInfo.stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error('No video track found');
    const { width: videoWidth, height: videoHeight } = videoTrack.getSettings();
    if (videoWidth === undefined || videoHeight === undefined)
      throw new Error('Invalid video dimensions');
    videoAspectRatio = videoWidth / videoHeight;
  }

  // Calculate the aspect ratio of the position
  const positionAspectRatio = position.width / position.height;

  let dx = 0,
    dy = 0,
    width = position.width,
    height = position.height;
  if (videoAspectRatio > positionAspectRatio) {
    // Video is wider than the position, so fit to width and center vertically
    height = width / videoAspectRatio;
    dy = (position.height - height) / 2;
  } else {
    // Video is taller than the position, so fit to height and center horizontally
    width = height * videoAspectRatio;
    dx = (position.width - width) / 2;
  }
  return { dx, dy, width, height };
}

// --- Electron Specific Recording Logic ---

// @ts-ignore
const electronAPI = typeof window !== 'undefined' ? window.electronRecorderAPI : undefined;

async function updateElectronStreamRecorders(): Promise<void> {
  if (!get(recorderStore).isRecording || !electronAPI) return;

  const streamState = getStreamState();
  const currentRecorders = get(recorderStore).electronRecorders;
  const activeStreamKeys = new Set<string>();

  const processStream = async (
    streamKey: string,
    stream: MediaStream,
    cid: string,
    type: 'local' | 'remote'
  ) => {
    activeStreamKeys.add(streamKey);
    if (!currentRecorders[streamKey] && stream.active) {
      const timestamp = Date.now();
      // Sanitize streamKey for use in filename (remove special chars, limit length)
      const sanitizedStreamKey = streamKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
      const fileIdentifier = `rec-${cid}-${type}-${sanitizedStreamKey}-${timestamp}`;

      const options = window.isFirefox
        ? { mimeType: 'video/webm' }
        : { mimeType: 'video/webm; codecs=vp9' }; // Or h264 if preferred and available
      const recorder = new MediaRecorder(stream, options);

      const recorderWrapper = {
        recorder,
        fileIdentifier,
        firstChunkSent: false
      };

      recorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data.size > 0 && electronAPI) {
          try {
            const buffer = await event.data.arrayBuffer();
            await electronAPI.writeChunk(recorderWrapper.fileIdentifier, buffer);
            if (!recorderWrapper.firstChunkSent) {
              recorderWrapper.firstChunkSent = true; // Mark after first successful write
            }
          } catch (err) {
            console.error('Error sending chunk to Electron main:', err);
            // Optionally stop this specific recorder on error
            // recorder.stop();
          }
        }
      };

      recorder.onstop = async () => {
        if (electronAPI && recorderWrapper.firstChunkSent) { // Only finalize if data was sent
          await electronAPI.finalizeFile(recorderWrapper.fileIdentifier);
        }
        // Clean up this recorder from the store
        recorderStore.update((s) => {
          const newRecorders = { ...s.electronRecorders };
          delete newRecorders[streamKey];
          return { ...s, electronRecorders: newRecorders };
        });
      };
      
      recorder.onerror = (event) => {
        console.error('MediaRecorder error for stream', streamKey, event);
      };

      recorder.start(1000); // Timeslice: 1s chunks
      recorderStore.update((s) => ({
        ...s,
        electronRecorders: { ...s.electronRecorders, [streamKey]: recorderWrapper }
      }));
      console.log(`Started Electron recording for stream: ${streamKey}, file: ${fileIdentifier}.webm`);
    }
  };

  // Process local streams
  for (const [key, data] of Object.entries(streamState.localStreams)) {
    if (data.stream && data.sendable) {
      // Using "localuser" as CID placeholder for local streams.
      // This should be replaced with actual local user CID if available.
      await processStream(`local-${key}`, data.stream, 'localuser', 'local');
    }
  }

  // Process remote streams
  for (const peerData of Object.values(streamState.remoteStreams)) {
    for (const [key, stream] of Object.entries(peerData.streams)) {
      await processStream(`remote-${peerData.peerId}-${key}`, stream, peerData.peerId, 'remote');
    }
  }

  // Stop recorders for streams that are no longer active or present
  for (const [streamKey, recorderWrapper] of Object.entries(currentRecorders)) {
    if (!activeStreamKeys.has(streamKey)) {
      console.log(`Stopping Electron recording for obsolete stream: ${streamKey}`);
      recorderWrapper.recorder.stop(); // onstop will handle finalization and cleanup
    }
  }
}

async function startElectronRecording(): Promise<void> {
  if (!electronAPI) {
    console.error('Electron API not available for recording.');
    return;
  }
  recorderStore.update((s) => ({
    ...s,
    isRecording: true,
    electronRecorders: {}, // Clear any previous recorders
    updateInterval: window.setInterval(updateElectronStreamRecorders, 2000) // Check for new/removed streams
  }));
  await updateElectronStreamRecorders(); // Initial check
  console.log('Electron recording started.');
}

function stopElectronRecording(): void {
  const state = get(recorderStore);
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }
  Object.values(state.electronRecorders).forEach(({ recorder }) => {
    if (recorder.state === 'recording') {
      recorder.stop(); // onstop handles finalization
    }
  });
  recorderStore.update((s) => ({
    ...s,
    isRecording: false,
    electronRecorders: {},
    updateInterval: null
  }));
  console.log('Electron recording stopped.');
}

// --- Generic Recording Control ---

export async function startRecording(): Promise<void> {
  const state = get(recorderStore);
  if (state.isElectron) {
    await startElectronRecording();
  } else {
    // Non-Electron: Use VideoStreamMerger
    const merger = new VideoStreamMerger();
    merger.setOutputSize(FW, FH);
    await setupStreams(merger); // Existing setupStreams for merger
    merger.start();

    const options = window.isFirefox
      ? { mimeType: 'video/webm' }
      : { mimeType: 'video/webm; codecs=vp9' };
    const mediaRecorder = new MediaRecorder(merger.result!, options);

    mediaRecorder.ondataavailable = async (ev: BlobEvent) => {
      if (ev.data.size > 0) {
        const anchor = document.createElement('a');
        anchor.href = window.URL.createObjectURL(ev.data);
        anchor.download = 'mie-webrtc-video.mp4';
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(anchor.href);
        }, 100);
      }
    };
    mediaRecorder.start();
    const updateInterval = window.setInterval(() => setupStreams(merger), 1000);
    recorderStore.update((s) => ({
      ...s,
      isRecording: true,
      merger,
      mediaRecorder,
      updateInterval
    }));
  }
}

export function stopRecording(): void {
  const state = get(recorderStore);
  if (state.isElectron) {
    stopElectronRecording();
  } else {
    // Non-Electron: Stop merger and its recorder
    if (state.mediaRecorder) state.mediaRecorder.stop();
    if (state.merger) state.merger.destroy();
    if (state.updateInterval) clearInterval(state.updateInterval);
    recorderStore.update((s) => ({
      ...s,
      isRecording: false,
      merger: null,
      mediaRecorder: null,
      updateInterval: null,
      lastStreams: []
    }));
  }
}

export function toggleRecording(): void {
  const state = get(recorderStore);
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording().catch(error => {
      console.error("Failed to start recording:", error);
      // Optionally reset recording state if start fails
      recorderStore.update(s => ({...s, isRecording: false}));
    });
  }
}
