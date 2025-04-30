import { streamStore, getStreamState, addStream, addViewStream, removeStream, removeViewStream } from '../stores/streamStore';
import { get } from 'svelte/store';

// This module serves as a bridge between the WebRTC app and Svelte components

/**
 * Initialize the stream module with the app object
 * This maintains compatibility with the original streamInit function
 */
export function streamInit(app: App): void {
  // Store a reference to the app in the window for backward compatibility
  window.app = app;
  
  // Initialize app properties if they don't exist
  app.streams = app.streams || {};
  app.viewStreams = app.viewStreams || {};
  app.streamConfig = app.streamConfig || {};
  
  // Set up handlers for stream events
  app.nego_handlers['stream.end'] = (data: { stream: string }, cid: string) => {
    const streamId = normalizeStreamId(data.stream);
    
    // Remove from DOM (for backward compatibility)
    document.querySelectorAll(`.${getStreamElemId(streamId)}`).forEach(elem => elem.remove());
    
    // Remove from app object
    delete app.viewStreams[streamId];
    
    // Remove from Svelte store
    removeViewStream(streamId);
    
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
        
        // Remove from Svelte store
        removeStream(streamId);
        removeViewStream(normalizeStreamId(stream.id));
      });
    }
  };
  
  // Sync initial state with Svelte store
  const currentState = getStreamState();
  
  // Sync app.streams with store
  Object.entries(app.streams || {}).forEach(([key, stream]) => {
    if (!currentState.streams[key]) {
      addStream(key, stream);
    }
  });
  
  // Sync app.viewStreams with store
  Object.entries(app.viewStreams || {}).forEach(([key, stream]) => {
    if (!currentState.viewStreams[key]) {
      addViewStream(key, stream);
    }
  });
  
  // Set up a subscription to sync store changes back to app object
  streamStore.subscribe(state => {
    // This ensures the app object stays in sync with the store
    app.streams = { ...state.streams };
    app.viewStreams = { ...state.viewStreams };
    app.streamConfig = { ...state.streamConfig };
  });
}

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(app: App, cid: string): void {
  app.clients[cid].pc.addEventListener("track", async (ev: RTCTrackEvent) => {
    console.log("got track event", ev);
    
    const streamId = normalizeStreamId(ev.streams[0].id);
    
    // Add to app object (for backward compatibility)
    app.viewStreams![streamId] = ev.streams[0];
    
    // Add to Svelte store
    addViewStream(streamId, ev.streams[0]);
    
    // Create stream element (will be handled by Svelte component)
    // But also create a DOM element for backward compatibility
    await createStreamElement(ev.streams[0], ev.track.kind as 'audio' | 'video', { muted: false });
    
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
      
      // Remove from app object
      delete app.viewStreams![targetId];
      
      // Remove from Svelte store
      removeViewStream(targetId);
    };
    
    // Forward to other clients
    for (let cid2 of Object.keys(app.clients)) {
      if (cid == cid2) continue;
      app.clients[cid2].pc.addTrack(ev.track, ev.streams[0]);
    }
  });
  
  // Add existing streams to new client
  for (let stream of Object.values(app.viewStreams || {})) {
    stream.getTracks().forEach(function (track) {
      app.clients[cid].pc.addTrack(track, stream);
    });
  }
}

// Export utility functions from the original stream.ts
export { 
  normalizeStreamId, 
  getStreamElemId, 
  processAudio, 
  stopProcessingAudio, 
  tearDownStream, 
  setupTrack, 
  setupStream, 
  setupLocalStream, 
  getStreamsDims, 
  refreshStreamViews, 
  createStreamElement, 
  setButton 
} from '../../js/stream';

// Helper function to send negotiation messages
function sendNego(client: WebRTCClient, data: any): void {
  try {
    client.nego_dc?.send(JSON.stringify(data));
  } catch (e) {
    console.log("error sending data", data, "to", client, "error", e);
  }
}
