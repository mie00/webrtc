/// <reference lib="webworker" />

// Define interfaces for the service worker
interface ServiceWorkerHandlers {
  [id: string]: (data: any, err?: any) => void;
}

interface ServiceWorkerClientIds {
  [clientId: string]: string;
}

// We're in a service worker context, so we can safely cast self
const sw = self as unknown as ServiceWorkerGlobalScope & {
  handlers: ServiceWorkerHandlers;
  counter: number;
  host?: string;
  clientId?: string;
  client_ids?: ServiceWorkerClientIds;
  recordingHandler?: ((data: ArrayBuffer | null) => void) | null;
};

(self as unknown as ServiceWorkerGlobalScope).addEventListener('install', (event: ExtendableEvent) => {
    console.log('Service Worker installing.');
    // Force the waiting service worker to become the active service worker
    event.waitUntil(sw.skipWaiting());
});

(self as unknown as ServiceWorkerGlobalScope).addEventListener('activate', (event: ExtendableEvent) => {
    console.log('Service Worker activating.');
    // Claim any clients immediately, so that the service worker takes control
    sw.handlers = {};
    sw.counter = 0;
    event.waitUntil(sw.clients.claim());
});

// Convert event.request.body to ArrayBuffer
async function bodyToArrayBuffer(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> {
    if (!body) {
        return null;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    // Concatenate all the Uint8Array chunks into one Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const uint8Array = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
        uint8Array.set(chunk, offset);
        offset += chunk.length;
    }

    return uint8Array;
}

// This function assumes 'data' is an object like { '0': byte0, '1': byte1, ... }
// representing the bytes of the buffer. This might need adjustment
// depending on how the data is actually structured when sent from the client.
function objectToArrayBuffer(data: Record<string, number>): ArrayBufferLike {
    // If data is already an ArrayBuffer or TypedArray, return it directly
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    // Otherwise, assume object structure and convert
    const values = Object.values(data);
    const uint8Array = new Uint8Array(values);
    return uint8Array.buffer;
}

(self as unknown as ServiceWorkerGlobalScope).addEventListener('fetch', (event: FetchEvent) => {
    // console.log("got a new fetch", "ref", event.request.referrer, "url", event.request.url, event, Object.fromEntries(event.request.headers));
    
    const url = event.request.referrer ? new URL(event.request.referrer) : undefined;
    let host = url?.searchParams.get('host');
    let homepage = false;
    
    if (!host) {
        const url = new URL(event.request.url);
        host = url.searchParams.get('host');
        if (!host) {
            if (sw.client_ids && sw.client_ids[event.clientId]) {
                host = sw.client_ids[event.clientId];
            } else {
                if (event.request.destination === "iframe") {
                    host = sw.host;
                } else {
                    // console.log(sw.client_ids);
                    // console.log("normal handling", event.request.url);
                    return;
                }
            }
        } else {
            homepage = true;
        }
    }
    
    if (event.resultingClientId && host) { // Ensure host is defined
        sw.client_ids ||= {};
        sw.client_ids[event.resultingClientId] = host;
    }
    console.log("handling fetch for host", event.request.referrer, event.request.url, host);
    
    if (isNaN(sw.counter)) {
        sw.counter = 0;
    }
    
    const id = sw.counter++;
    sw.handlers ||= {};

    if (!host) {
      console.error("Host is undefined, cannot proceed with fetch handling for:", event.request.url);
      // Optionally, respond with an error or fetch normally
      // return fetch(event.request); 
      return; 
    }
    
    let rurl = new URL(event.request.url);
    const hurl = new URL(host); // host is now guaranteed to be a string

    if (homepage) {
        rurl = hurl;
    } else {
        rurl.host = hurl.host;
        rurl.protocol = hurl.protocol;
    }
    
    console.log("handling2 fetch for host", homepage, host, hurl, rurl, event.request.referrer, event.request.url, id);

    const postRequest = async function (): Promise<void> {
        if (!sw.clientId) {
            console.error("Service worker has no client ID to post message to for:", rurl.toString());
            throw new Error("No client ID available"); // Throw error to reject the promise
        }

        const client = await sw.clients.get(sw.clientId);
        if (!client) {
            console.error("Could not find client with ID:", sw.clientId);
            throw new Error("Client not found"); // Throw error to reject the promise
        }

        console.log("sending message to window", client.url);
        const body = await bodyToArrayBuffer(event.request.body);
        
        client.postMessage({
            id: id,
            url: rurl.toString(),
            method: event.request.method,
            headers: Object.fromEntries(event.request.headers),
            body: body,
        });
    };

    const resp = postRequest().then(() => new Promise<Response>((resolve, reject) => {
        sw.handlers[id] = (data, err) => {
            console.log("called callback for fetch", data, err);
            if (err) {
                console.error("Fetch handler received error:", err);
                // Respond with a generic error, or reject the promise
                // reject(new Error("Failed to fetch")); // Option 1: Reject promise
                resolve(new Response("Service Worker fetch failed", { status: 500 })); // Option 2: Respond with error
                delete sw.handlers[id];
                return;
            }
            try {
                const arrayBuffer = objectToArrayBuffer(data.body);
                // Ensure headers are in the correct format for the Response constructor
                const responseHeaders = new Headers();
                if (data.headers) {
                    for (const [key, value] of Object.entries(data.headers)) {
                        if (typeof value === 'string') {
                            responseHeaders.append(key, value);
                        }
                    }
                }
                // Cast ArrayBufferLike to ArrayBuffer for Response constructor
                resolve(new Response(arrayBuffer as ArrayBuffer, {
                    status: data.status || 200,
                    statusText: data.statusText || 'OK',
                    headers: responseHeaders
                }));
            } catch (conversionError) {
                 console.error("Error converting/creating response in SW:", conversionError, data);
                 resolve(new Response("Service Worker response processing error", { status: 500 }));
            } finally {
                 delete sw.handlers[id];
            }
        };
    })).catch(fetchError => {
        // Catch errors from postRequest (e.g., no client ID)
        console.error("Error setting up fetch handler promise:", fetchError);
        return new Response("Service Worker internal error", { status: 500 });
    });

    event.respondWith(resp);
});

(self as unknown as ServiceWorkerGlobalScope).addEventListener('message', function(event: ExtendableMessageEvent) {
    console.log('got message from window', event);
    if (!event.data || !event.data.type) return;
    
    switch (event.data.type) {
        case 'host':
            sw.host = event.data.host;
            sw.clientId = event.source && 'id' in event.source ? (event.source as Client).id : undefined;
            break;
        case 'response':
            if (sw.handlers[event.data.id]) {
                sw.handlers[event.data.id](event.data);
            }
            break;
        case 'error':
            if (sw.handlers[event.data.id]) {
                sw.handlers[event.data.id](null, event.data);
            }
            break;
        case 'recording':
            if (sw.recordingHandler) {
                sw.recordingHandler(event.data);
            }
            break;
        case 'recording.end':
            if (sw.recordingHandler) {
                sw.recordingHandler(null);
            }
            break;
        default:
            console.log(event.data);
            console.log('Unknown command "' + event.data.type + '".');
    }
});
