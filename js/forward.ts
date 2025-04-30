/// <reference path="../types/global.d.ts" />

interface ForwardClient extends WebRTCClient {
  forward: RTCDataChannel;
}

interface ForwardApp extends App {
  forward_peer?: string;
  _send_host_interval?: number | null;
  allowed_host?: string | null;
  inflight: Record<string, (data: any) => void>;
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

async function sendData(reader: ReadableStreamDefaultReader<Uint8Array>, id: string, cid: string): Promise<void> {
  console.log("reader", reader);
  const max_size = 2 * 1024;
  let offset = 0;
  let gvalue: Uint8Array | null = null;
  let gdone = false;
  let sentOnBuffer = 0;

  const clearBufferAndCb = async function(): Promise<void> {
    sentOnBuffer = 0;
    await cb();
  };

  // TODO: convert to proper promise
  const cb = async function(): Promise<void> {
    const client = window.app.clients[cid] as ForwardClient;
    client.forward.removeEventListener("bufferedamountlow", clearBufferAndCb);
    
    if (!gvalue) {
      const { done, value } = await reader.read();
      offset = 0;
      gdone = done;
      gvalue = value;
    }
    console.log("gvalue", gvalue, "offset", offset, "done", gdone);

    while (gvalue && offset < gvalue.byteLength) {
      console.log("sending data", "length", gvalue.byteLength, "offset", offset, "sentOnBuffer", sentOnBuffer);
      client.forward.send(JSON.stringify({
        type: "data",
        id: id,
        chunk: Array.from(gvalue.slice(offset, offset + 10 * 1024)),
      }));
      sentOnBuffer += Math.min(gvalue.byteLength, offset + 10 * 1024) - offset;
      offset = Math.min(gvalue.byteLength, offset + 10 * 1024);
      if (sentOnBuffer > max_size) {
        client.forward.addEventListener("bufferedamountlow", clearBufferAndCb);
        return;
      }
    }
    gvalue = null;
    if (gdone) {
      client.forward.send(JSON.stringify({
        type: "end",
        id: id,
      }));
    } else {
      cb();
    }
  };
  cb();
}

function forwardInit(app: ForwardApp): void {
  app.cleanups['forward'] = (cid?: string) => {
    if (cid) {
      return;
    }
    if (app._send_host_interval) {
      clearInterval(app._send_host_interval);
      app._send_host_interval = null;
    }
  };
  app.allowed_host = null;
  app.inflight = {};
}

function setupForwardChannel(app: ForwardApp, cid: string): void {
  const forward = app.clients[cid].pc.createDataChannel("forward", {
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
    let cb: ((data: any) => void) | undefined;
    
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
        app.forward_peer = cid;

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
        app._send_host_interval = window.setInterval(sendHost, 10000) as unknown as number;

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
        cb = app.inflight[data.id];
        if (cb) cb(data);
        break;
        
      case "end":
      case "error":
        cb = app.inflight[data.id];
        delete app.inflight[data.id];
        if (cb) cb(data);
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
        console.log("unknown2 message type", data);
    }
  };
}

const toggleForwardHandler = async (): Promise<void> => {
  const forwardApp = window.app as ForwardApp;
  
  if (!forwardApp.allowed_host) {
    let val = prompt("Please enter the url to forward",
      forwardApp._last_forwarded || "http://127.0.0.1:5000");
    
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

    forwardApp.allowed_host = val;
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
      logElement.id = `log-${forwardApp.allowed_host}`;
      logElement.classList.add('w-full', 'max-h-screen', 'bg-white', 'overflow-x-hidden', 'overflow-y-scroll');
    }
  } else {
    for (const clientId in forwardApp.clients) {
      const client = forwardApp.clients[clientId] as ForwardClient;
      if (client.forward) {
        client.forward.send(JSON.stringify({ 
          type: "offer.end", 
          host: forwardApp.allowed_host 
        }));
      }
    }
    
    const logElement = document.getElementById(`log-${forwardApp.allowed_host}`);
    if (logElement) logElement.remove();
    
    forwardApp.allowed_host = null;
  }
  
  const startForwardButton = document.getElementById('start-forward');
  if (startForwardButton) {
    setButton(startForwardButton, forwardApp.allowed_host);
  }
};

// Helper function to set button state
function setButton(button: HTMLElement, state: string | null): void {
  if (state) {
    button.textContent = 'Stop Forwarding';
    button.classList.add('bg-red-500');
    button.classList.remove('bg-blue-500');
  } else {
    button.textContent = 'Start Forwarding';
    button.classList.add('bg-blue-500');
    button.classList.remove('bg-red-500');
  }
}

// Add event listener to start-forward button if it exists
const startForwardButton = document.getElementById('start-forward');
if (startForwardButton) {
  startForwardButton.addEventListener('click', toggleForwardHandler);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  // Calculate the total length of all arrays
  const totalLength = arrays.reduce((acc, array) => acc + array.length, 0);

  // Create a new Uint8Array with the total length
  const result = new Uint8Array(totalLength);

  // Keep track of the current offset
  let offset = 0;

  // Iterate over each array and copy its contents into the result
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
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

  const forwardApp = window.app as ForwardApp;
  
  const handler = function(event: MessageEvent): void {
    console.log('got event from service worker, sending message to peer', event);
    const id = event.data.id;
    
    if (!forwardApp.forward_peer || !forwardApp.clients[forwardApp.forward_peer]) {
      console.error('No forward peer available');
      return;
    }
    
    let r: ForwardResponse = { data: [] };
    
    forwardApp.inflight[id] = (data: any) => {
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
    };
    
    const client = forwardApp.clients[forwardApp.forward_peer] as ForwardClient;
    client.forward.send(JSON.stringify({
      type: "request",
      ...event.data
    }));
  };
  
  navigator.serviceWorker.addEventListener('message', handler);
}

/*
1. init forward channel
2. init service worker
3. send offer to the peer
4. peer opens an iframe with ?host=
5. service worker intercepts request and reads host
6. service worker sends request to client (should be the same one with the iframe)
7. client makes a request to peer using forward channel
8. peer receives request, uses fetch to get response
9. peer forwards response back to peer
10. client gets response from peer and sends it to service worker
11. service worker sends response to page
*/

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    forwardInit,
    setupForwardChannel,
    sendData,
    concatUint8Arrays,
    toggleForwardHandler
  };
}
