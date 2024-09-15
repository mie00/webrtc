document.getElementById('toggle-controls').addEventListener('click', function () {
    const controlsPanel = document.querySelector('#control');
    const tc = document.getElementById('toggle-controls')
    if (controlsPanel.classList.contains('left-full')) {
        controlsPanel.classList.add('right-0');
        controlsPanel.classList.remove('left-full');
        tc.innerHTML = '&gt;';
    } else {
        controlsPanel.classList.remove('right-0');
        controlsPanel.classList.add('left-full');
        tc.innerHTML = '&lt;';
    }
});

const vvals = ['static', 'relative', 'absolute', 'fixed', 'sticky'];
let indda = 0;

// window.asdasd = setInterval(function() {
//     const cc = document.getElementById('cc')
//     const tc = document.getElementById('toggle-controls')
//     const c = document.getElementById('control');
//     tc.style.right = '-25px';
//     if (indda % 2 == 0) {
//         c.classList.remove('left-full');
//         c.classList.add('right-0');
//     } else {
//         c.classList.add('left-full');
//         c.classList.remove('right-0');
//     }
//     const indd = Math.floor(indda/2);
//     tc.style.position = vvals[Math.floor(indd / vvals.length) % vvals.length];
//     cc.style.position = vvals[indd % vvals.length];
//     indda++;
// }, 1000);

const configOverlay = document.getElementById('config-overlay');
const copyOverlay = document.getElementById('copy-overlay');

const reset = () => {
    window.location.href = window.location.origin + window.location.pathname;
}
document.getElementById('reset').addEventListener('click', reset)
document.getElementById('open-config').addEventListener('click', () => {
    configOverlay.classList.remove('hidden');
})
document.getElementById('open-qr').addEventListener('click', () => {
    copyOverlay.classList.remove('hidden');
})
copyOverlay.addEventListener('click', (ev) => {
    if (ev.target === copyOverlay) {
        ev.target.classList.add('hidden');
    }
})
configOverlay.addEventListener('click', (ev) => {
    if (ev.target === configOverlay) {
        ev.target.classList.add('hidden');
    }
})

const app = {
    config: getConfig(),
};

const isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1;

const destroyClient = (cid) => {
    Object.keys(app.clients).filter((key) => key !== cid).forEach((key) => {
        sendNego(app.clients[key], {type: 'participant.end', cid: cid});
    });
    if (app.clients[cid].nego_dc) {
        app.clients[cid].nego_dc.onclose = null;
        app.clients[cid].nego_dc.onmessage = null;
        app.clients[cid].nego_dc.onclose = null;
    }
    clearInterval(app.clients[cid]._transceiver_interval);
    if (app.clients[cid].pc) {
        for (var cleanup of Object.values(app.cleanups)) {
            cleanup(cid);
        }
        app.clients[cid].pc.close();
        app.clients[cid].pc = null;
        Object.keys(app.clients[cid]).forEach(key => delete app.clients[cid][key]);
    }
    delete app.clients[cid]
}

const destroy = () => {
    for (var cid of Object.keys(app.clients)) {
        for (var cleanup of Object.values(app.cleanups)) {
            cleanup(cid);
        }
    }
    for (var cleanup of Object.values(app.cleanups)) {
        cleanup();
    }
    app.cleanups = {};
    for (var cid of Object.keys(app.clients)) {
        sendNego(app.clients[cid], {
            type: "hangup",
        });
        destroyClient(cid);
    }
    document.getElementById('media').innerHTML = '';
    document.getElementById('output').innerHTML = '';
    reset();
}

document.getElementById('hangup').addEventListener('click', destroy)

function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

async function init() {
    if (app.inited) {
        return;
    }
    app.participants = {};
    app.cleanups = {}
    app.clients = {}
    app.inited = true;
    app.nego_messages = {}
    app.nego_handlers = {
        "answer": (data, cid) => {
            app.clients[cid].pc.setRemoteDescription(data);
        },
        "offer": async (data, cid) => {
            const client = app.clients[cid];
            // if (isSafari && !client.polite) return;
            if (!client.polite) {
                if (client.makingOffer) return;
                if (client.pc.signalingState != "stable") return;
            }
            await client.pc.setRemoteDescription(data);
            await client.pc.setLocalDescription();
            sendNego(client, client.pc.localDescription);
        },
        "hangup": (data, cid) => {
            if (!app.clients[cid].polite) {
                destroyClient(cid);
            } else {
                destroy();
            }
        },
        "participant": (data, cid) => {
            app.participants[data.cid] = { relay: cid };
            handleChange(cid);
        },
        "participant.end": (data, cid) => {
            delete app.participants[data.cid];
            handleChange(cid);
        },
    };

    streamInit(app);
    forwardInit(app);
}

function sendNego(client, data) {
    if (!data.id) {
        data = JSON.parse(JSON.stringify(data))
        data.id = uuidv4()
        app.nego_messages[data.id] = {}
    }
    try {
        client.nego_dc.send(JSON.stringify(data));
    } catch (e) {
        console.log("error sending data", data, "to", client, "erro", e);
    }
}

function logDiff(d1, d2) {
    let span = null;

    const diff = Diff.diffChars(d1, d2),
        fragment = document.createDocumentFragment();

    diff.forEach((part) => {
    // green for additions, red for deletions
    // grey for common parts
    const color = part.added ? 'green' :
        part.removed ? 'red' : 'grey';
        span = document.createElement('span');
        span.style.color = color;
        span.appendChild(document
            .createTextNode(part.value));
        fragment.appendChild(span);
    });
    document.getElementById('diffs').appendChild(fragment);
}

async function initClient(polite, {sid, offer}) {
    init();
    const config = {
        iceServers: app.config["stun-servers"].split(',').filter(link => link).map(link => ({ urls: "stun:" + link })).concat(
            app.config["turn-server-v2"] && app.config["turn-username"] && app.config["turn-password"] ? [{
                urls: "turn:" + app.config["turn-server-v2"],
                username: app.config["turn-username"],
                credential: app.config["turn-password"],
            }] : []
        ),
    };

    const cid = uuidv4();
    app.sids ||= {}
    if (sid in app.sids && app.sids[sid] in app.clients) {
        app.clients[app.sids[sid]].pc.restartIce();
        return;
    }
    app.sids[sid] = cid;
    app.clients[cid] = {};

    const pc = new RTCPeerConnection(config);
    app.clients[cid].pc = pc;

    app.clients[cid].pc.onconnectionstatechange = () => handleChange(cid);
    app.clients[cid].pc.oniceconnectionstatechange = () => handleChange(cid);


    app.clients[cid].pc.oniceconnectionstatechange = () => {
        if (app.clients[cid].pc.iceConnectionState === "failed") {
            app.clients[cid].pc.restartIce();
        }
    };

    app.clients[cid].polite = polite;

    const nego_dc = pc.createDataChannel("nego", {
        negotiated: true,
        id: 0
    });
    app.clients[cid].nego_dc = nego_dc;
    nego_dc.onclose = async e => {
        console.log(e)
        destroyClient(cid);
    }

    nego_dc.onerror = function (error) {
        console.error('Data channel error:', error);
        app.clients[cid].pc.restartIce();
        // if (app.clients[cid].polite) {
        //     windowLoader();
        // }
    };

    nego_dc.onmessage = async e => {
        const data = JSON.parse(e.data);
        if (data.id in app.nego_messages) {
            return;
        }
        app.nego_messages[data.id] = {};
        console.log("got negotiation message", data);
        const handler = app.nego_handlers[data.type];
        if (!handler) {
            console.log("cannot find handler for", data.type)
            return;
        };
        handler(data, cid);
    };

    nego_dc.onopen = () => {
        Object.keys(app.clients).forEach(ncid => {
            if (ncid !== cid) {
                sendNego(app.clients[ncid], {type: "participant", cid: cid});
            }
        });
        Object.keys(app.clients).forEach(ncid => {
            if (ncid !== cid) {
                sendNego(app.clients[ncid], { type: "participant", cid: ncid });
            }
        });
    };

    setupTrackHandler(app, cid);
    setupChatChannel(app, cid);
    setupFileChannel(app, cid);
    setupForwardChannel(app, cid);

    app.clients[cid]._transceiver_interval = setInterval(() => {
        // app.clients[cid].pc.addTransceiver('audio', {direction: "recvonly"});
        // app.clients[cid].pc.addTransceiver('video', {direction: "recvonly"});
    }, 10000);

    if (offer) {
        await app.clients[cid].pc.setRemoteDescription({
            type: "offer",
            sdp: offer.trim() + '\n'
        });
        let answer = await app.clients[cid].pc.createAnswer();
        await app.clients[cid].pc.setLocalDescription(answer);
    } else {
        const offer = await app.clients[cid].pc.createOffer();
        await app.clients[cid].pc.setLocalDescription(offer);
    }
    app.clients[cid].pc.onnegotiationneeded = async function () {
        app.clients[cid].makingOffer = true;
        try {
            await app.clients[cid].pc.setLocalDescription();
            logDiff(app.clients[cid].pc.currentLocalDescription.sdp, app.clients[cid].pc.localDescription.sdp)
            sendNego(app.clients[cid], app.clients[cid].pc.localDescription);
        } catch (e) {
            console.log("renegotiation error", e)
        } finally {
            app.clients[cid].makingOffer = false;
        }
    };

    if (!offer) {
        setTimeout(() => {
            if (app.clients[cid].pc.signalingState === 'have-local-offer') {
                destroyClient(cid);
            }
        }, 60 * 1000);
    }
    return cid;
}

const log = msg => output.innerHTML += `<br>${msg}`;

async function getOffer(cb, {sid}) {
    const cid = await initClient(false, {sid});
    app.clients[cid].pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (offer)', candidate)
        await cb(candidate);
    };
    return cid;
}

async function getAnswer(offer, cb, {sid}) {
    const cid = await initClient(true, {sid, offer});
    app.clients[cid].pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (answer)', candidate)
        await cb(candidate);
    };
    return cid;
}

async function sha256(message) {
    // encode as UTF-8
    const msgBuffer = new TextEncoder().encode(message);

    // hash the message
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

    // convert ArrayBuffer to Array
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // convert bytes to hex string                  
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

async function genEmojis(digest) {
    if (!crypto.subtle) {
        return "❗❗❗❗❗❗❗❗";
    }
    const msgBuffer = new TextEncoder().encode(digest);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const limit = Math.pow(EMOJIS.length, 4) + Math.pow(EMOJIS.length, 3) + Math.pow(EMOJIS.length, 2) + EMOJIS.length;
    let val = 0;
    let ind = 0;
    while (val < limit && ind < hashArray.length) {
        val += Math.pow(hashArray[ind], ind + 1);
        ind += 1
    }
    return (EMOJIS[val % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length) % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length) % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length / EMOJIS.length) % EMOJIS.length])
}

async function handleChange(cid) {
    const participants = document.getElementById('participants');
    const parent = document.createElement('div')

    for (const [cid, client] of Object.entries(app.clients)) {
        const indicator = document.createElement('div');
        const toAdd = client.pc?.connectionState === 'connected' && client.pc?.iceConnectionState === 'connected' ? 'bg-green-400' :
            client.pc?.connectionState === 'failed' || client.pc?.iceConnectionState === 'failed' ? 'bg-red-400' : 'bg-gray=400';
        indicator.classList.add(toAdd, 'rounded-full', 'h-4', 'w-4');


        const textContainer = document.createElement('p');
        textContainer.classList.add('text-sm', 'font-medium', 'text-gray-700');
        textContainer.appendChild(document.createTextNode(cid));
        textContainer.title = `Connection State: ${client.pc?.connectionState} Ice Connection State: ${client.pc?.iceConnectionState}`;

        const container = document.createElement('div');
        container.classList.add('flex', 'items-center', 'space-x-2');

        container.appendChild(indicator);
        container.appendChild(textContainer);
        parent.appendChild(container);

        console.log('%c' + new Date().toISOString() + ': ConnectionState: %c' + client.pc?.connectionState + ' %cIceConnectionState: %c' + client.pc?.iceConnectionState,
            'color:yellow', 'color:orange', 'color:yellow', 'color:orange');
        if (client.pc?.connectionState === 'connected' && client.pc?.iceConnectionState === 'connected') {
            const stats = await client.pc.getStats();
            let transport;
            let certificates = {};
            stats.forEach(stat => {
                if (stat.type === 'transport') {
                    transport = stat;
                } else if (stat.type === 'certificate') {
                    certificates[stat.id] = stat;
                }
            });
            if (transport) {
                const firstCid = client.polite ? transport.remoteCertificateId : transport.localCertificateId;
                const secondCid = !client.polite ? transport.remoteCertificateId : transport.localCertificateId;
                const fingerprints = certificates[firstCid].fingerprint + certificates[secondCid].fingerprint;
                const ejs = await genEmojis(fingerprints);
                console.log('ejs', ejs)
                textContainer.appendChild(document.createTextNode(ejs));
            }
            document.getElementById("copy-overlay").classList.add('hidden');
            if (!new URLSearchParams(window.location.search).has('r')) {
                history.replaceState('', '', window.location.origin + window.location.pathname);
            }
        }
    }
    for (const [key, value] of Object.entries(app.participants || {})) {
        const indicator = document.createElement('div');
        indicator.classList.add('rounded-full', 'h-4', 'w-4');


        const textContainer = document.createElement('p');
        textContainer.classList.add('text-sm', 'font-medium', 'text-gray-700');
        textContainer.appendChild(document.createTextNode(key));

        const container = document.createElement('div');
        container.classList.add('flex', 'items-center', 'space-x-2');

        container.appendChild(indicator);
        container.appendChild(textContainer);
        parent.appendChild(container);
        if (value.relay in app.clients) {
            const client = app.clients[value.relay];
            const toAdd = client.pc?.connectionState === 'connected' && client.pc?.iceConnectionState === 'connected' ? 'bg-green-400' :
                client.pc?.connectionState === 'failed' || client.pc?.iceConnectionState === 'failed' ? 'bg-red-400' : 'bg-gray=400';
            indicator.classList.add(toAdd);
            textContainer.title = `Relay: ${value.relay} Connection State: ${client.pc?.connectionState} Ice Connection State: ${client.pc?.iceConnectionState}`;
        } else {
            indicator.classList.add('bg-red-400');
            textContainer.title = `Relay: ${value.relay} Connection State: relay not found`;
        }
    }
    participants.firstChild?.remove();
    participants.appendChild(parent);
}
// handleChange();

const copyHandler = async (ev) => {
    if (navigator.clipboard) {
        try {
            const link = document.getElementById('copy-text');
            await navigator.clipboard.writeText(link.value);
            ev.target.innerHTML = "Copied successfully";
        } catch {
            ev.target.innerHTML = "Error copying, please copy manually";
        }
    } else {
        ev.target.innerHTML = "Clipboard unavailable, please copy manually";
    }
}
document.getElementById("copy-button").addEventListener("click", copyHandler);

const acceptHandler = async (cid) => {
    let data = document.getElementById('paste-text').value;
    const answer = await decompress(data.trim());
    app.clients[cid].pc.setRemoteDescription({
        type: "answer",
        sdp: answer.trim() + '\n'
    });
}

let windowLoader;

const clientWindowLoader = async () => {
    console.log("coming here")
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    const qrElem = document.getElementById("qrcode");
    if (!urlParams.get('offer')) {
        const now = Date.now();
        const link = document.getElementById('copy-text');
        copyOverlay.classList.remove('hidden');
        const btn = document.getElementById("copy-button");
        const btn2 = document.getElementById("accept-button");
        const link2 = document.getElementById('paste-text');
        link2.value = '';
        btn2.classList.remove('hidden');
        link2.classList.remove('hidden');
        let cid;
        cid = await getOffer(async (candidate) => {
            if (Date.now() - now > 10 * 1000) { return }
            const sdp = app.clients[cid].pc.localDescription.sdp;
            const compressed = await compress(sdp);
            urlParams.set('offer', compressed);
            qrElem.innerHTML = '';
            const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
            try {
                new QRCode(qrElem, newUrl);
            } catch (e) {
                console.log("qr code generation error", e)
            }
            link.value = newUrl;
            btn.innerHTML = "Copy";
        })
        const bc = new BroadcastChannel("manual_rtc");
        app.bc = bc;
        bc.onmessage = async (event) => {
            let data = event.data;
            const answer = await decompress(data.trim());
            app.clients[cid].pc.setRemoteDescription({
                type: "answer",
                sdp: answer.trim() + '\n'
            });
        };
        document.getElementById("accept-button").addEventListener("click", () => acceptHandler(cid));
    } else if (urlParams.get('answer')) {
        const bc = new BroadcastChannel("manual_rtc");
        await bc.postMessage(urlParams.get('answer'));
        bc.close();
        copyOverlay.classList.remove('hidden');
        copyOverlay.innerHTML = '<p class="bg-white p-4 rounded-md shadow-md text-center">call started on another tab, please close this one</p>';
    } else {
        const now = Date.now();
        const offer = await decompress(urlParams.get('offer'));
        const link = document.getElementById('copy-text');
        copyOverlay.classList.remove('hidden');
        const btn = document.getElementById("copy-button");
        let cid;
        cid = await getAnswer(offer, async (candidate) => {
            if (Date.now() - now > 10 * 1000) { return }
            const sdp = app.clients[cid].pc.localDescription.sdp;
            const compressed = await compress(sdp);
            urlParams.set('answer', compressed);
            qrElem.innerHTML = '';
            try {
                new QRCode(qrElem, (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString());
            } catch (e) {
                console.log("qr code generation error", e)
            }
            link.value = compressed;
            btn.innerHTML = "Copy";
        })
    }
}

var socket = io('wss://dealer.mie00.com');

const onId = () => {
    const link = document.getElementById('copy-text');
    copyOverlay.classList.remove('hidden');
    const urlParams = new URLSearchParams(window.location.search);
    const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
    link.value = newUrl;
    const btn = document.getElementById("copy-button");
    btn.innerHTML = "Copy";
    const qrElem = document.getElementById("qrcode");
    qrElem.innerHTML = '';
    try {
        new QRCode(qrElem, newUrl);
    } catch (e) {
        console.log("qr code generation error", e)
    }
}
socket.on('init', async (id) => {
    console.log("init", id);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('r', id);
    history.replaceState(null, '', '?' + urlParams.toString());
    onId();
});
socket.on('subscribed', async (sid) => {
    console.log('got subscribed', sid);
    // debounce
    const now = Date.now();
    const cid = await getOffer(async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid})
    const sdp = app.clients[cid].pc.localDescription.sdp;
    console.log("sending an offer", sid, sdp);
    socket.emit('offer', sid, sdp);
});

socket.on('answer', async (sid, sdp) => {
    console.log('got an answer', sid, sdp);
    app.clients[app.sids[sid]].pc.setRemoteDescription({
        type: "answer",
        sdp: sdp.trim() + '\n'
    });
});

socket.on('offer', async (sid, sdp) => {
    console.log('got an offer', sid, sdp);
    const now = Date.now();
    const cid = await getAnswer(sdp, async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid})
    const asdp = app.clients[cid].pc.localDescription.sdp;
    console.log("sending an answer", sid, asdp);
    socket.emit('answer', sid, asdp);
});

socket.on('error', async () => {
    history.replaceState(null, '', window.location.origin + window.location.pathname);
    if (app.config['config-loader'] === 'client') {
        windowLoader = clientWindowLoader;
    }
    windowLoader();
});

socket.on('candidate', async (sid, candidate) => {
    console.log('got a candidate from peer', sid, candidate);
    app.clients[app.sids[sid]].pc.addIceCandidate(JSON.parse(candidate));
});

const serverWindowLoader = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    const acceptButton = document.getElementById("accept-button");
    const joinButton = document.getElementById("join-button");
    const copyButton = document.getElementById("copy-button");
    if (!urlParams.has('r')) {
        copyButton.classList.remove("hidden");
        acceptButton.classList.add("hidden");
        joinButton.classList.add("hidden");
        socket.emit('init');
    } else {
        const id = urlParams.get('r');
        onId();
        copyButton.classList.add("hidden");
        acceptButton.classList.add("hidden");
        joinButton.classList.remove("hidden");
        joinButton.onclick = () => {
            socket.emit('subscribe', id);
        };
    }
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('r')) {
    windowLoader = serverWindowLoader;
} else if (urlParams.has('offer')) {
    windowLoader = clientWindowLoader;
} else if (app.config['config-loader'] === 'client') {
    windowLoader = clientWindowLoader;
} else {
    windowLoader = serverWindowLoader;
}

console.log('coming here 2')
window.addEventListener("load", windowLoader);
