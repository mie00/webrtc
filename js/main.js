
const app = {
    cleanups: [],
};

const destroy = () => {
    if (app.nego_dc) {
        app.nego_dc.onclose = null;
    }
    if (app.pc) {
        for (var cleanup of app.cleanups) {
            cleanup();
        }
        try {
            app.nego_dc.send(JSON.stringify({
                type: "hangup",
            }))
        } catch { }
        app.pc.close();
        app.pc = null;
        Object.keys(app).forEach(key => delete app[key]);
        app.cleanups = [];
    }
    document.getElementById('media').innerHTML = '';
    document.getElementById('output').innerHTML = '';
    windowLoader();
}

document.getElementById('hangup').addEventListener('click', destroy)

async function init() {
    const config = {
        iceServers: document.getElementById("stun-servers").value.split(',').filter(link => link).map(link => ({ urls: "stun:" + link })),
    };

    const pc = new RTCPeerConnection(config);
    app.pc = pc;

    app.pc.oniceconnectionstatechange = e => log(app.pc.iceConnectionState);

    app.pc.onconnectionstatechange = ev => handleChange();
    app.pc.oniceconnectionstatechange = ev => handleChange();

    const nego_dc = pc.createDataChannel("nego", {
        negotiated: true,
        id: 0
    });
    app.nego_dc = nego_dc;
    nego_dc.onopen = () => {
        document.getElementById("copy-overlay").classList.add('hidden');
        history.pushState('', '', window.location.origin + window.location.pathname)
    };

    nego_dc.onclose = () => {
        destroy()
    };

    app.nego_handlers = {
        "answer": (data) => pc.setRemoteDescription(data),
        "offer": async (data) => {
            pc.setRemoteDescription(data);
            await pc.setLocalDescription();
            nego_dc.send(JSON.stringify(pc.localDescription));
        },
        "hangup": (data) => destroy(),
    };

    nego_dc.onmessage = async e => {
        const data = JSON.parse(e.data);
        const handler = app.nego_handlers[data.type];
        if (!handler) {
            console.log("cannot find handler for", data.type)
            return;
        };
        handler(data);
    };

    setupTrackHandler(app);
    if (true) {
        setupChatChannel(app);
        setupFileChannel(app);
        setupForwardChannel(app);
    }
}

const log = msg => output.innerHTML += `<br>${msg}`;

async function getOffer(cb) {
    await init();
    await app.pc.setLocalDescription(await app.pc.createOffer());

    app.pc.onnegotiationneeded = async function () {
        const offer = await app.pc.createOffer()
        await app.pc.setLocalDescription(offer);
        app.nego_dc.send(JSON.stringify(offer));
    };
    app.pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (offer)', candidate)
        await cb(app.pc.localDescription.sdp);
    };
}

async function getAnswer(offer, cb) {
    await init();
    await app.pc.setRemoteDescription({
        type: "offer",
        sdp: offer.trim() + '\n'
    });
    await app.pc.setLocalDescription(await app.pc.createAnswer());

    app.pc.onnegotiationneeded = async function () {
        const offer = await app.pc.createOffer()
        await app.pc.setLocalDescription(offer);
        app.nego_dc.send(JSON.stringify(offer));
    };
    app.pc.onicecandidate = async ({
        candidate
    }) => {
        console.log('Candidate found (answer)', candidate)
        await cb(app.pc.localDescription.sdp)
    };
}

function handleChange() {
    let stat = 'ConnectionState: <strong>' + app.pc?.connectionState + '</strong> IceConnectionState: <strong>' + app.pc?.iceConnectionState + '</strong>';
    document.getElementById('stat').innerHTML = stat;
    console.log('%c' + new Date().toISOString() + ': ConnectionState: %c' + app.pc?.connectionState + ' %cIceConnectionState: %c' + app.pc?.iceConnectionState,
        'color:yellow', 'color:orange', 'color:yellow', 'color:orange');
}
handleChange();

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

const acceptHandler = async (ev) => {
    let data = document.getElementById('paste-text').value;
    const answer = await decompress(data.trim(), "gzip");
    app.pc.setRemoteDescription({
        type: "answer",
        sdp: answer.trim() + '\n'
    });
}

document.getElementById("accept-button").addEventListener("click", acceptHandler)

const windowLoader = async () => {
    console.log("coming here")
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    const qrElem = document.getElementById("qrcode");
    if (!urlParams.get('offer')) {
        const now = Date.now();
        const link = document.getElementById('copy-text');
        document.getElementById('copy-overlay').classList.remove('hidden');
        const btn = document.getElementById("copy-button");
        const btn2 = document.getElementById("accept-button");
        const link2 = document.getElementById('paste-text');
        link2.value = '';
        btn2.classList.remove('hidden');
        link2.classList.remove('hidden');
        const bc = new BroadcastChannel("manual_rtc");
        app.bc = bc;
        bc.onmessage = async (event) => {
            let data = event.data;
            const answer = await decompress(data.trim(), "gzip");
            app.pc.setRemoteDescription({
                type: "answer",
                sdp: answer.trim() + '\n'
            });
        };
        await getOffer(async (sdp) => {
            if (Date.now() - now > 10 * 1000) { return }
            const compressed = await compress(sdp, "gzip");
            urlParams.set('offer', compressed);
            qrElem.innerHTML = '';
            new QRCode(qrElem, window.location.origin + window.location.pathname + '?' + urlParams.toString());
            link.value = window.location.origin + window.location.pathname + '?' + urlParams.toString();
            btn.innerHTML = "Copy";
        })
    } else if (urlParams.get('answer')) {
        const bc = new BroadcastChannel("manual_rtc");
        await bc.postMessage(urlParams.get('answer'));
        bc.close();
        document.getElementById('copy-overlay').classList.remove('hidden');
        document.getElementById('copy-overlay').innerHTML = '<p class="bg-white p-4 rounded-md shadow-md text-center">call started on another tab, please close this one</p>';
    } else {
        const now = Date.now();
        const offer = await decompress(urlParams.get('offer'), "gzip");
        const link = document.getElementById('copy-text');
        document.getElementById('copy-overlay').classList.remove('hidden');
        const btn = document.getElementById("copy-button");
        await getAnswer(offer, async (sdp) => {
            if (Date.now() - now > 10 * 1000) { return }
            const compressed = await compress(sdp, "gzip");
            urlParams.set('answer', compressed);
            qrElem.innerHTML = '';
            new QRCode(qrElem, window.location.origin + window.location.pathname + '?' + urlParams.toString());
            link.value = compressed;
            btn.innerHTML = "Copy";
        })
    }
}
console.log('coming here 2')
window.addEventListener("load", windowLoader);
