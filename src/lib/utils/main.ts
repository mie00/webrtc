import { WebRTCApp } from './WebRTCApp.js';
import { getConfig } from './config.js'

// Make WebRTCApp available globally
window.WebRTCApp = WebRTCApp;

interface Participant {
  relay: string;
}

// Create a single instance of the app
const webRTCApp = new WebRTCApp(getConfig());

// Expose it to the window for legacy code that might need it
window.app = window.app || webRTCApp.getApp();

const vvals: string[] = ['static', 'relative', 'absolute', 'fixed', 'sticky'];
let indda: number = 0;

const configOverlay = document.getElementById('config-overlay');
const copyOverlay = document.getElementById('copy-overlay');

// Only attach event listeners if elements exist (for testing compatibility)
const resetButton = document.getElementById('reset');
if (resetButton) {
    resetButton.addEventListener('click', () => WebRTCApp.reset());
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
            (ev.target as HTMLElement).classList.add('hidden');
        }
    });
}

if (configOverlay) {
    configOverlay.addEventListener('click', (ev) => {
        if (ev.target === configOverlay) {
            (ev.target as HTMLElement).classList.add('hidden');
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

window.addEventListener("beforeunload", () => webRTCApp.cleanup());

const hangupButton = document.getElementById('hangup');
if (hangupButton) {
    hangupButton.addEventListener('click', () => webRTCApp.destroy());
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
    const app = webRTCApp.getApp();
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
        cid = await webRTCApp.getOffer(async (candidate) => {
            if (Date.now() - now > 10 * 1000) { return; }
            const app = webRTCApp.getApp();
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
        const app = webRTCApp.getApp();
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
            cid = await webRTCApp.getAnswer(offer, async (candidate) => {
                if (Date.now() - now > 10 * 1000) { return; }
                const app = webRTCApp.getApp();
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
    const cid = await webRTCApp.getOffer(async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid});
    const app = webRTCApp.getApp();
    const sdp = app.clients[cid].pc?.localDescription?.sdp;
    if (sdp) {
        console.log("sending an offer", sid, sdp);
        socket.emit('offer', sid, sdp);
    }
});

socket.on('answer', async (sid: string, sdp: string) => {
    console.log('got an answer', sid, sdp);
    const app = webRTCApp.getApp();
    if (app.sids && app.sids[sid] && app.clients[app.sids[sid]]) {
        app.clients[app.sids[sid]].pc?.setRemoteDescription({
            type: "answer",
            sdp: sdp.trim() + '\n'
        });
    }
});

socket.on('offer', async (sid: string, sdp: string) => {
    console.log('got an offer', sid, sdp);
    const cid = await webRTCApp.getAnswer(sdp, async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
    }, {sid});
    const app = webRTCApp.getApp();
    const asdp = app.clients[cid].pc?.localDescription?.sdp;
    if (asdp) {
        console.log("sending an answer", sid, asdp);
        socket.emit('answer', sid, asdp);
    }
});

socket.on('error', async () => {
    history.replaceState(null, '', window.location.origin + window.location.pathname);
    const app = webRTCApp.getApp();
    if (app.config['config-loader'] === 'client') {
        windowLoader = clientWindowLoader;
    }
    windowLoader();
});

socket.on('candidate', async (sid: string, candidate: string) => {
    console.log('got a candidate from peer', sid, candidate);
    const app = webRTCApp.getApp();
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

window.addEventListener("load", windowLoader);

module.exports = {
    webRTCApp,
    // For backward compatibility
    sendNego: (client: WebRTCClient, data: any) => webRTCApp.sendNego(client, data),
    destroyClient: (cid: string) => webRTCApp.destroyClient(cid),
    cleanup: () => webRTCApp.cleanup(),
    destroy: () => webRTCApp.destroy(),
    uuidv4: () => webRTCApp.uuidv4(),
    init: () => webRTCApp.init(),
    initClient: (polite: boolean, options: ClientInitOptions) => webRTCApp.initClient(polite, options),
    getOffer: (cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}) => webRTCApp.getOffer(cb, options),
    getAnswer: (offer: string, cb: (candidate: RTCIceCandidate | null) => Promise<void>, options: {sid: string}) => webRTCApp.getAnswer(offer, cb, options),
    sha256: (message: string) => webRTCApp.sha256(message),
    genEmojis: (digest: string) => webRTCApp.genEmojis(digest),
    handleChange: (cid?: string) => webRTCApp.handleChange(cid),
    logDiff: (d1: string, d2: string) => webRTCApp.logDiff(d1, d2),
    // Static methods
    log: (msg: string) => WebRTCApp.log(msg),
    reset: () => WebRTCApp.reset(),
    // Export the app object for testing
    _getApp: () => webRTCApp.getApp()
};
