import { VideoStreamMerger } from 'video-stream-merger';
import { writable, get } from 'svelte/store';
import { normalizeStreamId } from './stream.js';
import { getAllDirectClients } from '../../stores/connectionStore.js';
import { getStreamState, type StreamState } from '../../stores/streamStore.js';

// Constants
const FW = 1920;
const FH = 1080;
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

// Types
interface StreamDimensions {
  key: string;
  ow?: number;
  oh?: number;
  width?: number;
  height?: number;
}

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

// Helper function to get stream element ID
function getStreamElemId(id: string): string {
  return `stream-${normalizeStreamId(id)}`;
}

// Get dimensions of all active streams
const getStreamsDims = async (): Promise<StreamDimensions[]> => {
  const streamState = getStreamState();
  let elems: StreamDimensions[] = [];
  
  // Create a dictionary to store stream dimensions from WebRTC stats
  let statsDict: Record<string, { width?: number, height?: number }> = {};
  
  // Get stats from all clients
  const clients = getAllDirectClients();
  for (const client of Object.values(clients)) {
    try {
      (await client.pc?.getStats())?.forEach((stat: any) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          statsDict[normalizeStreamId(stat.trackIdentifier)] = { 
            width: stat.frameWidth, 
            height: stat.frameHeight 
          };
        }
      });
    } catch (e) {
      console.error("Error getting stats:", e);
    }
  }
  
  // Process all active streams
  // Collect local streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (data.stream && data.active && data.stream.getVideoTracks().length > 0) {
      processStreamDimensions(key, data.stream, statsDict, elems);
    }
  });
  
  // Collect remote streams
  Object.values(streamState.remoteStreams).forEach(peerData => {
    Object.entries(peerData.streams).forEach(([key, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        processStreamDimensions(key, stream, statsDict, elems);
      }
    });
  });
  
  return elems;
};

// Helper to process stream dimensions
function processStreamDimensions(
  key: string, 
  stream: MediaStream, 
  statsDict: Record<string, { width?: number, height?: number }>,
  elems: StreamDimensions[]
) {
  let width: number | undefined, height: number | undefined;
  
  // Try to get dimensions from track settings
  const videoTrack = stream.getVideoTracks()[0];
  if (videoTrack) {
    const settings = videoTrack.getSettings();
    width = settings.width;
    height = settings.height;
    
    // If dimensions not available from settings, try stats
    if (!width || !height) {
      const trackId = normalizeStreamId(videoTrack.id);
      if (trackId in statsDict) {
        const stats = statsDict[trackId];
        width = stats.width;
        height = stats.height;
      }
    }
    
    // If still no dimensions, try from video element
    if (!width || !height) {
      const videoElem = document.querySelector(`video.${getStreamElemId(key)}`) as HTMLVideoElement;
      if (videoElem) {
        height = videoElem.videoHeight;
        width = videoElem.videoWidth;
      }
    }
    
    // Add to elements array with calculated aspect ratio values
    elems.push({ 
      key, 
      ow: width, 
      oh: height, 
      width: width && height ? Math.sqrt(width / height) : undefined, 
      height: width && height ? Math.sqrt(height / width) : undefined 
    });
  }
}

// Set up streams in the merger
async function setupStreams(merger: any): Promise<void> {
  const state = get(recorderStore);
  const streamState = getStreamState();
  
  // Get all streams with dimensions
  const streams = (await getStreamsDims()).filter(({ width, height }) => width && height);
  const videoStreamsLength = streams.length;
  
  // Add audio-only streams
  const audioStreams: StreamDimensions[] = [];
  
  // Add local audio streams
  Object.entries(streamState.localStreams).forEach(([key, data]) => {
    if (data.stream && data.active && 
        data.stream.getVideoTracks().length === 0 && 
        data.stream.getAudioTracks().length > 0) {
      audioStreams.push({ key });
    }
  });
  
  // Add remote audio streams
  Object.values(streamState.remoteStreams).forEach(peerData => {
    Object.entries(peerData.streams).forEach(([key, stream]) => {
      if (stream.getVideoTracks().length === 0 && stream.getAudioTracks().length > 0) {
        audioStreams.push({ key });
      }
    });
  });
  
  // Combine video and audio streams
  const allStreams = [...streams, ...audioStreams];
  
  // Check if streams have changed
  const streamKeys = allStreams.map(({ key }) => key);
  if (state.lastStreams.length === streamKeys.length && 
      state.lastStreams.every(stream => streamKeys.includes(stream))) {
    return;
  }
  
  // Remove old streams
  state.lastStreams.forEach(streamKey => {
    merger.removeStream(streamKey);
  });
  
  // Update last streams
  recorderStore.update(s => ({ ...s, lastStreams: streamKeys }));
  
  // Calculate grid layout
  const rcs = Math.ceil(Math.sqrt(streams.length));
  const cols = rcs;
  const rows = cols * (cols - 1) >= streams.length ? cols - 1 : cols;
  console.log(`${videoStreamsLength} streams will be displayed in ${rows}x${cols}`);
  
  // Add streams to merger
  let videoStreamIndex = 0;
  
  // Add video streams with positioning
  for (let i = 0; i < streams.length; i++) {
    const stream = getStreamForKey(streams[i].key, streamState);
    if (!stream) continue;
    
    if (!streams[i].width) {
      merger.addStream(stream, {
        mute: false,
      });
    } else {
      const nw = streams[i].width! * FH / cols / streams[i].height!;
      const scale = nw <= FW / rows ? FH / cols / streams[i].height! : FW / rows / streams[i].width!;
      merger.addStream(stream, {
        x: (videoStreamIndex % cols) * FW / cols,
        y: Math.floor(videoStreamIndex / cols) * FH / rows,
        width: scale * streams[i].width!,
        height: scale * streams[i].height!,
        mute: false,
      });
      videoStreamIndex++;
    }
  }
  
  // Add audio-only streams
  audioStreams.forEach(({ key }) => {
    const stream = getStreamForKey(key, streamState);
    if (stream) {
      merger.addStream(stream, { mute: false });
    }
  });
}

// Helper to get a stream by key from the store
function getStreamForKey(key: string, streamState: StreamState): MediaStream | null {
  // Check local streams
  for (const [streamKey, data] of Object.entries(streamState.localStreams)) {
    if (key === streamKey && data.stream) {
      return data.stream;
    }
  }
  
  // Check remote streams
  for (const peerData of Object.values(streamState.remoteStreams)) {
    for (const [streamKey, stream] of Object.entries(peerData.streams)) {
      if (key === streamKey) {
        return stream;
      }
    }
  }
  
  return null;
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
