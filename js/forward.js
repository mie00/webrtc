
async function sendData(reader, id, cid) {
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

    // TODO: convert to proper promise
    const cb = async function () {
        app.clients[cid].forward.removeEventListener("bufferedamountlow", clearBufferAndCb);
        if (!gvalue) {
            const { done, value } = await reader.read();
            offset = 0;
            gdone = done;
            gvalue = value;
        }
        console.log("gvalue", gvalue, "offset", offset, "done", gdone)

        while (gvalue && offset < gvalue.byteLength) {
            console.log("sending data", "length", gvalue.byteLength, "offset", offset, "sentOnBuffer", sentOnBuffer)
            app.clients[cid].forward.send(JSON.stringify({
                type: "data",
                id: id,
                chunk: gvalue.slice(offset, offset + 10 * 1024),
            }));
            sentOnBuffer += Math.min(gvalue.byteLength, offset + 10 * 1024) - offset;
            offset = Math.min(gvalue.byteLength, offset + 10 * 1024);
            if (sentOnBuffer > max_size) {
                app.clients[cid].forward.addEventListener("bufferedamountlow", clearBufferAndCb);
                return;
            }
        }
        gvalue = null;
        if (gdone) {
            app.clients[cid].forward.send(JSON.stringify({
                type: "end",
                id: id,
            }));
        } else {
            cb();
        }
    };
    cb();
}

function forwardInit(app) {
    app.cleanups['forward'] = (cid) => {
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

function setupForwardChannel(app, cid) {
    const forward = app.clients[cid].pc.createDataChannel("forward", {
        negotiated: true,
        id: 3
    });
    app.clients[cid].forward = forward;
    forward.onopen = () => {
        chat.select();
    };
    forward.onmessage = async e => {
        const data = JSON.parse(e.data);
        console.log("got message in forward channel from peer", data);
        let cb;
        switch (data.type) {
            case "offer":
                if (!('serviceWorker' in navigator)) {
                    alert("cannot do service workers, won't be able to do forwarding");
                    app.clients[cid].forward.send(JSON.stringify({
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
                const sendHost = () => navigator.serviceWorker.controller.postMessage({
                    type: 'host',
                    host: data.host,
                });
                sendHost();
                if (app._send_host_interval) {
                    clearInterval(app._send_host_interval);
                    app._send_host_interval = null;
                }
                app._send_host_interval = setInterval(sendHost, 10000);

                let iframeElement = document.createElement('iframe');
                document.getElementById('media').appendChild(iframeElement);
                iframeElement.src = `/iframe-content.html?host=${data.host}`;
                iframeElement.id = `iframe-${data.host}`
                iframeElement.classList.add('w-full', 'h-screen', 'bg-white');
                iframeElement.allowTransparency="false";
                break;
            case "request":
                const logElement = document.getElementById(`log-${app.allowed_host}`);
                let logLine = document.createElement('p');
                logLine.id = `ll-${data.id}`
                logElement.insertBefore(logLine, logElement.firstChild)
                logLine.innerHTML = `${data.url}`
                const status = document.createElement('span')
                status.id = `lls-${data.id}`
                status.classList.add("right")
                status.innerHTML = '🌀'
                logLine.appendChild(status);
                if (!data.url.startsWith(app.allowed_host)) {
                    console.log("not allowed", app.allowed_host, data.url)
                    status.innerHTML = '❌'
                    return;
                }
                fetch(data.url, data).then(async response => {
                    app.clients[cid].forward.send(JSON.stringify({
                        type: "response",
                        id: data.id,
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers),
                    }));
                    return (async function () {
                        if (response.body === null) {
                            app.clients[cid].forward.send(JSON.stringify({
                                type: "end",
                                id: data.id,
                            }));
                            return null;
                        }
                        const reader = response.body.getReader();
                        await sendData(reader, data.id, cid);
                        status.innerHTML = '✅';
                    }());
                }).catch(err => {
                    app.clients[cid].forward.send(JSON.stringify({
                        type: "error",
                        err: JSON.stringify(err, Object.getOwnPropertyNames(err)),
                    }));
                    status.innerHTML = '⭕';
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
            case "offer.end":
                if (app._send_host_interval) {
                    clearInterval(app._send_host_interval);
                    app._send_host_interval = null;
                }
                const iframeElem = document.getElementById(`iframe-${data.host}`);
                iframeElem?.remove();
                break;
            case "offer.error":
                alert("failed to forward to the other side");
                await toggleForwardHandler();
                break;
            default:
                console.log("unknown2 message type", data)
        }
    };
}

const toggleForwardHandler = async () => {
    if (!app.allowed_host) {
        // let val = document.getElementById('forward-host').value;
        let val = prompt("Please enter the url to forward",
            app._last_forwarded || "http://127.0.0.1:5000");
        app._last_forwarded = val;
        if (!val) {
            alert("empty value");
            return;
        }

        try {
            const res = await fetch(val);
            await res.arrayBuffer();
        } catch {
            if (val.startsWith('http://127.0.0.1') || val.startsWith('http://localhost')) {
                val = val.replace(/http:\/\/[^/:]+/, 'http://local.mie00.com')
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

        app.allowed_host = val;
        for (var client of Object.values(app.clients)) {
            client.forward.send(JSON.stringify({ type: "offer", host: val }));
        }

        let logElement = document.createElement('div');
        document.getElementById('media').appendChild(logElement);
        logElement.id = `log-${app.allowed_host}`;
        logElement.classList.add('w-full', 'max-h-screen', 'bg-white', 'overflow-x-hidden', 'overflow-y-scroll');
    } else {
        for (var client of Object.values(app.clients)) {
            client.forward.send(JSON.stringify({ type: "offer.end", host: app.allowed_host }));
        }
        document.getElementById(`log-${app.allowed_host}`).remove()
        app.allowed_host = '';
    }
    setButton(document.getElementById('start-forward'), app.allowed_host);
}

document.getElementById('start-forward').addEventListener('click', toggleForwardHandler)

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
    const handler = function (event) {
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
        app.clients[app.forward_peer].forward.send(JSON.stringify({
            type: "request",
            ...event.data
        }))
    }
    navigator.serviceWorker.addEventListener('message', handler);
    msg.port1.onmessage = handler;
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