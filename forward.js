
async function sendData(reader, id) {
    console.log("reader", reader)
    const max_size = 2 * 1024;
    let offset = 0;
    let gvalue = null;
    let gdone = false;
    let sentOnBuffer = 0;

    const clearBufferAndCb = async function () {
        sentOnBuffer = 0;
        await cb();
    }

    const cb = async function () {
        app.forward.removeEventListener("bufferedamountlow", clearBufferAndCb);
        if (!gvalue) {
            const { done, value } = await reader.read();
            offset = 0;
            gdone = done;
            gvalue = value;
        }
        console.log("gvalue", gvalue, "offset", offset, "done", gdone)

        while (gvalue && offset < gvalue.byteLength) {
            console.log("sending data", "length", gvalue.byteLength, "offset", offset, "sentOnBuffer", sentOnBuffer)
            app.forward.send(JSON.stringify({
                type: "data",
                id: id,
                chunk: gvalue.slice(offset, offset + 10 * 1024),
            }));
            sentOnBuffer += Math.min(gvalue.byteLength, offset + 10 * 1024) - offset;
            offset = Math.min(gvalue.byteLength, offset + 10 * 1024);
            if (sentOnBuffer > max_size) {
                app.forward.addEventListener("bufferedamountlow", clearBufferAndCb);
                return;
            }
        }
        gvalue = null;
        if (gdone) {
            app.forward.send(JSON.stringify({
                type: "end",
                id: id,
            }));
        } else {
            cb();
        }
    };
    cb();
}


function setupForwardChannel(app) {
    app.allowed_host = null;
    app.inflight = {};
    app.queue = [];
    const forward = app.pc.createDataChannel("forward", {
        negotiated: true,
        id: 3
    });
    app.forward = forward;
    forward.onopen = () => {
        chat.select();
    };
    forward.onmessage = e => {
        const data = JSON.parse(e.data);
        console.log("got message in forward channel from peer", data);
        let cb;
        switch (data.type) {
            case "offer":
                let iframeElement = document.createElement('iframe');
                document.getElementById('media').appendChild(iframeElement);
                iframeElement.src = `/iframe-content.html?host=${data.host}`;
                iframeElement.id = `iframe-${data.host}`
                iframeElement.classList.add('w-full');
                iframeElement.classList.add('h-screen');
                iframeElement.allowTransparency="false";
                iframeElement.style.backgroundColor = "white";


                // add hosts_host to url params of current page, not iframe
                const url = new URL(window.location.href);
                url.searchParams.set('hosts_host', data.host);
                window.history.pushState(null, '', url.toString());
                navigator.serviceWorker.controller.postMessage({
                    type: 'host',
                    host: data.host,
                });
                break;
            case "request":
                if (!data.url.startsWith(app.allowed_host)) {
                    console.log("not allowed", app.allowed_host, data.url)
                    return;
                }
                fetch(data.url, data).then(async response => {
                    app.forward.send(JSON.stringify({
                        type: "response",
                        id: data.id,
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers),
                    }));
                    (async function () {
                        if (response.body === null) {
                            app.forward.send(JSON.stringify({
                                type: "end",
                                id: data.id,
                            }));
                            return null;
                        }
                        const reader = response.body.getReader();
                        await sendData(reader, data.id);
                    }());
                }).catch(err => {
                    app.forward.send(JSON.stringify({
                        type: "error",
                        err: JSON.stringify(err, Object.getOwnPropertyNames(err)),
                    }));
                });
                break;
            case "response":
            case "data":
                cb = app.inflight[data.id];
                cb(data);
                break;
            case "end":
            case "error":
                cb = app.inflight[data.id];
                delete app.inflight[data.id];
                cb(data);
                break;
            default:
                console.log("unknown2 message type", data)
        }
    };
}

function sendOffer(app, hostname) {
    app.allowed_host = hostname;
    app.forward.send(JSON.stringify({ type: "offer", host: hostname }));
}

document.getElementById('start-forward').addEventListener('click', () => {
    const val = document.getElementById('forward-host').value;
    if (!val) {
        alert("empty value");
        return;
    }
    sendOffer(app, val);
})

function concatUint8Arrays(arrays) {
    // Calculate the total length of all arrays
    const totalLength = arrays.reduce((acc, array) => acc + (array.length || Object.keys(array).length), 0);

    // Create a new Uint8Array with the total length
    const result = new Uint8Array(totalLength);

    // Keep track of the current offset
    let offset = 0;

    // Iterate over each array and copy its contents into the result
    for (const array of arrays) {
        let length = (array.length || Object.keys(array).length);
        for (let i = 0; i < length; i++) {
            result[offset+i] = array[i];
        }
        offset += length;
    }

    return result;
}


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

    var msg = new MessageChannel();
    navigator.serviceWorker.addEventListener('message', function (event) {
        console.log('got event from service worker, sending message to peer', event)
        const id = event.data.id;
        let r = { data: [] };
        app.inflight[id] = (data) => {
            console.log('called inflight', id, data);
            if (data.type === 'error') {
                navigator.serviceWorker.controller.postMessage(data);
            } else if (data.type === 'response') {
                r.response = data;
            } else if (data.type === 'data') {
                r.data.push(data.chunk);
            } else if (data.type === 'end') {
                r.response.body = concatUint8Arrays(r.data);
                console.log(r.data, r.response.body);
                navigator.serviceWorker.controller.postMessage(r.response);
            }
        }
        app.forward.send(JSON.stringify({
            type: "request",
            ...event.data
        }))
    });
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