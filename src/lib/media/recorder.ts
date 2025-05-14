import { VideoStreamMerger } from 'video-stream-merger';
import { writable, get } from 'svelte/store';
import { normalizeStreamId } from './stream.js';
import { getStreamState } from '../../stores/streamStore.js';
import { collectActiveStreams, calculateGridLayout } from '../utils/streamLayout.js';

// Constants
const FW = 1920;
const FH = 1080;

// Types
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
async function setupStreams(merger: any): Promise<void> {
  const state = get(recorderStore);
  
  // Get all active streams using the shared function
  const activeStreams = collectActiveStreams();
  
  // Separate video and audio streams
  const videoStreams = activeStreams.filter(stream => 
    stream.stream && stream.stream.getVideoTracks().length > 0
  );
  
  const audioStreams = activeStreams.filter(stream => 
    stream.stream && 
    stream.stream.getVideoTracks().length === 0 && 
    stream.stream.getAudioTracks().length > 0
  );
  
  // Combine all stream IDs
  const allStreamIds = [...videoStreams, ...audioStreams].map(s => s.streamKey || s.id);
  
  // Check if streams have changed
  if (state.lastStreams.length === allStreamIds.length && 
      state.lastStreams.every(id => allStreamIds.includes(id))) {
    return;
  }
  
  // Remove old streams
  state.lastStreams.forEach(streamKey => {
    merger.removeStream(streamKey);
  });
  
  // Update last streams
  recorderStore.update(s => ({ ...s, lastStreams: allStreamIds }));
  
  // Calculate grid layout using the shared function
  const positions = calculateGridLayout(FW, FH, videoStreams);
  
  console.log(`${videoStreams.length} streams will be displayed in a grid`);
  
  // Add video streams with positioning
  for (let i = 0; i < videoStreams.length; i++) {
    const stream = videoStreams[i].stream;
    if (!stream) continue;
    
    const position = positions.find(p => p.id === videoStreams[i].id);
    if (!position) continue;
    
    // Get stream dimensions to calculate aspect ratio
    const videoTrack = stream.getVideoTracks()[0];
    let width, height;
    
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      width = settings.width;
      height = settings.height;
    }
    
    // Calculate stream dimensions to maintain aspect ratio
    if (width && height) {
      const streamAspect = width / height;
      const cellAspect = position.width / position.height;
      let streamWidth, streamHeight;
      
      if (streamAspect > cellAspect) {
        // Stream is wider than cell
        streamWidth = position.width;
        streamHeight = position.width / streamAspect;
      } else {
        // Stream is taller than cell
        streamHeight = position.height;
        streamWidth = position.height * streamAspect;
      }
      
      // Center in cell
      const xOffset = (position.width - streamWidth) / 2;
      const yOffset = (position.height - streamHeight) / 2;
      
      merger.addStream(stream, {
        x: position.x + xOffset,
        y: position.y + yOffset,
        width: streamWidth,
        height: streamHeight,
        mute: false,
      });
    } else {
      // If no dimensions, just fill the cell
      merger.addStream(stream, {
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        mute: false,
      });
    }
  }
  
  // Add audio-only streams
  audioStreams.forEach(stream => {
    if (stream.stream) {
      merger.addStream(stream.stream, { mute: false });
    }
  });
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
