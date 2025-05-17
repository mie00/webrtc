import { 
  streamStore, 
  getStreamState, 
  addLocalStream,
  removeLocalStream,
  addRemoteStream,
  removeRemoteStream,
  updateStreamConfig
} from '../stores/streamStore.js';
import {
  getAllConfig,
  configStore,
  type Config
} from '../stores/configStore.js';
import { getDirectClient, getAllDirectClients, getAllClientCids } from '../stores/connectionStore.js'; // Adjust path if needed
import { 
  registerNegoHandler, 
  registerCleanup 
} from '../stores/appStateStore.js'; // Import store functions
import {
  type AudioNodes, // Import new type
  normalizeStreamId,
  setupStream,
  processAudio,
  stopProcessingAudio,
  setupTrack,
  tearDownStream,
} from './media/stream.js'
// Export background utilities
import { backgroundChange } from './media/background.js';
import { getLocalFileStreamState } from '..//stores/localFileStreamStore.js';

// Module-level storage for audio processing contexts/nodes
let audioProcessingContexts: Record<string, AudioNodes | null> = {};

/**
 * Initialize the stream module
 */
export function streamInit(): void {
  // Set up handlers for stream events
  registerNegoHandler('stream.end', (data: { stream: string }, cid: string) => {
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
  });
  // Set up cleanup handler
  registerCleanup('stream', (cid?: string) => {
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
  });

}

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(cid: string): void { // app might be needed for global config
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
    if (localStreamData.active && localStreamData.sendable) { // Only add active and sendable streams
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

// Module-level storage for audio callback
let audioCbFunction: ((instant: number) => void) | undefined;

// Track previous config state for device changes
let prevConfigState: Partial<Config> = {};

// Subscribe to config changes to detect device changes
configStore.subscribe(config => {
  // Check for device changes that might require stream restart
  const deviceKeys = ['audio-device', 'video-device', 'blur-video'];
  const streamState = getStreamState();
  
  // For each device config that changed
  deviceKeys.forEach(key => {
    if (prevConfigState[key] !== config[key]) {
      // Update the device in streamConfig
      if (key === 'audio-device') {
        // If audio is enabled, update with new device
        if (streamState.streamConfig.audio !== null) {
          updateStreamConfig({ audio: config[key] });
        }
      } else if (key === 'video-device') {
        // If camera is enabled, update with new device
        if (streamState.streamConfig.camera !== null) {
          updateStreamConfig({ camera: config[key] });
        }
      } else if (key === 'blur-video' && streamState.streamConfig.camera !== null) {
        // Just restart the camera if blur setting changes
        const currentDevice = streamState.streamConfig.camera;
        updateStreamConfig({ camera: null });
        setTimeout(() => updateStreamConfig({ camera: currentDevice }), 100);
      }
    }
  });
  
  // Update previous state
  prevConfigState = { ...config };
});

// Create derived stores for the specific values we need to watch
import { derived } from 'svelte/store';

// Derived store for audio device changes
const audioDevice = derived(streamStore, $state => $state.streamConfig.audio);
// Derived store for camera device changes
const cameraDevice = derived(streamStore, $state => $state.streamConfig.camera);
// Derived store for screen sharing state
const screenSharing = derived(streamStore, $state => $state.streamConfig.screen);
// Derived store for file streaming
const fileStream = derived(streamStore, $state => $state.streamConfig.file);

// Subscribe to audio device changes
audioDevice.subscribe(async (audio) => {
  if (audio !== null) {
    // Set up audio stream
    const deviceInfo = audio.split('|') || [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceInfo.length === 2 ? {
        groupId: deviceInfo[0],
        deviceId: deviceInfo[1]
      } : true
    });

    // Set up the stream for WebRTC
    setupStream(stream, "high");

    // Process audio for visualization if callback provided
    if (audioCbFunction) {
      // Store the returned context/nodes
      audioProcessingContexts['audio'] = await processAudio(
        stream, 
        (dataArray, analyser) => {
          // Calculate the average level from the frequency data
          if (dataArray.length > 0) {
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avgLevel = sum / dataArray.length;
            // Call the original callback with the average level
            audioCbFunction?.(avgLevel);
          } else {
            audioCbFunction?.(0);
          }
        }
      );
    }
    
    // Add to enhanced store structure - audio is both viewable and sendable
    addLocalStream('audio', stream, null, true, true);
  } else {
    // Clean up audio stream
    const state = getStreamState(); // Get current stream state
    const localStreamData = state.localStreams['audio'];
    if (localStreamData?.stream) {
      await tearDownStream(localStreamData.stream);
      
      // Handle audio processing cleanup
      const audioNodes = audioProcessingContexts['audio'];
      stopProcessingAudio(audioNodes);
      delete audioProcessingContexts['audio']; // Remove from tracking
      if (audioCbFunction) {
        audioCbFunction(0); // Reset visualization
      }
      
      // Remove from store
      removeLocalStream('audio');
    }
  }
});

// Subscribe to camera device changes
cameraDevice.subscribe(async (camera) => {
  const globalConfig = getAllConfig();
  if (camera !== null) {
    // Set up camera stream
    const deviceInfo = camera.split('|') || [];
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceInfo.length === 2 ? {
        groupId: deviceInfo[0],
        deviceId: deviceInfo[1]
      } : true
    });

    // Apply background blur if enabled
    if (globalConfig['blur-video'] === 'yes') {
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
        
        // Add to enhanced store structure - blurred camera is viewable and sendable
        addLocalStream('camera', blurredStream, null, true, true);
      } catch (error) {
        console.error('Failed to apply background blur:', error);
        // Fallback to original stream if blur fails
        setupStream(stream, "low", "motion", true);
        
        // Add to enhanced store structure - regular camera is viewable and sendable
        addLocalStream('camera', stream, null, true, true);
      }
    } else {
      setupStream(stream, "low", "motion", true);
      
      // Add to enhanced store structure - regular camera is viewable and sendable
      addLocalStream('camera', stream, null, true, true);
    }
  } else {
    // Clean up camera stream
    const state = getStreamState(); // Get current stream state
    const localStreamData = state.localStreams['camera'];
    if (localStreamData?.stream) {
      await tearDownStream(localStreamData.stream);
      
      // Remove from store
      removeLocalStream('camera');
    }
  }
});

// Subscribe to screen sharing changes
screenSharing.subscribe(async (screen) => {
  if (screen) {
    // Set up screen sharing
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { cursor: "always" } as any
    });
    setupStream(stream, "medium", 'detail', false);
    
    // Add to enhanced store structure - screen sharing is viewable and sendable
    addLocalStream('screen', stream, null, true, true);
  } else {
    // Clean up screen sharing
    const state = getStreamState(); // Get current stream state
    const localStreamData = state.localStreams['screen'];
    if (localStreamData?.stream) {
      await tearDownStream(localStreamData.stream);
      
      // Remove from store
      removeLocalStream('screen');
    }
  }
});

// Subscribe to file stream changes
fileStream.subscribe(async (file) => {
  if (file !== null) {
    // File stream is handled differently - the actual stream setup happens in handleFilePlay
    // Just add the placeholder to the store - file is viewable but not sendable initially
    addLocalStream('file', null, file, true, false);
  } else {
    // Clean up file stream
    const state = getStreamState(); // Get current stream state
    const localStreamData = state.localStreams['file'];
    if (localStreamData) {
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
      
      // Remove from store
      removeLocalStream('file');
    }
  }
});

// Helper function to set audio callback
export function setAudioCallback(callback: (instant: number) => void) {
  audioCbFunction = callback;
}

export const setupLocalFileStream = (stream: MediaStream): void => {
  stream.getTracks().forEach(track => {
    setupTrack(track, stream!, "medium", undefined, false);
  });
  stream.onaddtrack = (ev: MediaStreamTrackEvent) => {
    setupTrack(ev.track, stream!, "medium", undefined, false);
  };
}

// Export utility functions from the original stream.ts
export { 
  normalizeStreamId,
} from './media/stream.js';

// REMOVE helper function sendNego
