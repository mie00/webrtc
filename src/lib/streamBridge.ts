import { 
  streamStore, 
  getStreamState, 
  addViewStream, 
  removeViewStream,
  addLocalStream,
  removeLocalStream,
  addRemoteStream,
  removeRemoteStream,
  type StreamType
} from '../stores/streamStore';
import { get } from 'svelte/store';
import { type AppWithStreamConfig, normalizeStreamId, getStreamElemId } from './media/stream'

// This module serves as a bridge between the WebRTC app and Svelte components

/**
 * Initialize the stream module with the app object
 * This maintains compatibility with the original streamInit function
 */
export function streamInit(originalApp: App): void {
  const app = originalApp as AppWithStreamConfig;
  // Store a reference to the app in the window for backward compatibility
  window.app = app;
  
  // Initialize app properties if they don't exist
  app.streams = app.streams || {};
  app.streamConfig = app.streamConfig || {};
  
  // Set up handlers for stream events
  app.nego_handlers['stream.end'] = (data: { stream: string }, cid: string) => {
    const streamId = normalizeStreamId(data.stream);
    
    // Remove from DOM (for backward compatibility)
    document.querySelectorAll(`.${getStreamElemId(streamId)}`).forEach(elem => elem.remove());
    
    // Remove from Svelte store (legacy)
    removeViewStream(streamId);
    
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
      // Clean up all streams
      Object.keys(app.streams || {}).forEach((streamId) => {
        const stream = app.streams![streamId];
        delete app.streams![streamId];
        
        try {
          Object.values(app.clients).forEach((client) => 
            sendNego(client, { type: 'stream.end', stream: normalizeStreamId(stream.id) })
          );
        } catch { }
        
        stream.getTracks().map((track) => track.stop());
        
        removeViewStream(normalizeStreamId(stream.id));
        
        // Remove from enhanced store structure
        removeLocalStream(streamId);
      });
    }
  };
  // Set up a subscription to sync store changes back to app object
  streamStore.subscribe(state => {
    // This ensures the app object stays in sync with the store
    app.streamConfig = { ...state.streamConfig };
  });
}

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(app: App, cid: string): void {
  app.clients[cid].pc?.addEventListener("track", async (ev: RTCTrackEvent) => {
    console.log("got track event", ev);
    
    const streamId = normalizeStreamId(ev.streams[0].id);
    
    // Add to Svelte store (legacy)
    addViewStream(streamId, ev.streams[0]);
    
    // Add to enhanced store structure
    addRemoteStream(cid, streamId, ev.streams[0]);
    
    // Create stream element (will be handled by Svelte component)
    // But also create a DOM element for backward compatibility
    ev.track.onended = (ev: Event) => {
      console.log(ev);
      const target = ev.target as MediaStreamTrack;
      const targetId = normalizeStreamId(target.id);
      
      // Notify other clients
      Object.values(app.clients).forEach((client) => 
        sendNego(client, { type: 'stream.end', stream: targetId })
      );
      
      // Remove from DOM
      document.querySelectorAll(`.${getStreamElemId(targetId)}`).forEach(elem => elem.remove());
      
      // Remove from Svelte store (legacy)
      removeViewStream(targetId);
      
      // Remove from enhanced store structure
      removeRemoteStream(cid, targetId);
    };
    
    // Forward to other clients
    for (let cid2 of Object.keys(app.clients)) {
      if (cid == cid2) continue;
      app.clients[cid2].pc?.addTrack(ev.track, ev.streams[0]);
    }
  });
  
  // TODO: Add existing streams to new client
}

/**
 * Enhanced version of setupLocalStream that uses the new store structure
 */
export const setupLocalStream = async (changed: 'audio' | 'video' | 'screen' | 'local', audioCb?: (instant: number) => void): Promise<void> => {
  // Import the original function to maintain compatibility
  const { setupLocalStream: originalSetupLocalStream } = await import('./media/stream');
  
  // Call the original function first to maintain backward compatibility
  await originalSetupLocalStream(changed, audioCb);
  
  // Now update our enhanced store structure
  const app = window.app as AppWithStreamConfig;
  
  if (app.streams && app.streams[changed]) {
    // Map the stream type
    let streamType: StreamType = 'custom';
    if (changed === 'audio') streamType = 'audio';
    else if (changed === 'video') streamType = 'camera';
    else if (changed === 'screen') streamType = 'screen';
    else if (changed === 'local') streamType = 'file';
    
    // Add to enhanced store structure
    addLocalStream(changed, app.streams[changed], streamType);
  } else {
    // If the stream was removed, remove it from our enhanced store too
    removeLocalStream(changed);
  }
};

// Export utility functions from the original stream.ts
export { 
  normalizeStreamId, 
  getStreamElemId, 
  processAudio, 
  stopProcessingAudio, 
  tearDownStream, 
  setupTrack, 
  setupStream, 
  getStreamsDims, 
  refreshStreamViews,
  destroyLocalStream,
} from './media/stream';

// Helper function to send negotiation messages
function sendNego(client: WebRTCClient, data: any): void {
  try {
    client.nego_dc?.send(JSON.stringify(data));
  } catch (e) {
    console.log("error sending data", data, "to", client, "error", e);
  }
}
