// service-worker.js

self.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
    // Force the waiting service worker to become the active service worker
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
    // Claim any clients immediately, so that the service worker takes control
    self.handlers = {};
    self.counter = 0;
    event.waitUntil(self.clients.claim());
});

// Convert event.request.body to ArrayBuffer
async function bodyToArrayByffer(body) {
    if (!body) {
        return null;
    }
    const reader = body.getReader();
    const chunks = [];
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

function objectToArrayBuffer(data) {
    const keys = Object.keys(data);
    const length = keys.length;

    const buffer = new ArrayBuffer(length);
    const uint8Array = new Uint8Array(buffer);

    for (let i = 0; i < length; i++) {
        uint8Array[i] = data[i];
    }

    return buffer;
}

self.addEventListener('fetch', (event) => {
    console.log("got a new fetch", "ref", event.request.referrer, "url", event.request.url, event, Object.fromEntries(event.request.headers))
    const url = event.request.referrer?new URL(event.request.referrer):undefined;
    let host = url?.searchParams.get('host');
    let homepage = false;
    if (!host) {
        const url = new URL(event.request.url)
        host = url.searchParams.get('host');
        if (!host) {
            if (self.client_ids && self.client_ids[event.clientId]) {
                host = self.client_ids[event.clientId];
            } else {
                if (event.request.destination === "iframe") {
                    host = self.host;
                } else {
                    console.log(self.client_ids);
                    console.log("normal handling", event.request.url);
                    return;
                }
            }
        } else {
            homepage = true;
        }
    }
    if (event.resultingClientId) {
        self.client_ids ||= {};
        self.client_ids[event.resultingClientId] = host;
    }
    console.log("handling fetch for host", event.request.referrer, event.request.url, host)
    if (isNaN(self.counter)) {
        self.counter = 0;
    }
    const id = self.counter++;
    self.handlers ||= {};;
    let rurl = new URL(event.request.url);
    const hurl = new URL(host);
    if (homepage) {
        rurl = hurl;
    } else {
        rurl.host = hurl.host;
        rurl.protocol = hurl.protocol;
    }
    console.log("handling2 fetch for host", homepage, host, hurl, rurl, event.request.referrer, event.request.url, id);

    const postRequest = async function () {
        console.log(self.clientId)
        const client = await self.clients.get(self.clientId);
        console.log("sending message to window", client.url);
        const body = await bodyToArrayByffer(event.request.body);
        client.postMessage({
            id: id,
            url: rurl.toString(),
            method: event.request.method,
            headers: Object.fromEntries(event.request.headers),
            body: body,
        });
    };

    const resp = postRequest().then(() => new Promise((resolve, reject) => {
        self.handlers[id] = (data, err) => {
            console.log("called callback for fetch", data, err)
            if (err) {
                reject(err);
                return;
            }
            const arrayBuffer = objectToArrayBuffer(data.body);
            resolve(new Response(arrayBuffer, data));
            delete self.handlers[id];
        }
    }));

    event.respondWith(resp);
});

self.addEventListener('message', function (event) {
    console.log('got message from window', event)
    switch (event.data.type) {
        case 'host':
            self.host = event.data.host;
            self.clientId = event.source.id;
        case 'response':
            if (self.handlers[event.data.id]) {
                self.handlers[event.data.id](event.data);
            }
            break;
        case 'error':
            if (self.handlers[event.data.id]) {
                self.handlers[event.data.id](null, event.data);
            }
            break;
        default:
            console.log(event.data)
            console.log('Unknown command "' + event.data.type + '".');
    }
});
