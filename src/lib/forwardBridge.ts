import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';

// Forward state interface
export interface ForwardState {
  allowedHost: string | null;
  forwardPeer: string | null;
  inflight: Record<string, (data: any) => void>;
}

// Initial state
const initialState: ForwardState = {
  allowedHost: null,
  forwardPeer: null,
  inflight: {}
};

// Create the store
export const forwardStore = writable<ForwardState>(initialState);

// Helper functions
export function getForwardState() {
  return get(forwardStore);
}

export function setAllowedHost(host: string | null): void {
  forwardStore.update(state => ({
    ...state,
    allowedHost: host
  }));
}

export function setForwardPeer(peer: string | null): void {
  forwardStore.update(state => ({
    ...state,
    forwardPeer: peer
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

/**
 * Initialize the forward module with the app object
 * This maintains compatibility with the original forwardInit function
 */
export function forwardInit(originalApp: App): void {
  const app = originalApp as ForwardApp;
  
  // Initialize app properties if they don't exist
  app.allowed_host = app.allowed_host || null;
  app.inflight = app.inflight || {};
  
  // Set up cleanup handler
  app.cleanups['forward'] = (cid?: string) => {
    if (cid) {
      return;
    }
    if (app._send_host_interval) {
      clearInterval(app._send_host_interval);
      app._send_host_interval = null;
    }
    
    // Update the Svelte store
    setAllowedHost(null);
    setForwardPeer(null);
  };
  
  // Sync initial state with Svelte store
  const currentState = getForwardState();
  
  // Sync app state with store
  if (app.allowed_host !== currentState.allowedHost) {
    setAllowedHost(app.allowed_host);
  }
  
  if (app.forward_peer !== currentState.forwardPeer) {
    setForwardPeer(app.forward_peer);
  }
  
  // Set up a subscription to sync store changes back to app object
  forwardStore.subscribe(state => {
    // This ensures the app object stays in sync with the store
    app.allowed_host = state.allowedHost;
    app.forward_peer = state.forwardPeer;
    app.inflight = { ...state.inflight };
  });
}

// Export utility functions from the original forward.ts
import { 
  sendData, 
  concatUint8Arrays,
  setButton
} from './webrtc/forward.js';

/**
 * Set up forward channel for a client
 */
export function setupForwardChannel(originalApp: App, cid: string): void {
  const app = originalApp as ForwardApp;
  const pc = app.clients[cid]?.pc;
  if (!pc) {
    console.error(`PeerConnection not found for client ${cid} when setting up forward channel (bridge).`);
    return;
  }
  const forward = pc.createDataChannel("forward", {
    negotiated: true,
    id: 3
  });
  (app.clients[cid] as ForwardClient).forward = forward;
  
  forward.onopen = () => {
    const chat = document.getElementById('chat') as HTMLInputElement;
    if (chat) chat.select();
  };
  
  forward.onmessage = async (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    console.log("got message in forward channel from peer", data);
    
    // Get the current state from the store
    const state = getForwardState();
    
    switch (data.type) {
      case "offer":
        if (!('serviceWorker' in navigator)) {
          alert("cannot do service workers, won't be able to do forwarding");
          (app.clients[cid] as ForwardClient).forward.send(JSON.stringify({
            type: "offer.error",
            error: "no service worker on peer"
          }));
          return;
        }
        
        // Update the forward peer in both app and store
        setForwardPeer(cid);
        
        // add hosts_host to url params of current page, not iframe
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
        if (app._send_host_interval) {
          clearInterval(app._send_host_interval);
          app._send_host_interval = null;
        }
        app._send_host_interval = window.setInterval(sendHost, 10000);

        const mediaElement = document.getElementById('media');
        if (mediaElement) {
          let iframeElement = document.createElement('iframe');
          mediaElement.appendChild(iframeElement);
          iframeElement.src = `/iframe-content.html?host=${data.host}`;
          iframeElement.id = `iframe-${data.host}`;
          iframeElement.classList.add('w-full', 'h-screen', 'bg-white');
          iframeElement.setAttribute('allowTransparency', 'false');
        }
        break;
        
      case "request":
        const logElement = document.getElementById(`log-${app.allowed_host}`);
        if (logElement) {
          let logLine = document.createElement('p');
          logLine.id = `ll-${data.id}`;
          logElement.insertBefore(logLine, logElement.firstChild);
          logLine.innerHTML = `${data.url}`;
          const status = document.createElement('span');
          status.id = `lls-${data.id}`;
          status.classList.add("right");
          status.innerHTML = '🌀';
          logLine.appendChild(status);
          
          if (!data.url.startsWith(app.allowed_host || '')) {
            console.log("not allowed", app.allowed_host, data.url);
            status.innerHTML = '❌';
            return;
          }
          
          fetch(data.url, data).then(async response => {
            (app.clients[cid] as ForwardClient).forward.send(JSON.stringify({
              type: "response",
              id: data.id,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(Array.from(response.headers.entries())),
            }));
            
            return (async function(): Promise<void> {
              if (response.body === null) {
                (app.clients[cid] as ForwardClient).forward.send(JSON.stringify({
                  type: "end",
                  id: data.id,
                }));
                return null;
              }
              const reader = response.body.getReader();
              await sendData(reader, data.id, cid);
              if (status) status.innerHTML = '✅';
            }());
          }).catch(err => {
            (app.clients[cid] as ForwardClient).forward.send(JSON.stringify({
              type: "error",
              err: JSON.stringify(err, Object.getOwnPropertyNames(err)),
            }));
            if (status) status.innerHTML = '⭕';
          });
        }
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
        if (app._send_host_interval) {
          clearInterval(app._send_host_interval);
          app._send_host_interval = null;
        }
        const iframeElem = document.getElementById(`iframe-${data.host}`);
        if (iframeElem) iframeElem.remove();
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

/**
 * Toggle forward handler - adapted to work with Svelte store
 */
export const toggleForwardHandler = async (): Promise<void> => {
  const forwardApp = window.app as ForwardApp;
  const state = getForwardState();
  
  if (!state.allowedHost) {
    let val = prompt("Please enter the url to forward",
      forwardApp._last_forwarded || "http://127.0.0.1:5001");
    
    if (val) {
      forwardApp._last_forwarded = val;
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

    // Update both the app and the store
    setAllowedHost(val);
    
    for (const clientId in forwardApp.clients) {
      const client = forwardApp.clients[clientId] as ForwardClient;
      if (client.forward) {
        client.forward.send(JSON.stringify({ type: "offer", host: val }));
      }
    }

    const mediaElement = document.getElementById('media');
    if (mediaElement) {
      let logElement = document.createElement('div');
      mediaElement.appendChild(logElement);
      logElement.id = `log-${val}`;
      logElement.classList.add('w-full', 'max-h-screen', 'bg-white', 'overflow-x-hidden', 'overflow-y-scroll');
    }
  } else {
    for (const clientId in forwardApp.clients) {
      const client = forwardApp.clients[clientId] as ForwardClient;
      if (client.forward) {
        client.forward.send(JSON.stringify({ 
          type: "offer.end", 
          host: state.allowedHost 
        }));
      }
    }
    
    const logElement = document.getElementById(`log-${state.allowedHost}`);
    if (logElement) logElement.remove();
    
    // Update both the app and the store
    setAllowedHost(null);
  }
  
  const startForwardButton = document.getElementById('start-forward');
  if (startForwardButton) {
    setButton(startForwardButton, state.allowedHost);
  }
};

// Helper function to send negotiation messages
function sendNego(client: WebRTCClient, data: any): void {
  try {
    client.nego_dc?.send(JSON.stringify(data));
  } catch (e) {
    console.log("error sending data", data, "to", client, "error", e);
  }
}

// Type definitions
interface ForwardClient extends WebRTCClient {
  forward: RTCDataChannel;
}

interface ForwardApp extends App {
  forward_peer?: string;
  _send_host_interval?: number | null;
  allowed_host?: string | null;
  inflight: Record<string, (data: any) => void>;
  _last_forwarded?: string;
}
