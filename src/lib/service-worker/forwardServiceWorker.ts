import { getForwardState, addInflight } from '../stores/forwardStore';
import { getDirectClient } from '../stores/connectionStore';
import { concatUint8Arrays } from '../utils/arrayUtils';
import type { ForwardClient, ForwardResponse } from '../webrtc/forward/types';

/**
 * Initializes the service worker for forwarding and sets up message listeners.
 */
export function initForwardingServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported. Forwarding will not be available.');
    return;
  }

  navigator.serviceWorker
    .register('service-worker.js', { scope: '/' }) // Ensure service-worker.js is in the public root
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      console.log('Service Worker registered and ready with scope:', registration.scope);
    })
    .catch((err) => console.error('Service Worker registration failed:', err));

  const serviceWorkerMessageHandler = function (event: MessageEvent): void {
    console.log('Message from service worker:', event.data);
    const { id, ...requestData } = event.data; // id and other request properties (url, method, headers)

    const state = getForwardState();
    const forwardPeerCid = state.forwardPeer;

    if (!forwardPeerCid) {
      console.error('No forward peer CID set. Cannot forward service worker request.');
      // Optionally, inform the service worker that the request cannot be handled.
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'error',
          id: id,
          error: 'No active WebRTC forwarding peer configured.'
        });
      }
      return;
    }

    const client = getDirectClient(forwardPeerCid) as ForwardClient | null;
    if (!client || !client.forward || client.forward.readyState !== 'open') {
      console.error(
        `Forward peer client ${forwardPeerCid} not found or data channel not open. Cannot forward.`
      );
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'error',
          id: id,
          error: 'WebRTC forwarding peer not connected or channel closed.'
        });
      }
      return;
    }

    let accumulatedResponse: ForwardResponse = { data: [] };

    addInflight(id, (responseData: any) => {
      console.log('Inflight callback for service worker request:', id, responseData);
      if (responseData.type === 'error') {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(responseData); // Forward error to SW
        }
      } else if (responseData.type === 'response') {
        accumulatedResponse.response = responseData; // Store headers, status etc.
      } else if (responseData.type === 'data') {
        accumulatedResponse.data.push(new Uint8Array(responseData.chunk));
      } else if (responseData.type === 'end' && accumulatedResponse.response) {
        accumulatedResponse.response.body = concatUint8Arrays(accumulatedResponse.data);
        console.log(
          'Forwarding complete response to service worker:',
          accumulatedResponse.response
        );
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(accumulatedResponse.response);
        }
      } else {
        console.warn('Unhandled inflight data for service worker:', responseData);
      }
    });

    client.forward.send(
      JSON.stringify({
        type: 'request',
        id: id,
        ...requestData // Spread the rest of the data from the service worker (url, method, etc.)
      })
    );
  };

  navigator.serviceWorker.removeEventListener('message', serviceWorkerMessageHandler);
  navigator.serviceWorker.addEventListener('message', serviceWorkerMessageHandler);
}
