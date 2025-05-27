import { getAllDirectClients } from '../stores/connectionStore';
import {
  getForwardState,
  setAllowedHosts,
  clearLogMessages
  // Potentially add setForwardPeer, setForwardHost if toggle should reset them directly
} from '../stores/forwardStore';
import type { ForwardClient } from '../webrtc/forward/types'; // Path to types

// Store the last forwarded URL to prefill the prompt
let lastForwardedUrls: string = 'http://127.0.0.1:11434';

/**
 * Toggle forward handler - adapted to work with Svelte store and modular structure
 */
export const toggleForwardHandler = async (): Promise<void> => {
  const clients = getAllDirectClients();
  const state = getForwardState();

  if (!state.allowedHosts.length) {
    // Currently not forwarding, so prompt to start
    let valsInput = prompt(
      'Please enter the URL(s) to forward (comma-separated)',
      lastForwardedUrls
    );

    if (valsInput === null) {
      // User cancelled prompt
      return;
    }
    if (!valsInput.trim()) {
      alert('Empty value. Forwarding not started.');
      return;
    }
    lastForwardedUrls = valsInput; // Save for next time
    const urlsToForward = valsInput
      .split(',')
      .map((val) => val.trim())
      .filter((url) => url.length > 0);

    if (!urlsToForward.length) {
      alert('No valid URLs provided. Forwarding not started.');
      return;
    }

    const validatedHosts: string[] = [];
    for (const urlString of urlsToForward) {
      try {
        // Basic validation: can we construct a URL object?
        new URL(urlString); // This doesn't check reachability, just format.
        // More robust validation (like the original fetch check) can be added here if needed.
        // The original fetch check was complex and involved potential http->local.mie00.com replacement.
        // For simplicity in refactoring, I'm starting with basic URL validation.
        // The actual fetch will happen in the service worker or forwardChannel.ts.
        validatedHosts.push(urlString);
      } catch (e) {
        alert(`Invalid URL format: ${urlString}. It will be ignored.`);
      }
    }

    if (!validatedHosts.length) {
      alert('No valid URLs to forward after validation. Forwarding not started.');
      return;
    }

    setAllowedHosts(validatedHosts);
    // UI should react to allowedHosts changing to show logs/status

    // Send 'offer' to all connected clients that have an open forward channel
    for (const clientId in clients) {
      const client = clients[clientId] as ForwardClient;
      if (client.forward && client.forward.readyState === 'open') {
        client.forward.send(JSON.stringify({ type: 'offer', host: validatedHosts[0] })); // Original used first host
      }
    }
  } else {
    // Currently forwarding, so stop
    for (const clientId in clients) {
      const client = clients[clientId] as ForwardClient;
      if (client.forward && client.forward.readyState === 'open') {
        client.forward.send(JSON.stringify({ type: 'offer.end' }));
      }
    }
    setAllowedHosts([]); // This will trigger UI to hide logs/status
    clearLogMessages();
    // forwardPeer and forwardHost are reset by forwardChannel.ts on 'offer.end' or close/error
  }
  // UI button state should react to `allowedHosts.length`
};
