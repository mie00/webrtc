// This file is a bridge to the refactored stream handling modules.
// Please update imports to point directly to the new locations.

// Re-exports from streamStore (already likely imported directly elsewhere but good for facade)
export {
  streamStore,
  getStreamState,
  addLocalStream,
  removeLocalStream,
  addRemoteStream,
  removeRemoteStream,
  updateStreamConfig,
  getLocalStreamsByType
} from './stores/streamStore';

// Re-exports from media/stream (original stream.ts content)
export {
  type AudioNodes,
  normalizeStreamId, // Also available in trackHandler.ts, ensure consistency or pick one source
  setupStream,
  processAudio,
  stopProcessingAudio,
  tearDownStream
} from './media/stream';

// Re-export from media/background
export { backgroundChange } from './media/background';

// Initialization and lifecycle management
export { streamInit } from './app/streamLifecycle';

// WebRTC track handling
export { setupTrackHandler } from './webrtc/stream/trackHandler';

// Local stream management (device changes, etc.)
// localStreamManager.ts primarily sets up subscriptions and doesn't export much for direct call.
// If specific functions from it were intended to be public, they'd be exported there and then here.
// For now, its functionality is self-contained and starts upon import.
// We can export setAudioCallback if it was meant to be part of the public API of streamBridge.
export { setAudioCallback } from './media/localStreamManager';

// Ensure localStreamManager is imported so its subscriptions activate.
import './media/localStreamManager';
