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

function objectToArrayBuffer(data: Record<string, any>): ArrayBuffer {
    const keys = Object.keys(data);
    const length = keys.length;

    const buffer = new ArrayBuffer(length);
    const uint8Array = new Uint8Array(buffer);

    for (let i = 0; i < length; i++) {
        uint8Array[i] = data[i];
    }

    return buffer;
}

(self as unknown as ServiceWorkerGlobalScope).addEventListener('fetch', (event: FetchEvent) => {
    console.log("got a new fetch", "ref", event.request.referrer, "url", event.request.url, event, Object.fromEntries(event.request.headers));
    
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
                    console.log(sw.client_ids);
                    console.log("normal handling", event.request.url);
                    return;
                }
            }
        } else {
            homepage = true;
        }
    }
    
    if (event.resultingClientId) {
        sw.client_ids ||= {};
        sw.client_ids[event.resultingClientId] = host;
    }
    
    console.log("handling fetch for host", event.request.referrer, event.request.url, host);
    
    if (isNaN(sw.counter)) {
        sw.counter = 0;
    }
    
    const id = sw.counter++;
    sw.handlers ||= {};
    
    let rurl = new URL(event.request.url);
    const hurl = new URL(host);
    
    if (homepage) {
        rurl = hurl;
    } else {
        rurl.host = hurl.host;
        rurl.protocol = hurl.protocol;
    }
    
    console.log("handling2 fetch for host", homepage, host, hurl, rurl, event.request.referrer, event.request.url, id);

    const postRequest = async function (): Promise<void> {
        console.log(sw.clientId);
        if (!sw.clientId) return;
        
        const client = await sw.clients.get(sw.clientId);
        if (!client) return;
        
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
                reject(err);
                return;
            }
            const arrayBuffer = objectToArrayBuffer(data.body);
            resolve(new Response(arrayBuffer, data));
            delete sw.handlers[id];
        };
    }));

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
