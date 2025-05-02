// Import types from global.d.ts
/// <reference path="../../../types/global.d.ts" />

import { getAllConfig } from '../../stores/configStore';

// Use type assertion to handle vendor prefixes
window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;

function normalizeStreamId(id: string): string {
    return id.replace('{', '').replace('}', '');
}

function getStreamElemId(id: string): string {
    return `stream-${normalizeStreamId(id)}`;
}

function streamInit(app: App): void {
    const appWithConfig = app as AppWithStreamConfig;
    appWithConfig.streams = {};
    appWithConfig.streamConfig = {};
    appWithConfig.viewStreams = {};
    appWithConfig.nego_handlers['stream.end'] = (data: { stream: string }, cid: string) => {
        document.querySelectorAll(`.${getStreamElemId(data.stream)}`).forEach(elem => elem.remove());
        delete appWithConfig.viewStreams[data.stream];

        for (let cid2 of Object.keys(appWithConfig.clients)) {
            if (cid == cid2) {
                continue;
            }
            sendNego(appWithConfig.clients[cid2], { type: 'stream.end', stream: data.stream });
        }
    };

    appWithConfig.cleanups['stream'] = (cid?: string) => {
        if (!cid) {
            Object.keys(appWithConfig.streams || {}).forEach((streamId) => {
                const stream = appWithConfig.streams![streamId];
                delete appWithConfig.streams![streamId];
                try {
                    Object.values(appWithConfig.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: normalizeStreamId(stream.id) }));
                } catch { }
                stream.getTracks().map((track) => track.stop());
            });
        }
    };
}

function setupTrackHandler(app: App, cid: string): void {
    app.clients[cid].pc?.addEventListener("track", async (ev: RTCTrackEvent) => {
        console.log("got track event", ev);
        app.viewStreams![normalizeStreamId(ev.streams[0].id)] = ev.streams[0];
        await createStreamElement(ev.streams[0], ev.track.kind as 'audio' | 'video', { muted: false });
        ev.track.onended = (ev: Event) => {
            console.log(ev);
            const target = ev.target as MediaStreamTrack;
            Object.values(app.clients).forEach((client) => sendNego(client, { type: 'stream.end', stream: normalizeStreamId(target.id) }));
            document.querySelectorAll(`.${getStreamElemId(target.id)}`).forEach(elem => elem.remove());
            delete app.viewStreams![normalizeStreamId(target.id)];
        };

        for (let cid2 of Object.keys(app.clients)) {
            if (cid == cid2) {
                continue;
            }
            app.clients[cid2].pc?.addTrack(ev.track, ev.streams[0]);
        }
    });
    for (let stream of Object.values(app.viewStreams || {})) {
        stream.getTracks().forEach(function (track) {
            app.clients[cid].pc?.addTrack(track, stream);
        });
    }
}

interface AudioProcessingApp extends AppWithStreamConfig {
    context?: AudioContext;
    script?: ScriptProcessorNode;
    mic?: MediaStreamAudioSourceNode;
}

function processAudio(app: AudioProcessingApp, stream: MediaStream, cb: (instant: number) => void): void {
    app.context = new AudioContext();
    app.script = app.context.createScriptProcessor(2048, 1, 1);
    app.script.onaudioprocess = function (event) {
        if (app.streamConfig && !app.streamConfig.audio) {
            return;
        }
        const input = event.inputBuffer.getChannelData(0);
        let i;
        let sum = 0.0;
        let clipcount = 0;
        for (i = 0; i < input.length; ++i) {
            sum += input[i] * input[i];
            if (Math.abs(input[i]) > 0.99) {
                clipcount += 1;
            }
        }
        const instant = Math.sqrt(Math.sqrt(sum / input.length)) * 100;
        cb(instant);
    };
    app.mic = app.context.createMediaStreamSource(stream);
    app.mic.connect(app.script);
    app.script.connect(app.context.destination);
}

function stopProcessingAudio(app: AudioProcessingApp): void {
    if (app.mic) app.mic.disconnect();
    if (app.script) app.script.disconnect();
    app.mic = undefined;
    app.script = undefined;
    app.context = undefined;
}

const tearDownStream = async (stream: MediaStream): Promise<void> => {
    stream.getTracks().forEach(function (track) {
        track.stop();
        track.dispatchEvent(new Event("ended"));
        for (var client of Object.values(window.app.clients)) {
            client.pc?.getTransceivers().forEach((transceiver) => {
                if (transceiver.sender.track?.id === track.id) {
                    transceiver.stop();
                }
            });
            sendNego(client, {
                type: "stream.end",
                stream: normalizeStreamId(stream.id),
            });
        }
    });
};

interface SetupTrackOptions {
    priority: RTCPriorityType;
    contentHint?: string;
    simulcast?: boolean;
}

const setupTrack = (track: MediaStreamTrack, stream: MediaStream, priority: RTCPriorityType, contentHint?: string, simulcast?: boolean): void => {
    if (contentHint && 'contentHint' in track) {
        // TODO: make configurable
        track.contentHint = contentHint;
    }
    for (var client of Object.values(window.app.clients)) {
        client.pc?.addTransceiver(track, {
            streams: [stream], sendEncodings: [
                { priority: priority, rid: "o" },
                ...(simulcast ? [
                    { priority: priority, rid: "h", maxBitrate: 1200 * 1024 },
                    { priority: priority, rid: "m", maxBitrate: 600 * 1024, scaleResolutionDownBy: 2 },
                    { priority: priority, rid: "l", maxBitrate: 300 * 1024, scaleResolutionDownBy: 4 },
                ] : [])
            ],
            direction: "sendrecv",
        });
    }
};

const setupStream = (stream: MediaStream, priority: RTCPriorityType, contentHint?: string, simulcast?: boolean): void => {
    stream.getTracks().forEach((track) => {
        setupTrack(track, stream, priority, contentHint, simulcast);
    });
};

interface StreamConfig {
    audio?: boolean;
    video?: boolean;
    screen?: boolean;
    local?: boolean;
    videoStream?: MediaStream;
    videoNode?: HTMLVideoElement;
}

interface AppWithStreamConfig extends App {
    streamConfig: StreamConfig;
}

const setupLocalStream = async (changed: 'audio' | 'video' | 'screen' | 'local', audioCb?: (number) => void): Promise<void> => {
    if (window.app.streams && window.app.streams[changed]) {
        const elems = document.querySelectorAll(`.${getStreamElemId(window.app.streams[changed].id)}`);
        for (const elem of Array.from(elems)) {
            const videoElem = elem as HTMLVideoElement & { 
                substitueStream?: MediaStream;
                substitueElement?: HTMLElement;
            };
            if (videoElem.substitueStream) {
                tearDownStream(videoElem.substitueStream);
            }
            if (videoElem.substitueElement) {
                videoElem.substitueElement.remove();
            }
            videoElem.srcObject = null;
            elem.remove();
        }
        delete window.app.viewStreams![normalizeStreamId(window.app.streams[changed].id)];
        tearDownStream(window.app.streams[changed]);
        delete window.app.streams[changed];
    }
    let stream: MediaStream | undefined;
    const appWithConfig = window.app as AppWithStreamConfig;
    
    if (changed === 'audio') {
        if (appWithConfig.streamConfig.audio) {
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    groupId: getAllConfig()['audio-device']?.split('|')[0], 
                    deviceId: getAllConfig()['audio-device']?.split('|')[1] 
                } 
            });
            setupStream(stream, "high");

            processAudio(window.app as AudioProcessingApp, stream, (instant) => {
                audioCb?.(instant);
            });
        } else {
            stopProcessingAudio(window.app as AudioProcessingApp);
            audioCb?.(0);
        }
    } else if (changed === 'video') {
        if (appWithConfig.streamConfig.video) {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    groupId: getAllConfig()['video-device']?.split('|')[0], 
                    deviceId: getAllConfig()['video-device']?.split('|')[1] 
                } 
            });
            if (appWithConfig.config && appWithConfig.config['blur-video'] !== 'yes') {
                setupStream(stream, "low", "motion", true);
            }
        }
    } else if (changed === 'local') {
        if (appWithConfig.streamConfig.local) {
            stream = appWithConfig.streamConfig.videoStream;
            if (stream) {
                stream.onaddtrack = async (ev: MediaStreamTrackEvent) => {
                    setupTrack(ev.track, stream!, "medium", undefined, false);
                };
            }
        }
    } else {
        if (appWithConfig.streamConfig.screen) {
            stream = await navigator.mediaDevices.getDisplayMedia({ 
                audio: true, 
                video: { cursor: "always" } as any 
            });
            setupStream(stream, "medium", 'detail', false);
        }
    }
    if (stream) {
        window.app.streams![changed] = stream;
        if (changed === 'video' && appWithConfig.streamConfig.video) {
            const elem = await createStreamElement(stream, 'video', { muted: true, controls: false, mirrored: true });
            if (appWithConfig.config && appWithConfig.config['blur-video'] === 'yes') {
                const substituteStream = await backgroundChange(elem as HTMLVideoElement);
                setupStream(substituteStream, "low", "motion", true);
            }
        } else if (changed === 'screen' && appWithConfig.streamConfig.screen) {
            await createStreamElement(stream, 'video', { muted: true, controls: false });
        } else if (changed === 'local' && appWithConfig.streamConfig.local) {
            await createStreamElement(stream, 'video', { muted: false, controls: true, passedElement: appWithConfig.streamConfig.videoNode });
        }
        window.app.viewStreams![normalizeStreamId(stream.id)] = stream;
    }
};

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

interface StreamDimensions {
    key: string;
    ow?: number;
    oh?: number;
    width?: number;
    height?: number;
}

const getStreamsDims = async (): Promise<StreamDimensions[]> => {
    // TODO: use videoHeight and width from element
    let elems: StreamDimensions[] = [];
    if (!window.app.viewStreams) return elems;
    let statsDict: Record<string, { width?: number, height?: number }> = {};
    for (const client of Object.values(window.app.clients)) {
        (await client.pc?.getStats())?.forEach(stat => {
            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                statsDict[normalizeStreamId(stat.trackIdentifier)] = { width: stat.frameWidth, height: stat.frameHeight };
            }
        });
    }
    for (let [key, value] of Object.entries(window.app.viewStreams)) {
        if (value.getVideoTracks().length === 0) {
            continue;
        }
        let width: number | undefined, height: number | undefined;
        console.log(isFirefox, value.getVideoTracks()[0].label != 'remote video');
        const settings = value.getVideoTracks()[0].getSettings();
        width = settings.width;
        height = settings.height;
        if (!width || !height) {
            if (normalizeStreamId(value.getVideoTracks()[0].id) in statsDict) {
                const stats = statsDict[normalizeStreamId(value.getVideoTracks()[0].id)];
                width = stats.width;
                height = stats.height;
            }
        }
        if (!width || !height) {
            const videoElem = document.querySelector(`video.${getStreamElemId(key)}`) as HTMLVideoElement;
            if (videoElem) {
                height = videoElem.videoHeight;
                width = videoElem.videoWidth;
            }
        }
        elems.push({ key, ow: width, oh: height, width: width && height ? Math.sqrt(width / height) : undefined, height: width && height ? Math.sqrt(height / width) : undefined });
    }
    return elems;
};

interface BinPackResult {
    positioned: Array<{
        x: number;
        y: number;
        datum: StreamDimensions;
    }>;
    unpositioned: any[];
    binWidth: (width: number) => any;
    binHeight: (height: number) => any;
    addAll: (items: any[]) => void;
}

const refreshStreamViews = async (): Promise<void> => {
    const allElems = await getStreamsDims();
    if (allElems.length == 0) {
        return;
    }
    for (const k of allElems) {
        const videoElem = document.querySelector(`video.${getStreamElemId(k.key)}`) as HTMLVideoElement & { substitueElement?: HTMLElement };
        if (!k.width || !k.height) {
            if (!videoElem) continue;
            videoElem.style.display = 'none';
        } else if (videoElem && videoElem.substitueElement) {
            videoElem.style.display = 'none';
        }
    }
    const elems = allElems.filter(({ width, height }) => width && height);

    const media = document.getElementById('media');
    if (!media) return;
    
    const totalWidth = media.clientWidth;
    const totalHeight = media.clientHeight;
    let normalizedWidth = Math.sqrt(totalWidth / totalHeight) * Math.sqrt(elems.length);
    const origWidth = normalizedWidth;
    let normalizedHeight = Math.sqrt(totalHeight / totalWidth) * Math.sqrt(elems.length);
    let packer: BinPackResult;
    while (true) {
        packer = BinPack();
        packer.binWidth(normalizedWidth);
        packer.binHeight(normalizedHeight);
        packer.addAll(elems);
        if (packer.unpositioned.length !== 0 && normalizedWidth > 10 * origWidth) {
            throw new Error('Could not fit streams');
        } else if (packer.unpositioned.length === 0) {
            break;
        }
        normalizedWidth *= 1.1;
        normalizedHeight *= 1.1;
    }
    for (let elem of packer.positioned) {
        let videoElem = document.querySelector(`video.${getStreamElemId(elem.datum.key)}`) as HTMLVideoElement & { substitueElement?: HTMLElement };
        if (!videoElem) continue;
        
        if (videoElem.substitueElement) {
            videoElem = videoElem.substitueElement as HTMLVideoElement;
        }
        videoElem.style.width = `${elem.datum.width! / normalizedWidth * totalWidth}px`;
        videoElem.style.height = `${elem.datum.height! / normalizedHeight * totalHeight}px`;
        videoElem.style.left = `${elem.x / normalizedWidth * totalWidth}px`;
        videoElem.style.top = `${elem.y / normalizedHeight * totalHeight}px`;
        videoElem.style.position = 'absolute';
        videoElem.style.display = 'block';
    }
};

window.setInterval(() => {
    refreshStreamViews();
}, 1000);

window.addEventListener('resize', function (event) {
    refreshStreamViews();
}, true);

interface StreamElementOptions {
    muted?: boolean;
    controls?: boolean;
    mirrored?: boolean;
    passedElement?: HTMLVideoElement | HTMLAudioElement | null;
}

interface HTMLMediaElementWithSubstitute extends HTMLMediaElement {
    substitueStream?: MediaStream;
    substitueElement?: HTMLElement;
}

const createStreamElement = async (stream: MediaStream, tag: 'video' | 'audio', options: StreamElementOptions = {}): Promise<HTMLMediaElementWithSubstitute> => {
    const { muted = false, controls = false, mirrored = false, passedElement = null } = options;
    let mediaElement: HTMLMediaElementWithSubstitute;
    if (passedElement) {
        mediaElement = passedElement as HTMLMediaElementWithSubstitute;
    } else {
        mediaElement = document.createElement(tag) as HTMLMediaElementWithSubstitute;
        mediaElement.srcObject = stream;
    }
    mediaElement.classList.add(getStreamElemId(stream.id));
    if (mirrored) {
        mediaElement.style.transform = 'scaleX(-1)';
    }
    mediaElement.muted = muted;
    mediaElement.autoplay = true;
    mediaElement.controls = controls;
    (mediaElement as any).disablePictureInPicture = true;
    (mediaElement as any).playsInline = true;
    // mediaElement.classList.add('w-full')
    const mediaContainer = document.getElementById('media');
    if (mediaContainer) {
        mediaContainer.appendChild(mediaElement);
    }
    await mediaElement.play();
    return mediaElement;
};

const setButton = (target: HTMLElement, on: boolean): void => {
    if (on) {
        target.classList.add('bg-blue-500');
    } else {
        target.classList.remove('bg-blue-500');
    }
};


// Export functions for use in other modules
export {
    normalizeStreamId,
    getStreamElemId,
    streamInit,
    setupTrackHandler,
    processAudio,
    stopProcessingAudio,
    tearDownStream,
    setupTrack,
    setupLocalStream,
    getStreamsDims,
    refreshStreamViews,
    createStreamElement,
    setButton,
    setupStream,
    type AppWithStreamConfig
};
