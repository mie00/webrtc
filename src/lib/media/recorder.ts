import { VideoStreamMerger, type AddStreamOptions, type AudioEffect, type DrawFunction } from 'video-stream-merger';
import { writable, get } from 'svelte/store';
import { normalizeStreamId } from './stream.js';
import { getStreamState, type StreamState } from '../../stores/streamStore.js';
import { calculateStreamLayout, calculateGridPositions, type Position } from './streamLayout.js';

// Constants
const FW = 1920;
const FH = 1080;
interface RecorderState {
  isRecording: boolean;
  merger: any | null;
  mediaRecorder: MediaRecorder | null;
  updateInterval: number | null;
  lastStreams: string[];
}

// Create a Svelte store for recorder state
export const recorderStore = writable<RecorderState>({
  isRecording: false,
  merger: null,
  mediaRecorder: null,
  updateInterval: null,
  lastStreams: []
});


// Set up streams in the merger
async function setupStreams(merger: VideoStreamMerger): Promise<void> {
  const state = get(recorderStore);
  const streamState = getStreamState();
  
  // Collect video streams
  const videoStreams: Array<{ id: string, key: string, stream: MediaStream }> = [];
  
  // Add local video streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (data.stream && data.active && data.sendable && data.stream.getVideoTracks().length > 0) {
      videoStreams.push({ 
        id: normalizeStreamId(data.stream.id || ''),
        key,
        stream: data.stream
      });
    }
  });
  
  // Add remote video streams
  Object.values(streamState.remoteStreams).forEach(peerData => {
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
  const audioStreams: Array<{ key: string, stream: MediaStream }> = [];
  
  // Add local audio streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (data.stream && data.active && data.sendable && 
        data.stream.getVideoTracks().length === 0 && 
        data.stream.getAudioTracks().length > 0) {
      audioStreams.push({ key, stream: data.stream });
    }
  });
  
  // Add remote audio streams
  Object.values(streamState.remoteStreams).forEach(peerData => {
    Object.entries(peerData.streams).forEach(([key, stream]) => {
      if (stream.getVideoTracks().length === 0 && stream.getAudioTracks().length > 0) {
        audioStreams.push({ key, stream });
      }
    });
  });
  
  // Combine all stream keys
  const allStreamKeys = [...videoStreams.map(s => s.key), ...audioStreams.map(s => s.key)];
  
  // Check if streams have changed
  if (state.lastStreams.length === allStreamKeys.length && 
      state.lastStreams.every(stream => allStreamKeys.includes(stream))) {
    return;
  }
  
  // Remove old streams
  state.lastStreams.forEach(streamKey => {
    merger.removeStream(streamKey);
  });
  
  // Update last streams
  recorderStore.update(s => ({ ...s, lastStreams: allStreamKeys }));
  
  // Calculate grid layout using the shared function
  const { rows, cols } = calculateStreamLayout(FW, FH, videoStreams.length);
  console.log(`${videoStreams.length} streams will be displayed in ${rows}x${cols}`);
  
  // Calculate positions for video streams
  const streamInfoForLayout = videoStreams.map(stream => ({
    id: stream.id,
    aspectRatio: 16/9 // Default aspect ratio
  }));
  
  const positions = calculateGridPositions(FW, FH, streamInfoForLayout);
  
  // Add video streams with positioning
  videoStreams.forEach((streamInfo, index) => {
    const position = positions.find(p => p.id === streamInfo.id);
    if (!position) return;
    
    // stream needs to fit at into (x, x + width) and (y, y + height)
    const {dx, dy, width, height} = calculateFit(position, streamInfo.stream);

    merger.addStream(streamInfo.stream, {
      x: position.x + dx,
      y: position.y + dy,
      width: width,
      height: height,
      mute: false,
      muted: false,
      index: 0,
      draw: null as unknown as DrawFunction,
      audioEffect: null as unknown as AudioEffect,
    });
  });
  
  // Add audio-only streams
  audioStreams.forEach(({ stream }) => {
    merger.addStream(stream, { muted: false } as AddStreamOptions);
  });
}

type FitResult = { dx: number; dy: number; width: number; height: number };

function calculateFit(position: Position, stream: MediaStream): FitResult {
  // Calculate the aspect ratio of the video track in the stream
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("No video track found");
  const { width: videoWidth, height: videoHeight } = videoTrack.getSettings();
  if (videoWidth === undefined || videoHeight === undefined) throw new Error("Invalid video dimensions");
  const videoAspectRatio = videoWidth / videoHeight;

  // Calculate the aspect ratio of the position
  const positionAspectRatio = position.width / position.height;

  let dx = 0, dy = 0, width = position.width, height = position.height;
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

// Start recording
export async function startRecording(): Promise<void> {
  // Create a new merger
  const merger = new VideoStreamMerger();
  merger.setOutputSize(FW, FH);
  
  // Set up initial streams
  await setupStreams(merger);
  
  // Start the merger
  merger.start();
  
  // Set up media recorder
  const options = { mimeType: "video/webm; codecs=vp9" };
  const mediaRecorder = new MediaRecorder(merger.result!, options);
  
  // Handle data available event
  mediaRecorder.ondataavailable = async (ev: BlobEvent) => {
    if (ev.data.size > 0) {
      // Create a link element for downloading
      const anchor = document.createElement('a');
      anchor.href = window.URL.createObjectURL(ev.data);
      anchor.download = 'mie-webrtc-video.mp4';

      // Append the anchor to the body and programmatically click it to trigger download
      document.body.appendChild(anchor);
      anchor.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(anchor.href);
      }, 100);
    }
  };
  
  // Start recording
  mediaRecorder.start();
  
  // Set up interval to update streams
  const updateInterval = window.setInterval(() => setupStreams(merger), 1000);
  
  // Update store
  recorderStore.update(state => ({
    ...state,
    isRecording: true,
    merger,
    mediaRecorder,
    updateInterval
  }));
}

// Stop recording
export function stopRecording(): void {
  const state = get(recorderStore);
  
  // Stop media recorder
  if (state.mediaRecorder) {
    state.mediaRecorder.stop();
  }
  
  // Destroy merger
  if (state.merger) {
    state.merger.destroy();
  }
  
  // Clear interval
  if (state.updateInterval) {
    clearInterval(state.updateInterval);
  }
  
  // Update store
  recorderStore.update(state => ({
    ...state,
    isRecording: false,
    merger: null,
    mediaRecorder: null,
    updateInterval: null,
    lastStreams: []
  }));
}

// Toggle recording
export function toggleRecording(): void {
  const state = get(recorderStore);
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}
