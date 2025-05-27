import { registerCleanup } from '../stores/appStateStore';
import {
  setAllowedHosts,
  setForwardPeer,
  setForwardHost,
  clearLogMessages
} from '../stores/forwardStore';

// Store for interval ID, managed within this module
let sendHostInterval: number | null = null;

/**
 * Initialize the forward module
 * This maintains compatibility with the original forwardInit function
 */
export function forwardInit(): void {
  // Set up cleanup handler
  registerCleanup('forward', (cid?: string) => {
    if (cid) {
      // If a specific client ID is provided, this cleanup might be for a single client.
      // The original logic only cleared global state, so we'll stick to that for now.
      // If client-specific forward cleanup is needed, this would be the place.
      return;
    }
    if (sendHostInterval) {
      clearInterval(sendHostInterval);
      sendHostInterval = null;
    }

    // Update the Svelte store to reset forwarding state
    setAllowedHosts([]);
    setForwardPeer(null);
    setForwardHost(null);
    clearLogMessages();
  });
}

// Functions to manage sendHostInterval if needed by other parts of forward logic (e.g. forwardChannel.ts)
export function getSendHostInterval(): number | null {
  return sendHostInterval;
}

export function setSendHostInterval(intervalId: number | null): void {
  if (sendHostInterval && intervalId !== sendHostInterval) {
    clearInterval(sendHostInterval);
  }
  sendHostInterval = intervalId;
}

export function clearSendHostInterval(): void {
  if (sendHostInterval) {
    clearInterval(sendHostInterval);
    sendHostInterval = null;
  }
}
