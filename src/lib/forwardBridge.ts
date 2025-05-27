// This file is a bridge to the refactored forwarding modules.
// Please update imports to point directly to the new locations.

// Re-exports from forwardStore
export type { LogMessage, ForwardState } from './stores/forwardStore';
export {
  initialState as forwardInitialState, // Rename to avoid conflict if initialState is used locally
  forwardStore,
  getForwardState,
  setAllowedHosts,
  setForwardPeer,
  setForwardHost,
  addInflight,
  removeInflight,
  addLogMessage,
  updateLogMessageStatus,
  clearLogMessages
} from './stores/forwardStore';

// Re-exports from app/forwardLifecycle
export { forwardInit } from './app/forwardLifecycle';

// Re-exports from webrtc/forward/types
export type { ForwardClient, ForwardResponse } from './webrtc/forward/types';

// Re-exports from webrtc/forward/forwardChannel
export { setupForwardChannel } from './webrtc/forward/forwardChannel';

// Re-exports from app/forwardHandler
export { toggleForwardHandler } from './app/forwardHandler';

// Re-exports from service-worker/forwardServiceWorker
export { initForwardingServiceWorker } from './service-worker/forwardServiceWorker';

// Re-exports from utils/arrayUtils (if concatUint8Arrays was part of public API)
export { concatUint8Arrays } from './utils/arrayUtils';

// Ensure service worker initialization logic runs if it was top-level in original bridge
// This is now explicitly called via initForwardingServiceWorker()
