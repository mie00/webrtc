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
  type StreamState, // Import StreamState
  updateStreamConfig
} from '../stores/streamStore.js';
import {
  getAllConfig
} from '../stores/configStore.js';
import { getDirectClient, getAllDirectClients, getAllClientCids } from '../stores/connectionStore.js'; // Adjust path if needed
import { get } from 'svelte/store';
import {
  // REMOVE AppWithStreamConfig, AudioProcessingApp imports
  type AudioNodes, // Import new type
  normalizeStreamId,
  setupStream,
  processAudio,
  stopProcessingAudio,
  setupTrack,
  tearDownStream,
} from './media/stream.js'
// Export background utilities
import { backgroundChange } from './utils/background.js';
import { getLocalFileStreamState } from '..//stores/localFileStreamStore.js';

// Module-level storage for audio processing contexts/nodes
let audioProcessingContexts: Record<string, AudioNodes | null> = {};

/**
 * Initialize the stream module with the app object
 */
export function streamInit(originalApp: App): void {
  // Set up handlers for stream events
  originalApp.nego_handlers['stream.end'] = (data: { stream: string }, cid: string) => {
    const streamId = normalizeStreamId(data.stream);
    
    // Remove from enhanced store structure
    removeRemoteStream(cid, streamId);

    // Forward to other clients (from store)
    const clients = getAllDirectClients(); // Get clients from store
    for (let cid2 of Object.keys(clients)) { // Iterate over CIDs
      if (cid == cid2) continue;
      const client = clients[cid2]; // Get client object
      // Use window.webRTCApp.sendNego
      window.webRTCApp.sendNego(client, { type: 'stream.end', stream: streamId });
    }
  };
  // Set up cleanup handler
  originalApp.cleanups['stream'] = (cid?: string) => {
    if (!cid) {
      // Clean up all local streams when the app is torn down globally
      const state = getStreamState(); // Get current stream state
      const clients = getAllDirectClients(); // Get clients from store
      Object.entries(state.localStreams).forEach(([key, localStreamData]) => {
        const stream = localStreamData.stream;
        if (stream) {
          const streamId = normalizeStreamId(stream.id);

          try {
            // Iterate over client objects from the store
            Object.values(clients).forEach((client) => {
              // Use window.webRTCApp.sendNego
              window.webRTCApp.sendNego(client, { type: 'stream.end', stream: streamId })
            });
          } catch (e) {
              console.error("Error sending stream.end during global cleanup:", e);
          }

          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop()); // Use forEach for clarity
        }
        // Remove from enhanced store structure
        removeLocalStream(key);

        // Clean up associated audio context if any
        if (audioProcessingContexts[key]) {
          stopProcessingAudio(audioProcessingContexts[key]);
          delete audioProcessingContexts[key];
        }
      });
    }
    // Note: Cleanup for a specific client remains unchanged for now
  };
  
  // REMOVED streamStore.subscribe block that was syncing back to the removed 'app' object
}

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(app: App, cid: string): void { // app might be needed for global config
  const client = getDirectClient(cid); // Get specific client from store
  if (!client || !client.pc) return; // Add null check

  client.pc.addEventListener("track", async (ev: RTCTrackEvent) => {
    console.log("got track event", ev);

    const streamId = normalizeStreamId(ev.streams[0].id);

    // Add to enhanced store structure
    addRemoteStream(cid, streamId, ev.streams[0]);

    ev.track.onended = (ev_track_end: Event) => { // Rename ev to avoid conflict
      console.log(ev_track_end);
      const target = ev_track_end.target as MediaStreamTrack;
      // Try to find the stream associated with the track to get the correct ID used in the store
      const state = getStreamState();
      let associatedStreamId = normalizeStreamId(target.id); // Fallback to track ID
      outer:
      for (const peerData of Object.values(state.remoteStreams)) {
          for (const [sId, stream] of Object.entries(peerData.streams)) {
              if (stream.getTracks().some(t => t.id === target.id)) {
                  associatedStreamId = sId; // Found the stream ID used in the store
                  break outer;
              }
          }
      }


      // Notify other clients (from store)
      const allClients = getAllDirectClients(); // Get clients from store
      Object.values(allClients).forEach((c) => { // Iterate over client objects
        // Use window.webRTCApp.sendNego
        window.webRTCApp.sendNego(c, { type: 'stream.end', stream: associatedStreamId })
      });

      // Remove from enhanced store structure using the correct stream ID
      removeRemoteStream(cid, associatedStreamId);
    };

    // Forward to other clients (from store)
    const allClients = getAllDirectClients(); // Get clients from store
    for (let cid2 of Object.keys(allClients)) { // Iterate over CIDs
      if (cid == cid2) continue;
      const otherClient = allClients[cid2]; // Get the client object
      otherClient.pc?.addTrack(ev.track, ev.streams[0]);
    }
  });

  // Add existing LOCAL streams to new client
  const state = getStreamState();
  const targetClient = getDirectClient(cid); // Get the client again from store
  if (!targetClient || !targetClient.pc) return; // Add null check

  Object.values(state.localStreams).forEach((localStreamData) => {
    if (localStreamData.active) { // Only add active streams
        localStreamData.stream?.getTracks().forEach(track => {
            try {
                targetClient.pc?.addTrack(track, localStreamData.stream as MediaStream);
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
  // REMOVE const app = window.app as AppWithStreamConfig;
  let stream: MediaStream | undefined;
  const streamConfig = getStreamState().streamConfig; // Get config from store
  const globalConfig = getAllConfig(); // Get global config

  // Handle different stream types
  if (changed === 'audio') {
    if (streamConfig.audio) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          groupId: globalConfig['audio-device']?.split('|')[0],
          deviceId: globalConfig['audio-device']?.split('|')[1]
        }
      });

      // Set up the stream for WebRTC
      setupStream(stream, "high");

      // Process audio for visualization if callback provided
      if (audioCb) {
        // Store the returned context/nodes
        audioProcessingContexts[changed] = await processAudio(stream, audioCb);
      }
    } else if (audioCb) {
      // Stop processing if it was running for this type
      if (audioProcessingContexts[changed]) {
        stopProcessingAudio(audioProcessingContexts[changed]);
        delete audioProcessingContexts[changed];
      }
      audioCb(0);
    }
  } else if (changed === 'video') {
    if (streamConfig.video) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          groupId: globalConfig['video-device']?.split('|')[0],
          deviceId: globalConfig['video-device']?.split('|')[1]
        }
      });

      // Apply background blur if enabled
      if (globalConfig['blur-video'] === 'yes') { // Use globalConfig
        try {
          const videoElem = document.createElement('video');
          videoElem.autoplay = true;
          videoElem.muted = true;
          videoElem.srcObject = stream;

          await new Promise<void>((resolve) => {
            videoElem.onloadedmetadata = () => {
              videoElem.play().then(() => resolve());
            };
          });

          const blurredStream = await backgroundChange(videoElem);
          setupStream(blurredStream, "low", "motion", true);
          stream = blurredStream;
        } catch (error) {
          console.error('Failed to apply background blur:', error);
          // Fallback to original stream if blur fails
          setupStream(stream, "low", "motion", true);
        }
      } else {
        setupStream(stream, "low", "motion", true);
      }
    }
  } else if (changed === 'screen') {
    if (streamConfig.screen) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { cursor: "always" } as any
      });
      setupStream(stream, "medium", 'detail', false);
    }
  } else if (changed === 'local') {
  }

  // Map the stream type
  let streamType: StreamType = 'custom';
  if (changed === 'audio') streamType = 'audio';
  else if (changed === 'video') streamType = 'camera';
  else if (changed === 'screen') streamType = 'screen';
  else if (changed === 'local') streamType = 'file';

  // Add to enhanced store structure
  addLocalStream(changed, stream || null, streamType, changed === 'local'?streamConfig.videoSrc || null: null);
};

export const setupLocalFileStream = (stream: MediaStream): void => {
  stream.getTracks().forEach(track => {
    setupTrack(track, stream!, "medium", undefined, false);
  });
  stream.onaddtrack = (ev: MediaStreamTrackEvent) => {
    setupTrack(ev.track, stream!, "medium", undefined, false);
  };
}

/**
 * Destroy a local stream
 */
export const destroyLocalStream = async (changed: 'audio' | 'video' | 'screen' | 'local', audioCb?: (instant: number) => void): Promise<void> => {
  // REMOVE const app = window.app as AppWithStreamConfig;
  const state = getStreamState();
  const localStreamData = state.localStreams[changed];

  if (localStreamData) {
    // Stop all tracks using the utility function
    if (localStreamData.stream) {
      await tearDownStream(localStreamData.stream);
    } else if (localStreamData.src) {
      // cleanup blob url
      URL.revokeObjectURL(localStreamData.src);
      const stream = getLocalFileStreamState().localFileStreams[localStreamData.src];
      if (stream) {
        await tearDownStream(stream);
      }
    }
    // Handle audio processing cleanup if needed
    if (changed === 'audio') {
      // Retrieve and stop the specific audio context
      const audioNodes = audioProcessingContexts[changed];
      stopProcessingAudio(audioNodes);
      delete audioProcessingContexts[changed]; // Remove from tracking
      if (audioCb) {
        audioCb(0); // Reset visualization
      }
    }

    // Remove from store
    removeLocalStream(changed);
  }
};

// Export utility functions from the original stream.ts
export { 
  normalizeStreamId,
} from './media/stream.js';

// REMOVE helper function sendNego
