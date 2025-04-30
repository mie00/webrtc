// Type definitions for local use
interface NegoMessage {
  id?: string;
  type: string;
  [key: string]: any;
}

interface ClientInitOptions {
  sid: string;
  offer?: string;
}

interface Participant {
  relay: string;
}

// Only attach event listener if element exists (for testing compatibility)
const toggleControls = document.getElementById('toggle-controls');
if (toggleControls) {
    toggleControls.addEventListener('click', function () {
        const controlsPanel = document.querySelector('#control');
        const tc = document.getElementById('toggle-controls');
        if (controlsPanel && tc) {
            if (controlsPanel.classList.contains('left-full')) {
                controlsPanel.classList.add('right-0');
                controlsPanel.classList.remove('left-full');
                tc.innerHTML = '&gt;';
            } else {
                controlsPanel.classList.remove('right-0');
                controlsPanel.classList.add('left-full');
                tc.innerHTML = '&lt;';
            }
        }
    });
}

const vvals: string[] = ['static', 'relative', 'absolute', 'fixed', 'sticky'];
let indda: number = 0;

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

const reset = (): void => {
    window.location.href = window.location.origin + window.location.pathname;
}
// Only attach event listeners if elements exist (for testing compatibility)
const resetButton = document.getElementById('reset');
if (resetButton) {
    resetButton.addEventListener('click', reset);
}

const openConfigButton = document.getElementById('open-config');
if (openConfigButton) {
    openConfigButton.addEventListener('click', () => {
        configOverlay?.classList.remove('hidden');
    });
}

const openQrButton = document.getElementById('open-qr');
if (openQrButton) {
    openQrButton.addEventListener('click', () => {
        copyOverlay?.classList.remove('hidden');
    });
}
if (copyOverlay) {
    copyOverlay.addEventListener('click', (ev) => {
        if (ev.target === copyOverlay) {
            ev.target.classList.add('hidden');
        }
    });
}

if (configOverlay) {
    configOverlay.addEventListener('click', (ev) => {
        if (ev.target === configOverlay) {
            ev.target.classList.add('hidden');
        }
    });
}

const app: App = {
    config: getConfig(),
    clients: {},
    cleanups: {},
    nego_handlers: {},
    nego_messages: {}
};

const isSafari: boolean = navigator.vendor && navigator.vendor.indexOf('Apple') > -1;

const destroyClient = (cid: string): void => {
    if (!app.clients) {
        app.clients = {};
        return;
    }
    
    Object.keys(app.clients).filter((key) => key !== cid).forEach((key) => {
        sendNego(app.clients[key], {type: 'participant.end', cid: cid});
    });
    
    if (app.clients[cid]) {
        if (app.clients[cid].nego_dc) {
            app.clients[cid].nego_dc.onclose = null;
            app.clients[cid].nego_dc.onmessage = null;
            app.clients[cid].nego_dc.onclose = null;
        }
        
        if (app.clients[cid]._transceiver_interval) {
            clearInterval(app.clients[cid]._transceiver_interval);
        }
        
        if (app.clients[cid].pc) {
            if (app.cleanups) {
                for (const cleanup of Object.values(app.cleanups)) {
                    cleanup(cid);
                }
            }
            app.clients[cid].pc.close();
            app.clients[cid].pc = null;
            Object.keys(app.clients[cid]).forEach(key => delete app.clients[cid][key]);
        }
        
        delete app.clients[cid];
    }
    
    handleChange();
}

const cleanup = (): void => {
    for (const cid of Object.keys(app.clients)) {
        for (const cleanup of Object.values(app.cleanups)) {
            cleanup(cid);
        }
    }
    for (const cleanup of Object.values(app.cleanups)) {
        cleanup();
    }
    app.cleanups = {};
    for (const cid of Object.keys(app.clients)) {
        sendNego(app.clients[cid], {
            type: "hangup",
        });
        destroyClient(cid);
    }
}

window.addEventListener("beforeunload", cleanup);

const destroy = (): void => {
    cleanup();
    const mediaElement = document.getElementById('media');
    const outputElement = document.getElementById('output');
    if (mediaElement) mediaElement.innerHTML = '';
    if (outputElement) outputElement.innerHTML = '';
    handleChange();
    reset();
}

const hangupButton = document.getElementById('hangup');
if (hangupButton) {
    hangupButton.addEventListener('click', destroy);
}

function uuidv4(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

async function init(): Promise<void> {
    if (app.inited) {
        return;
    }
    app.participants = {};
    app.cleanups = {};
    app.clients = {};
    app.inited = true;
    app.nego_messages = {};
    app.nego_handlers = {
        "answer": (data: any, cid: string) => {
            app.clients[cid].pc?.setRemoteDescription(data);
        },
        "offer": async (data: any, cid: string) => {
            const client = app.clients[cid];
            // if (isSafari && !client.polite) return;
            if (!client.polite) {
                if (client.makingOffer) return;
                if (client.pc?.signalingState != "stable") return;
            }
            await client.pc?.setRemoteDescription(data);
            await client.pc?.setLocalDescription();
            if (client.pc?.localDescription) {
                sendNego(client, client.pc.localDescription);
            }
        },
        "hangup": (data: any, cid: string) => {
            if (!app.clients[cid].polite) {
                destroyClient(cid);
            } else {
                destroy();
            }
        },
        "participant": (data: any, cid: string) => {
            if (!app.participants) app.participants = {};
            app.participants[data.cid] = { relay: cid };
            handleChange();
        },
        "participant.end": (data: any, cid: string) => {
            if (app.participants) {
                delete app.participants[data.cid];
            }
            handleChange();
        },
    };

    streamInit(app);
    forwardInit(app);
}

function sendNego(client: Client, data: NegoMessage): void {
    if (!data.id) {
        data = JSON.parse(JSON.stringify(data));
        data.id = uuidv4();
        if (!app.nego_messages) {
            app.nego_messages = {};
        }
        app.nego_messages[data.id] = {};
    }
    try {
        client.nego_dc?.send(JSON.stringify(data));
    } catch (e) {
        console.log("error sending data", data, "to", client, "error", e);
    }
}

function logDiff(d1: string, d2: string): void {
    const diffs = document.getElementById('diffs');
    if (diffs) {
        if (app.debug) {
            diffs.classList.remove('hidden');
        }
        let span: HTMLSpanElement | null = null;

        const diff = Diff.diffChars(d1, d2);
        const fragment = document.createDocumentFragment();

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
        diffs.appendChild(fragment);
    }
}

async function initClient(polite: boolean, options: ClientInitOptions): Promise<string> {
    await init();
    const config = {
        iceServers: app.config["stun-servers"].split(',').filter(link => link).map(link => ({ urls: "stun:" + link })).concat(
            app.config["turn-server-v2"] && app.config["turn-username"] && app.config["turn-password"] ? [{
                urls: "turn:" + app.config["turn-server-v2"],
                username: app.config["turn-username"],
                credential: app.config["turn-password"],
            }] : []
        ),
    };

    const { sid, offer } = options;
    const cid = uuidv4();
    app.sids = app.sids || {};
    if (sid in app.sids && app.sids[sid] in app.clients) {
        app.clients[app.sids[sid]].pc?.restartIce();
        return app.sids[sid];
    }
    app.sids[sid] = cid;
    app.clients[cid] = {};

    const pc = new RTCPeerConnection(config);
    app.clients[cid].pc = pc;

    app.clients[cid].pc.onconnectionstatechange = () => handleChange(cid);
    app.clients[cid].pc.oniceconnectionstatechange = () => {
        if (app.clients[cid].pc?.iceConnectionState === "failed") {
            app.clients[cid].pc?.restartIce();
        }
    };

    app.clients[cid].polite = polite;

    const nego_dc = pc.createDataChannel("nego", {
        negotiated: true,
        id: 0
    });
    app.clients[cid].nego_dc = nego_dc;
    nego_dc.onclose = async e => {
        console.log(e);
        destroyClient(cid);
    }

    nego_dc.onerror = function (error) {
        console.error('Data channel error:', error);
        app.clients[cid].pc?.restartIce();
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
            console.log("cannot find handler for", data.type);
            return;
        }
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
            await app.clients[cid].pc?.setLocalDescription();
            if (app.clients[cid].pc?.currentLocalDescription && app.clients[cid].pc?.localDescription) {
                logDiff(app.clients[cid].pc.currentLocalDescription.sdp, app.clients[cid].pc.localDescription.sdp);
            }
            if (app.clients[cid].pc?.localDescription) {
                sendNego(app.clients[cid], app.clients[cid].pc.localDescription);
            }
        } catch (e) {
            console.log("renegotiation error", e);
        } finally {
            app.clients[cid].makingOffer = false;
        }
    };

    if (!offer) {
        setTimeout(() => {
            if (app.clients[cid].pc?.signalingState === 'have-local-offer') {
                destroyClient(cid);
            }
        }, 60 * 1000);
    }
    return cid;
}

const log = (msg: string): void => {
    const output = document.getElementById('output');
    if (output) output.innerHTML += `<br>${msg}`;
};

async function getOffer(cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
    const cid = await initClient(false, options);
    app.clients[cid].pc.onicecandidate = async ({ candidate }) => {
        console.log('Candidate found (offer)', candidate);
        await cb(candidate);
    };
    return cid;
}

async function getAnswer(offer: string, cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}): Promise<string> {
    const cid = await initClient(true, {sid: options.sid, offer});
    app.clients[cid].pc.onicecandidate = async ({ candidate }) => {
        console.log('Candidate found (answer)', candidate);
        await cb(candidate);
    };
    return cid;
}

async function sha256(message: string): Promise<string> {
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

async function genEmojis(digest: string): Promise<string> {
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
        ind += 1;
    }
    return (EMOJIS[val % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length) % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length) % EMOJIS.length]) +
        (EMOJIS[Math.floor(val / EMOJIS.length / EMOJIS.length / EMOJIS.length) % EMOJIS.length]);
}

async function handleChange(cid?: string): Promise<void> {
    const participantsElement = document.getElementById('participants');
    if (!participantsElement) return;
    
    const parent = document.createElement('div');

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
            let certificates: Record<string, any> = {};
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
                console.log('ejs', ejs);
                textContainer.appendChild(document.createTextNode(ejs));
            }
            const copyOverlayElement = document.getElementById("copy-overlay");
            if (copyOverlayElement) copyOverlayElement.classList.add('hidden');
            if (!new URLSearchParams(window.location.search).has('r')) {
                history.replaceState('', '', window.location.origin + window.location.pathname);
            }
        }
    }
    
    if (app.participants) {
        for (const [key, value] of Object.entries(app.participants)) {
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
    }
    
    if (participantsElement.firstChild) {
        participantsElement.firstChild.remove();
    }
    participantsElement.appendChild(parent);
}

const copyHandler = async (ev: MouseEvent): Promise<void> => {
    const target = ev.target as HTMLElement;
    if (navigator.clipboard) {
        try {
            const link = document.getElementById('copy-text') as HTMLInputElement;
            await navigator.clipboard.writeText(link.value);
            target.innerHTML = "Copied successfully";
        } catch {
            target.innerHTML = "Error copying, please copy manually";
        }
    } else {
        target.innerHTML = "Clipboard unavailable, please copy manually";
    }
}

// Only attach event listener if element exists (for testing compatibility)
const copyButton = document.getElementById("copy-button");
if (copyButton) {
    copyButton.addEventListener("click", copyHandler);
}

const acceptHandler = async (cid: string): Promise<void> => {
    const pasteText = document.getElementById('paste-text') as HTMLInputElement;
    if (!pasteText) return;
    
    let data = pasteText.value;
    const answer = await decompress(data.trim());
    app.clients[cid].pc?.setRemoteDescription({
        type: "answer",
        sdp: answer.trim() + '\n'
    });
}

let windowLoader: () => Promise<void>;

const clientWindowLoader = async (): Promise<void> => {
    console.log("coming here");
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    const qrElem = document.getElementById("qrcode");
    if (!urlParams.get('offer')) {
        const now = Date.now();
        const link = document.getElementById('copy-text') as HTMLInputElement;
        const copyOverlayElement = document.getElementById('copy-overlay');
        if (copyOverlayElement) copyOverlayElement.classList.remove('hidden');
        const btn = document.getElementById("copy-button");
        const btn2 = document.getElementById("accept-button");
        const link2 = document.getElementById('paste-text') as HTMLInputElement;
        if (link2) link2.value = '';
        if (btn2) btn2.classList.remove('hidden');
        if (link2) link2.classList.remove('hidden');
        let cid: string;
        cid = await getOffer(async (candidate) => {
            if (Date.now() - now > 10 * 1000) { return; }
            const sdp = app.clients[cid].pc?.localDescription?.sdp;
            if (sdp) {
                const compressed = await compress(sdp);
                urlParams.set('offer', compressed);
                if (qrElem) qrElem.innerHTML = '';
                const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
                try {
                    new QRCode(qrElem, newUrl);
                } catch (e) {
                    console.log("qr code generation error", e);
                }
                if (link) link.value = newUrl;
                if (btn) btn.innerHTML = "Copy";
            }
        }, {sid: ''});
        const bc = new BroadcastChannel("manual_rtc");
        app.bc = bc;
        bc.onmessage = async (event) => {
            let data = event.data;
            const answer = await decompress(data.trim());
            app.clients[cid].pc?.setRemoteDescription({
                type: "answer",
                sdp: answer.trim() + '\n'
            });
        };
        const acceptButton = document.getElementById("accept-button");
        if (acceptButton) {
            acceptButton.addEventListener("click", () => acceptHandler(cid));
        }
    } else if (urlParams.get('answer')) {
        const bc = new BroadcastChannel("manual_rtc");
        const answer = urlParams.get('answer');
        if (answer) await bc.postMessage(answer);
        bc.close();
        const copyOverlayElement = document.getElementById('copy-overlay');
        if (copyOverlayElement) {
            copyOverlayElement.classList.remove('hidden');
            copyOverlayElement.innerHTML = '<p class="bg-white p-4 rounded-md shadow-md text-center">call started on another tab, please close this one</p>';
        }
    } else {
        const now = Date.now();
        const offerParam = urlParams.get('offer');
        if (offerParam) {
            const offer = await decompress(offerParam);
            const link = document.getElementById('copy-text') as HTMLInputElement;
            const copyOverlayElement = document.getElementById('copy-overlay');
            if (copyOverlayElement) copyOverlayElement.classList.remove('hidden');
            const btn = document.getElementById("copy-button");
            let cid: string;
            cid = await getAnswer(offer, async (candidate) => {
                if (Date.now() - now > 10 * 1000) { return; }
                const sdp = app.clients[cid].pc?.localDescription?.sdp;
                if (sdp) {
                    const compressed = await compress(sdp);
                    urlParams.set('answer', compressed);
                    if (qrElem) qrElem.innerHTML = '';
                    try {
                        new QRCode(qrElem, (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString());
                    } catch (e) {
                        console.log("qr code generation error", e);
                    }
                    if (link) link.value = compressed;
                    if (btn) btn.innerHTML = "Copy";
                }
            }, {sid: ''});
        }
    }
}

const socket = io('wss://dealer.mie00.com');

const onId = (): void => {
    const link = document.getElementById('copy-text') as HTMLInputElement;
    const copyOverlayElement = document.getElementById('copy-overlay');
    if (copyOverlayElement) copyOverlayElement.classList.remove('hidden');
    const urlParams = new URLSearchParams(window.location.search);
    const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
    if (link) link.value = newUrl;
    const btn = document.getElementById("copy-button");
    if (btn) btn.innerHTML = "Copy";
    const qrElem = document.getElementById("qrcode");
    if (qrElem) qrElem.innerHTML = '';
    try {
        new QRCode(qrElem, newUrl);
    } catch (e) {
        console.log("qr code generation error", e);
    }
}

socket.on('init', async (id: string) => {
    console.log("init", id);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('r', id);
    history.replaceState(null, '', '?' + urlParams.toString());
    onId();
});

socket.on('subscribed', async (sid: string) => {
    console.log('got subscribed', sid);
    // debounce
    const cid = await getOffer(async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid});
    const sdp = app.clients[cid].pc?.localDescription?.sdp;
    if (sdp) {
        console.log("sending an offer", sid, sdp);
        socket.emit('offer', sid, sdp);
    }
});

socket.on('answer', async (sid: string, sdp: string) => {
    console.log('got an answer', sid, sdp);
    if (app.sids && app.sids[sid] && app.clients[app.sids[sid]]) {
        app.clients[app.sids[sid]].pc?.setRemoteDescription({
            type: "answer",
            sdp: sdp.trim() + '\n'
        });
    }
});

socket.on('offer', async (sid: string, sdp: string) => {
    console.log('got an offer', sid, sdp);
    const cid = await getAnswer(sdp, async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid});
    const asdp = app.clients[cid].pc?.localDescription?.sdp;
    if (asdp) {
        console.log("sending an answer", sid, asdp);
        socket.emit('answer', sid, asdp);
    }
});

socket.on('error', async () => {
    history.replaceState(null, '', window.location.origin + window.location.pathname);
    if (app.config['config-loader'] === 'client') {
        windowLoader = clientWindowLoader;
    }
    windowLoader();
});

socket.on('candidate', async (sid: string, candidate: string) => {
    console.log('got a candidate from peer', sid, candidate);
    if (app.sids && app.sids[sid] && app.clients[app.sids[sid]]) {
        app.clients[app.sids[sid]].pc?.addIceCandidate(JSON.parse(candidate));
    }
});

const serverWindowLoader = async (): Promise<void> => {
    const urlParams = new URLSearchParams(window.location.search);
    window.removeEventListener("load", windowLoader);
    const acceptButton = document.getElementById("accept-button");
    const joinButton = document.getElementById("join-button");
    const copyButton = document.getElementById("copy-button");
    if (!urlParams.has('r')) {
        if (copyButton) copyButton.classList.remove("hidden");
        if (acceptButton) acceptButton.classList.add("hidden");
        if (joinButton) joinButton.classList.add("hidden");
        socket.emit('init');
    } else {
        const id = urlParams.get('r');
        onId();
        if (copyButton) copyButton.classList.add("hidden");
        if (acceptButton) acceptButton.classList.add("hidden");
        if (joinButton) {
            joinButton.classList.remove("hidden");
            joinButton.onclick = () => {
                if (id) socket.emit('subscribe', id);
            };
        }
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

console.log('coming here 2');
window.addEventListener("load", windowLoader);

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sendNego,
        destroyClient,
        cleanup,
        destroy,
        uuidv4,
        init,
        initClient,
        getOffer,
        getAnswer,
        sha256,
        genEmojis,
        handleChange,
        logDiff,
        // Export the app object for testing
        _getApp: () => app
    };
}
