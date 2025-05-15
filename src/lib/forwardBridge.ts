import { writable, get } from 'svelte/store';
import { getDirectClient, getAllDirectClients } from '../stores/connectionStore.js'; // Adjust path if needed
import { registerCleanup } from '../stores/appStateStore.js'; // Import store function

// Forward state interface
export interface LogMessage {
  id: string;
  text: string;
  status: string; // e.g., '🌀', '✅', '❌', '⭕'
}

export interface ForwardState {
  allowedHosts: string[];
  forwardPeer: string | null;
  forwardHost: string | null;
  inflight: Record<string, (data: any) => void>;
  logMessages: LogMessage[];
}

// Initial state
const initialState: ForwardState = {
  allowedHosts: [],
  forwardPeer: null,
  forwardHost: null,
  inflight: {},
  logMessages: []
};

// Create the store
export const forwardStore = writable<ForwardState>(initialState);

// Helper functions
export function getForwardState() {
  return get(forwardStore);
}

export function setAllowedHosts(host: string[]): void {
  forwardStore.update(state => ({
    ...state,
    allowedHosts: host
  }));
}

export function setForwardPeer(peer: string | null): void {
  forwardStore.update(state => ({
    ...state,
    forwardPeer: peer
  }));
}

export function setForwardHost(host: string | null): void {
  forwardStore.update(state => ({
    ...state,
    forwardHost: host
  }));
}

export function addInflight(id: string, callback: (data: any) => void): void {
  forwardStore.update(state => {
    const inflight = { ...state.inflight };
    inflight[id] = callback;
    return { ...state, inflight };
  });
}

export function removeInflight(id: string): void {
  forwardStore.update(state => {
    const inflight = { ...state.inflight };
    delete inflight[id];
    return { ...state, inflight };
  });
}

export function addLogMessage(id: string, text: string): void {
  forwardStore.update(state => ({
    ...state,
    logMessages: [...state.logMessages, { id, text, status: '🌀' }]
  }));
}

export function updateLogMessageStatus(id: string, status: string): void {
  forwardStore.update(state => ({
    ...state,
    logMessages: state.logMessages.map(msg =>
      msg.id === id ? { ...msg, status } : msg
    )
  }));
}

export function clearLogMessages(): void {
  forwardStore.update(state => ({
    ...state,
    logMessages: []
  }));
}

/**
 * Initialize the forward module
 * This maintains compatibility with the original forwardInit function
 */
export function forwardInit(): void {
  // Set up cleanup handler
  registerCleanup('forward', (cid?: string) => {
    if (cid) {
      return;
    }
    if (sendHostInterval) {
      clearInterval(sendHostInterval);
      sendHostInterval = null;
    }
    
    // Update the Svelte store
    setAllowedHosts([]);
    setForwardPeer(null);
    setForwardHost(null);
    clearLogMessages();
  });
}

// Export utility functions from the original forward.ts
import { 
  sendData, 
  concatUint8Arrays,
  setButton
} from './webrtc/forward.js';

export { concatUint8Arrays }; // Export for use in tests or other modules

// Store for interval ID
let sendHostInterval: number | null = null;

/**
 * Set up forward channel for a client
 */
export function setupForwardChannel(cid: string): void {
  const client = getDirectClient(cid);
  const pc = client?.pc;
  if (!client || !pc) {
    console.error(`Client or PeerConnection not found for client ${cid} when setting up forward channel (bridge).`);
    return;
  }
  const forward = pc.createDataChannel("forward", {
    negotiated: true,
    id: 3
  });
  (client as ForwardClient).forward = forward; // Assign to the retrieved client object

  forward.onopen = () => {
  };

  forward.onmessage = async (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    console.log("got message in forward channel from peer", data);

    // Re-fetch client in case state changed
    const currentClient = getDirectClient(cid);
    if (!currentClient) return; // Client might have disconnected

    // Get the current state from the store
    const state = getForwardState();

    switch (data.type) {
      case "offer":
        if (!('serviceWorker' in navigator)) {
          alert("cannot do service workers, won't be able to do forwarding");
          (currentClient as ForwardClient).forward?.send(JSON.stringify({ // Use currentClient
            type: "offer.error",
            error: "no service worker on peer"
          }));
          return;
        }
        
        // Update the forward peer in the store
        setForwardPeer(cid);
        setForwardHost(data.host);

        // add hosts_host to url params of current page
        const url = new URL(window.location.href);
        url.searchParams.set('hosts_host', data.host);
        window.history.pushState(null, '', url.toString());
        
        const sendHost = () => {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'host',
              host: data.host,
            });
          }
        };

        sendHost();
        // Manage interval using our local variable
        if (sendHostInterval) {
          clearInterval(sendHostInterval);
          sendHostInterval = null;
        }
        sendHostInterval = window.setInterval(sendHost, 10000);
        // Iframe creation will be handled by Svelte component based on allowedHosts
        break;

      case "request":
        addLogMessage(data.id, data.url);

        // Use allowed_host from the store via state variable
        if (!data.url.startsWith(state.allowedHosts || '')) {
          console.log("not allowed", state.allowedHosts, data.url);
          updateLogMessageStatus(data.id, '❌');
          return;
        }

        fetch(data.url, data).then(async response => {
          (currentClient as ForwardClient).forward?.send(JSON.stringify({ // Use currentClient
            type: "response",
            id: data.id,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(Array.from(response.headers.entries())),
          }));
          
          return (async function(): Promise<void> {
            if (response.body === null) {
              (currentClient as ForwardClient).forward?.send(JSON.stringify({ // Use currentClient
                type: "end",
                id: data.id,
              }));
              return; // Return void, not null
            }
            const reader = response.body.getReader();
            // Pass currentClient's forward channel to sendData
            await sendData(reader, data.id, (currentClient as ForwardClient).forward);
            updateLogMessageStatus(data.id, '✅');
          }());
        }).catch(err => {
          (currentClient as ForwardClient).forward?.send(JSON.stringify({ // Use currentClient
            type: "error",
            err: JSON.stringify(err, Object.getOwnPropertyNames(err)),
          }));
          updateLogMessageStatus(data.id, '⭕');
        });
        break;
        
      case "response":
      case "data":
        const callback = state.inflight[data.id];
        if (callback) callback(data);
        break;
        
      case "end":
      case "error":
        const endCallback = state.inflight[data.id];
        if (endCallback) {
          endCallback(data);
          removeInflight(data.id);
        }
        break;

      case "offer.end":
        // Use local variable for interval management
        if (sendHostInterval) {
          clearInterval(sendHostInterval);
          sendHostInterval = null;
        }
        // Iframe removal will be handled by Svelte component
        clearLogMessages();
        break;
        
      case "offer.error":
        alert("failed to forward to the other side");
        await toggleForwardHandler();
        break;
        
      default:
        console.log("unknown message type", data);
    }
  };
}

// Store the last forwarded URL
let lastForwardedUrl: string = "http://127.0.0.1:5001";

/**
 * Toggle forward handler - adapted to work with Svelte store
 */
export const toggleForwardHandler = async (): Promise<void> => {
  const clients = getAllDirectClients(); // Get clients from store
  const state = getForwardState();

  if (!state.allowedHosts.length) {
    let val = prompt("Please enter the url to forward", lastForwardedUrl);
    
    if (val) {
      lastForwardedUrl = val;
    } else {
      alert("empty value");
      return;
    }

    try {
      const res = await fetch(val);
      await res.arrayBuffer();
    } catch {
      if (val.startsWith('http://127.0.0.1') || val.startsWith('http://localhost')) {
        val = val.replace(/http:\/\/[^/:]+/, 'http://local.mie00.com');
        try {
          const res = await fetch(val);
          await res.arrayBuffer();
        } catch {
          alert(`error doing fetch, use firefox. Or if you want to keep using chrome, click on the site settings besides the url and choose "Allow" for "Insecure content"`);
          return;
        }
      } else {
        alert("error doing fetch, make sure CORS is set to allow requests from " + window.location.host);
        return;
      }
    }

    // Update the store (app object syncs via subscription if needed)
    setAllowedHosts([val]);
    // Log container creation will be handled by Svelte component

    for (const clientId in clients) { // Iterate over clients from store
      const client = clients[clientId] as ForwardClient;
      if (client.forward && client.forward.readyState === 'open') {
        client.forward.send(JSON.stringify({ type: "offer", host: val }));
      }
    }
  } else {
    // Send offer.end to clients from store
    for (const clientId in clients) {
      const client = clients[clientId] as ForwardClient;
      if (client.forward && client.forward.readyState === 'open') {
        client.forward.send(JSON.stringify({
          type: "offer.end",
          host: state.allowedHosts // Use host from store state
        }));
      }
    }
    
    // Log container removal will be handled by Svelte component
    // Update both the app and the store
    setAllowedHosts([]);
    clearLogMessages();
  }
  // Button state will be handled reactively in Svelte component
};

// Type definitions
interface ForwardClient extends WebRTCClient {
  forward: RTCDataChannel;
}

interface ForwardResponse {
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: Uint8Array;
  };
  data: Uint8Array[];
}

// Initialize service worker if available
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(
    'service-worker.js',
    { scope: '/' }
  )
    .then(() => navigator.serviceWorker
      .ready
      .then((worker) => {
        console.log(worker);
      })
    )
    .catch((err) => console.log(err));
  
  const handler = function(event: MessageEvent): void {
    console.log('got event from service worker, sending message to peer', event);
    const id = event.data.id;
    
    // Get current state from store
    const state = getForwardState();
    const forwardPeer = state.forwardPeer;
    
    if (!forwardPeer) {
      console.error('No forward peer available');
      return;
    }
    
    // Get client from store
    const client = getDirectClient(forwardPeer) as ForwardClient;
    if (!client || !client.forward) {
      console.error('Forward client not available');
      return;
    }
    
    let r: ForwardResponse = { data: [] };
    
    addInflight(id, (data: any) => {
      console.log('called inflight', id, data);
      if (data.type === 'error') {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(data);
        }
      } else if (data.type === 'response') {
        r.response = data;
      } else if (data.type === 'data') {
        r.data.push(new Uint8Array(data.chunk));
      } else if (data.type === 'end' && r.response) {
        r.response.body = concatUint8Arrays(r.data);
        console.log(r.data, r.response.body);
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(r.response);
        }
      }
    });
    
    client.forward.send(JSON.stringify({
      type: "request",
      ...event.data
    }));
  };
  
  navigator.serviceWorker.addEventListener('message', handler);
}
