// Import types from global.d.ts
/// <reference path="../../../types/global.d.ts" />

import { getAllConfig } from '../../stores/configStore.js';

// Use type assertion to handle vendor prefixes
window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;

function normalizeStreamId(id: string): string {
    return id.replace('{', '').replace('}', '');
}

interface AudioProcessingApp extends AppWithStreamConfig {
    context?: AudioContext;
    script?: ScriptProcessorNode;
    mic?: MediaStreamAudioSourceNode;
}

function processAudio(app: AudioProcessingApp, stream: MediaStream, cb: (instant: number) => void): void {
    app.context = new window.AudioContext();
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
        for (var client of Object.values(window.app.clients) as WebRTCClient[]) {
            client.pc?.getTransceivers().forEach((transceiver: RTCRtpTransceiver) => {
                if (transceiver.sender.track?.id === track.id) {
                    transceiver.stop();
                }
            });
            window.webRTCApp.sendNego(client, {
                type: "stream.end",
                stream: normalizeStreamId(stream.id),
            });
        }
    });
};

const setupTrack = (track: MediaStreamTrack, stream: MediaStream, priority: RTCPriorityType, contentHint?: string, simulcast?: boolean): void => {
    if (contentHint && 'contentHint' in track) {
        // TODO: make configurable
        track.contentHint = contentHint;
    }
    for (var client of Object.values(window.app.clients) as WebRTCClient[]) {
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


// Export functions for use in other modules
export {
    normalizeStreamId,
    processAudio,
    stopProcessingAudio,
    tearDownStream,
    setupTrack,
    setupStream,
    type AppWithStreamConfig,
    type AudioProcessingApp,
};
