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
    if (app.clients[cid].nego_dc) {
        app.clients[cid].nego_dc.onclose = null;
        app.clients[cid].nego_dc.onmessage = null;
        app.clients[cid].nego_dc.onclose = null;
    }
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
    app.cleanups = {}
    app.clients = {}
    app.inited = true;
    app.nego_handlers = {
        "answer": (data, cid) => {
            app.clients[cid].pc.setRemoteDescription(data);
        },
        "offer": async (data, cid) => {
            if (isSafari && !app.clients[cid].polite) return;
            await app.clients[cid].pc.setRemoteDescription(data);
            await app.clients[cid].pc.setLocalDescription();
            sendNego(app.clients[cid], app.clients[cid].pc.localDescription);
        },
        "hangup": (data, cid) => {
            if (!app.clients[cid].polite) {
                destroyClient(cid);
            } else {
                destroy();
            }
        },
    };

    streamInit(app);
    forwardInit(app);
}

function sendNego(client, data) {
    try {
        client.nego_dc.send(JSON.stringify(data));
    } catch (e) {
        console.log("error sending data", data, "to", client, "erro", e);
    }
}

async function initClient() {
    init();
    const config = {
        iceServers: app.config["stun-servers"].split(',').filter(link => link).map(link => ({ urls: "stun:" + link })).concat(
            app.config["turn-server-v2"] && app.config["turn-username"] && app.config["turn-password"]?[{
                url: "turn:" + app.config["turn-server-v2"],
                username: app.config["turn-username"],
                credential: app.config["turn-password"],
            }]:[]
        ),
    };

    const cid = uuidv4();
    app.clients[cid] = {};

    const pc = new RTCPeerConnection(config);
    app.clients[cid].pc = pc;

    app.clients[cid].pc.onconnectionstatechange = () => handleChange(cid);
    app.clients[cid].pc.oniceconnectionstatechange = () => handleChange(cid);

    const nego_dc = pc.createDataChannel("nego", {
        negotiated: true,
        id: 0
    });
    app.clients[cid].nego_dc = nego_dc;
    nego_dc.onclose = async e => {
        console.log(e)
        destroyClient(cid);
    }

    nego_dc.onerror = function(error) {
        console.error('Data channel error:', error);
    };

    nego_dc.onmessage = async e => {
        const data = JSON.parse(e.data);
        console.log("got negotiation message", data);
        const handler = app.nego_handlers[data.type];
        if (!handler) {
            console.log("cannot find handler for", data.type)
            return;
        };
        handler(data, cid);
    };

    setupTrackHandler(app, cid);
    if (true) {
        setupChatChannel(app, cid);
        setupFileChannel(app, cid);
        setupForwardChannel(app, cid);
    }
    return cid;
}

const log = msg => output.innerHTML += `<br>${msg}`;

async function getOffer(cb) {
    const cid = await initClient();
    if (app.clients[cid].polite === undefined) {
        app.clients[cid].polite = false;
    }
    const offer = await app.clients[cid].pc.createOffer();
    await app.clients[cid].pc.setLocalDescription(offer);

    app.clients[cid].pc.onnegotiationneeded = async function () {
        const offer = await app.clients[cid].pc.createOffer()
        await app.clients[cid].pc.setLocalDescription(offer);
        sendNego(app.clients[cid], offer);
    };
    app.clients[cid].pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (offer)', candidate)
        await cb(app.clients[cid].pc.localDescription.sdp);
    };
    return cid;
}

async function getAnswer(offer, cb) {
    const cid = await initClient();
    if (app.clients[cid].polite === undefined) {
        app.clients[cid].polite = true;
    }
    await app.clients[cid].pc.setRemoteDescription({
        type: "offer",
        sdp: offer.trim() + '\n'
    });
    let answer = await app.clients[cid].pc.createAnswer();
    await app.clients[cid].pc.setLocalDescription(answer);
    await cb(app.clients[cid].pc.localDescription.sdp)

    if (!isSafari) {
        app.clients[cid].pc.onnegotiationneeded = async function () {
            const offer = await app.clients[cid].pc.createOffer()
            await app.clients[cid].pc.setLocalDescription(offer);
            sendNego(app.clients[cid], offer);
        };
    }
    app.clients[cid].pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (answer)', candidate)
        await cb(app.clients[cid].pc.localDescription.sdp);
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
    document.getElementById('connection-stat').innerHTML = app.clients[cid].pc?.connectionState;
    document.getElementById('ice-connection-stat').innerHTML = app.clients[cid].pc?.iceConnectionState;
    console.log('%c' + new Date().toISOString() + ': ConnectionState: %c' + app.clients[cid].pc?.connectionState + ' %cIceConnectionState: %c' + app.clients[cid].pc?.iceConnectionState,
        'color:yellow', 'color:orange', 'color:yellow', 'color:orange');
    const toRemove = ['bg-gray-400', 'bg-red-400', 'bg-green-400'];
    const toAdd = app.clients[cid].pc?.connectionState === 'connected' && app.clients[cid].pc?.iceConnectionState === 'connected' ? 'bg-green-400' :
        app.clients[cid].pc?.connectionState === 'failed' || app.clients[cid].pc?.iceConnectionState === 'failed' ? 'bg-red-400' : 'bg-gray=400';
    document.getElementById('indicator').classList.remove.apply(document.getElementById('indicator').classList, toRemove);
    document.getElementById('indicator').classList.add(toAdd);
    if (app.clients[cid].pc?.connectionState === 'connected' && app.clients[cid].pc?.iceConnectionState === 'connected') {
        if (!app.clients[cid].connected) {
            const firstSDP = app.clients[cid].polite ? app.clients[cid].pc.remoteDescription.sdp : app.clients[cid].pc.localDescription.sdp;
            const secondSDP = !app.clients[cid].polite ? app.clients[cid].pc.remoteDescription.sdp : app.clients[cid].pc.localDescription.sdp;
            const fingerprints = firstSDP.split(/\r\n|\r|\n/).filter(x => x.match(/^a=fingerprint/)).map(x => 'polite:' + x).concat(
                secondSDP.split(/\r\n|\r|\n/).filter(x => x.match(/^a=fingerprint/)).map(x => 'impolite:' + x)).join('\r\n');
            const ejs = await genEmojis(fingerprints);
            console.log('ejs', ejs)
            document.getElementById('connection-secret').innerHTML = ejs;
        }
        app.clients[cid].connected = true;
        document.getElementById("copy-overlay").classList.add('hidden');
        if (!new URLSearchParams(window.location.search).has('r')) {
            history.replaceState('', '', window.location.origin + window.location.pathname);
        }
    }
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
        const cid = await getOffer(async (sdp) => {
            if (Date.now() - now > 10 * 1000) { return }
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
        const cid = await getAnswer(offer, async (sdp) => {
            if (Date.now() - now > 10 * 1000) { return }
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

var socket = io('wss://dealer.mie00.com', {
    transports: ['websocket']
});

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
    // debounce
    const emit = debounceEmit();
    const now = Date.now();
    const cid = await getOffer(async (sdp) => {
        if (Date.now() - now > 5 * 1000) { return }
        emit('offer', sid, sdp);
    })
    app.sids ||= {}
    app.sids[sid] = cid;
});
socket.on('answer', async (sid, sdp) => {
    app.clients[app.sids[sid]].pc.setRemoteDescription({
        type: "answer",
        sdp: sdp.trim() + '\n'
    });
});

socket.on('offer', async (sid, sdp) => {
    const emit = debounceEmit();
    const now = Date.now();
    const cid = await getAnswer(sdp, async (sdp) => {
        if (Date.now() - now > 5 * 1000) { return }
        emit('answer', sid, sdp);
    })
});
socket.on('error', async () => {
    history.replaceState(null, '', window.location.origin + window.location.pathname);
    windowLoader();
});

const WAIT = 1000;
const debounceEmit = () => {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            console.log("emitting");
            socket.emit.apply(socket, args)
        }, WAIT);
    };
};

const windowLoader = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    if (!urlParams.has('r')) {
        socket.emit('init');
    } else {
        const id = urlParams.get('r');
        socket.emit('subscribe', id);
        onId();
    }
}
console.log('coming here 2')
window.addEventListener("load", windowLoader);
