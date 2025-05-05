import { 
  streamStore, 
  getStreamState, 
  addViewStream, 
  removeViewStream,
  addLocalStream,
  removeLocalStream,
  addRemoteStream,
  removeRemoteStream,
  type StreamType,
  type StreamState // Import StreamState
} from '../stores/streamStore.js';
import {
  getAllConfig
} from '../stores/configStore.js';
import { get } from 'svelte/store';
import {
  type AppWithStreamConfig,
  type AudioProcessingApp,
  normalizeStreamId,
  setupStream,
  processAudio,
  stopProcessingAudio,
  setupTrack,
  tearDownStream,
} from './media/stream.js'
// Export background utilities
import { backgroundChange } from './utils/background.js';

// This module serves as a bridge between the WebRTC app and Svelte components

/**
 * Initialize the stream module with the app object
 */
export function streamInit(originalApp: App): void {
  const app = originalApp as AppWithStreamConfig;
  // Store a reference to the app in the window for backward compatibility
  window.app = app;

  // Initialize app properties if they don't exist
  // app.streams = app.streams || {}; // Removed: Store is the source of truth
  app.streamConfig = app.streamConfig || {}; // Keep this for now if needed by non-refactored parts

  // Set up handlers for stream events
  app.nego_handlers['stream.end'] = (data: { stream: string }, cid: string) => {
    const streamId = normalizeStreamId(data.stream);
    
    // Remove from enhanced store structure
    removeRemoteStream(cid, streamId);
    
    // Forward to other clients
    for (let cid2 of Object.keys(app.clients)) {
      if (cid == cid2) continue;
      sendNego(app.clients[cid2], { type: 'stream.end', stream: streamId });
    }
  };
  
  // Set up cleanup handler
  app.cleanups['stream'] = (cid?: string) => {
    if (!cid) {
      // Clean up all local streams when the app is torn down globally
      const state = getStreamState(); // Get current stream state
      Object.entries(state.localStreams).forEach(([key, localStreamData]) => {
        const stream = localStreamData.stream;
        const streamId = normalizeStreamId(stream.id);

        try {
          Object.values(app.clients).forEach((client) =>
            // Add type assertion for clarity if needed, though Object.values should return WebRTCClient[]
            sendNego(client as WebRTCClient, { type: 'stream.end', stream: streamId })
          );
        } catch { }

        stream.getTracks().map((track: MediaStreamTrack) => track.stop()); // Add type MediaStreamTrack

        // Remove from enhanced store structure
        removeLocalStream(key); // Use the key used in the store ('audio', 'video', etc.)
      });
      // Clear the legacy app.streams just in case anything still references it
      // app.streams = {}; // Optional: Keep or remove based on confidence level
    }
    // Note: Cleanup for a specific client (when cid is provided) might need separate handling
    // if remote streams associated with that client need explicit cleanup beyond connection closing.
  };
  
  // Set up a subscription to sync store changes back to app object
  streamStore.subscribe((state: StreamState) => { // Add type StreamState
    // This ensures the app object stays in sync with the store
    // Assuming state has streamConfig, adjust if StreamState structure is different
    if (state.streamConfig) { 
      app.streamConfig = { ...state.streamConfig };
    }
  });
}

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(app: App, cid: string): void {
  app.clients[cid].pc?.addEventListener("track", async (ev: RTCTrackEvent) => {
    console.log("got track event", ev);

    const streamId = normalizeStreamId(ev.streams[0].id);

    // Add to enhanced store structure
    addRemoteStream(cid, streamId, ev.streams[0]);

    ev.track.onended = (ev: Event) => {
      console.log(ev);
      const target = ev.target as MediaStreamTrack;
      const targetId = normalizeStreamId(target.id);
      
      // Notify other clients
      Object.values(app.clients).forEach((client) => 
        sendNego(client, { type: 'stream.end', stream: targetId })
      );
      
      // Remove from enhanced store structure
      removeRemoteStream(cid, targetId);
    };

    // Forward to other clients
    for (let cid2 of Object.keys(app.clients)) {
      if (cid == cid2) continue;
      app.clients[cid2].pc?.addTrack(ev.track, ev.streams[0]);
    }
  });

  // Add existing LOCAL streams to new client
  const state = getStreamState();
  Object.values(state.localStreams).forEach((localStreamData) => {
    if (localStreamData.active) { // Only add active streams
        localStreamData.stream.getTracks().forEach(track => {
            try {
                app.clients[cid].pc?.addTrack(track, localStreamData.stream);
            } catch (e) {
                console.error("Error adding track to new client:", e, track, localStreamData.stream);
            }
        });
    }
  });
}

/**
 * Enhanced version of setupLocalStream that uses the new store structure
 */
export const setupLocalStream = async (changed: 'audio' | 'video' | 'screen' | 'local', audioCb?: (instant: number) => void): Promise<void> => {
  const app = window.app as AppWithStreamConfig;
  let stream: MediaStream | undefined;
  
  // Handle different stream types
  if (changed === 'audio') {
    if (app.streamConfig.audio) {
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          groupId: getAllConfig()['audio-device']?.split('|')[0], 
          deviceId: getAllConfig()['audio-device']?.split('|')[1] 
        } 
      });
      
      // Set up the stream for WebRTC
      setupStream(stream, "high");
      
      // Process audio for visualization if callback provided
      if (audioCb) {
        processAudio(app as AudioProcessingApp, stream, audioCb);
      }
    } else if (audioCb) {
      stopProcessingAudio(app as AudioProcessingApp);
      audioCb(0);
    }
  } else if (changed === 'video') {
    if (app.streamConfig.video) {
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          groupId: getAllConfig()['video-device']?.split('|')[0], 
          deviceId: getAllConfig()['video-device']?.split('|')[1] 
        } 
      });
      
      // Apply background blur if enabled
      if (app.config && app.config['blur-video'] === 'yes') {
        try {
          // Create a video element for the stream
          const videoElem = document.createElement('video');
          videoElem.autoplay = true;
          videoElem.muted = true;
          videoElem.srcObject = stream;
          // document.getElementById('media')?.appendChild(videoElem);
          
          // Wait for video to be ready
          await new Promise<void>((resolve) => {
            videoElem.onloadedmetadata = () => {
              videoElem.play().then(() => resolve());
            };
          });
          
          const blurredStream = await backgroundChange(videoElem);
          setupStream(blurredStream, "low", "motion", true);
          stream = blurredStream; // Replace the original stream with the blurred one
        } catch (error) {
          console.error('Failed to apply background blur:', error);
          setupStream(stream, "low", "motion", true);
        }
      } else {
        setupStream(stream, "low", "motion", true);
      }
    }
  } else if (changed === 'screen') {
    if (app.streamConfig.screen) {
      stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: true, 
        video: { cursor: "always" } as any 
      });
      setupStream(stream, "medium", 'detail', false);
    }
  } else if (changed === 'local') {
    if (app.streamConfig.local && app.streamConfig.videoStream) {
      stream = app.streamConfig.videoStream;
      // Add null check for stream
      if (stream) { 
        stream.getTracks().forEach(track => {
          setupTrack(track, stream!, "medium", undefined, false);
        });
        stream.onaddtrack = (ev: MediaStreamTrackEvent) => {
          setupTrack(ev.track, stream!, "medium", undefined, false);
        };
      }
    }
  }

  if (stream) {
    // Store in app object for backward compatibility - REMOVED
    // app.streams = app.streams || {};
    // app.streams[changed] = stream;

    // Map the stream type
    let streamType: StreamType = 'custom';
    if (changed === 'audio') streamType = 'audio';
    else if (changed === 'video') streamType = 'camera';
    else if (changed === 'screen') streamType = 'screen';
    else if (changed === 'local') streamType = 'file';
    
    // Add to enhanced store structure
    addLocalStream(changed, stream, streamType);
  } else {
    // If the stream was removed (e.g., toggled off), remove it from our enhanced store too
    // This case might be handled better by destroyLocalStream, but keep for completeness
    removeLocalStream(changed);
  }
};

/**
 * Destroy a local stream
 */
export const destroyLocalStream = async (changed: 'audio' | 'video' | 'screen' | 'local', audioCb?: (instant: number) => void): Promise<void> => {
  const app = window.app as AppWithStreamConfig; // Keep access to app for tearDownStream context if needed
  const state = getStreamState(); // Get state from store
  const localStreamData = state.localStreams[changed];

  if (localStreamData) {
    // Stop all tracks using the utility function
    await tearDownStream(localStreamData.stream); // Pass the actual stream

    // Remove from app object - REMOVED
    // delete app.streams[changed];

    // Handle audio processing if needed
    if (changed === 'audio' && audioCb) {
      stopProcessingAudio(app as AudioProcessingApp);
      audioCb(0);
    }
    
    // Remove from store
    removeLocalStream(changed);
  }
};

// Export utility functions from the original stream.ts
export { 
  normalizeStreamId, 
} from './media/stream.js';

// Helper function to send negotiation messages
function sendNego(client: WebRTCClient, data: any): void {
  try {
    client.nego_dc?.send(JSON.stringify(data));
  } catch (e) {
    console.log("error sending data", data, "to", client, "error", e);
  }
}
