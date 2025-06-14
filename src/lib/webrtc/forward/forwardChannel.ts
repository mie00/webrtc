import { getDirectClient } from '../../stores/connectionStore';
import {
  getForwardState,
  setForwardPeer,
  setForwardHost,
  addLogMessage,
  updateLogMessageStatus,
  removeInflight,
  clearLogMessages
} from '../../stores/forwardStore';
import {
  setSendHostInterval,
  clearSendHostInterval
} from '../../app/forwardLifecycle';
import { sendData } from '../../utils/arrayUtils';
import type { ForwardClient } from './types';
import { toggleForwardHandler } from '../../app/forwardHandler'; // Assuming toggleForwardHandler is here

/**
 * Set up forward channel for a client
 */
export function setupForwardChannel(cid: string): void {
  const client = getDirectClient(cid);
  const pc = client?.pc;
  if (!client || !pc) {
    console.error(
      `Client or PeerConnection not found for client ${cid} when setting up forward channel.`
    );
    return;
  }
  const forward = pc.createDataChannel('forward', {
    negotiated: true,
    id: 3
  });
  (client as ForwardClient).forward = forward;

  forward.onopen = () => {
    console.log(`Forward channel opened for client ${cid}`);
  };

  forward.onmessage = async (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    console.log('got message in forward channel from peer', data);

    const currentClient = getDirectClient(cid) as ForwardClient | null;
    if (!currentClient) {
      console.warn(`Client ${cid} disconnected, ignoring forward message.`);
      return;
    }

    const state = getForwardState();

    switch (data.type) {
      case 'offer':
        if (!('serviceWorker' in navigator)) {
          alert('Service workers are not supported by this browser. Forwarding will not work.');
          currentClient.forward?.send(
            JSON.stringify({
              type: 'offer.error',
              error: 'no service worker on peer'
            })
          );
          return;
        }

        const accepted = confirm(`Accept forwarding request from ${data.host} for client ${cid}?`);
        if (!accepted) {
          currentClient.forward?.send(
            JSON.stringify({
              type: 'offer.error',
              error: 'Forwarding request declined by user'
            })
          );
          return;
        }

        setForwardPeer(cid);
        setForwardHost(data.host);

        const url = new URL(window.location.href);
        url.searchParams.set('hosts_host', data.host);
        window.history.pushState(null, '', url.toString());

        const sendHost = () => {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'host',
              host: data.host
            });
          }
        };

        sendHost();
        clearSendHostInterval(); // Clear any existing interval
        setSendHostInterval(window.setInterval(sendHost, 10000));
        break;

      case 'request':
        addLogMessage(data.id, data.url);

        if (!state.allowedHosts.some((allowedHost: string) => data.url.startsWith(allowedHost))) {
          console.log(
            'Forwarding not allowed for URL:',
            data.url,
            'Allowed hosts:',
            state.allowedHosts
          );
          updateLogMessageStatus(data.id, '❌');
          currentClient.forward?.send(
            JSON.stringify({
              type: 'error',
              id: data.id,
              error: `URL not allowed: ${data.url}. Allowed hosts: ${state.allowedHosts.join(', ')}`
            })
          );
          return;
        }

        fetch(data.url, data) // data contains method, headers, body if any from service worker
          .then(async (response) => {
            currentClient.forward?.send(
              JSON.stringify({
                type: 'response',
                id: data.id,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(Array.from(response.headers.entries()))
              })
            );

            if (response.body === null) {
              currentClient.forward?.send(JSON.stringify({ type: 'end', id: data.id }));
              return;
            }
            const reader = response.body.getReader();
            await sendData(reader, data.id, currentClient.forward);
            updateLogMessageStatus(data.id, '✅');
          })
          .catch((err) => {
            console.error('Fetch error during forwarding:', err);
            currentClient.forward?.send(
              JSON.stringify({
                type: 'error',
                id: data.id,
                error: JSON.stringify(err, Object.getOwnPropertyNames(err))
              })
            );
            updateLogMessageStatus(data.id, '⭕');
          });
        break;

      case 'response':
      case 'data':
        const callback = state.inflight[data.id];
        if (callback) callback(data);
        break;

      case 'end':
      case 'error':
        const endCallback = state.inflight[data.id];
        if (endCallback) {
          endCallback(data);
          removeInflight(data.id);
        }
        break;

      case 'offer.end':
        clearSendHostInterval();
        clearLogMessages();
        // Potentially reset forwardPeer and forwardHost in store if this client was the peer
        if (state.forwardPeer === cid) {
          setForwardPeer(null);
          setForwardHost(null);
        }
        break;

      case 'offer.error':
        alert(`Failed to establish forwarding with client ${cid}: ${data.error}`);
        // Consider if toggleForwardHandler should be called or if state should be reset
        if (state.forwardPeer === cid) {
          // Only if this client was the one causing error
          await toggleForwardHandler(); // This might re-prompt, ensure it's desired behavior
        }
        break;

      default:
        console.log('Unknown message type in forward channel:', data);
    }
  };

  forward.onclose = () => {
    console.log(`Forward channel closed for client ${cid}`);
    // If this client was the active forwardPeer, clean up
    const currentState = getForwardState();
    if (currentState.forwardPeer === cid) {
      clearSendHostInterval();
      setForwardPeer(null);
      setForwardHost(null);
      clearLogMessages();
      // Maybe notify UI or service worker that forwarding stopped
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'host', host: null });
      }
    }
  };

  forward.onerror = (err) => {
    console.error(`Forward channel error for client ${cid}:`, err);
    // Similar cleanup as onclose if this client was the forwardPeer
    const currentState = getForwardState();
    if (currentState.forwardPeer === cid) {
      clearSendHostInterval();
      setForwardPeer(null);
      setForwardHost(null);
      clearLogMessages();
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'host', host: null });
      }
    }
  };
}
