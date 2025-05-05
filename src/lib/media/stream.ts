// Import types from global.d.ts
/// <reference path="../../../types/global.d.ts" />

import { getAllConfig } from '../../stores/configStore.js';
import { getStreamState } from '../../stores/streamStore.js'; // Import store getter
import { getAllDirectClients } from '../../stores/connectionStore.js';
// Use type assertion to handle vendor prefixes
window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;

function normalizeStreamId(id: string): string {
    return id.replace('{', '').replace('}', '');
}

// Define a type for the returned audio processing objects
interface AudioNodes {
    context: AudioContext;
    script: ScriptProcessorNode;
    mic: MediaStreamAudioSourceNode;
}

// REMOVE AppWithStreamConfig and AudioProcessingApp interfaces

function processAudio(stream: MediaStream, cb: (instant: number) => void): AudioNodes | null {
    const streamConfig = getStreamState().streamConfig;
    if (!streamConfig.audio) {
        return null; // Don't process if audio is disabled in config
    }

    const context = new window.AudioContext();
    const script = context.createScriptProcessor(2048, 1, 1);
    script.onaudioprocess = function (event) {
        // Re-check config in case it changed
        if (!getStreamState().streamConfig.audio) {
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
    const mic = context.createMediaStreamSource(stream);
    mic.connect(script);
    script.connect(context.destination);

    return { context, script, mic };
}

function stopProcessingAudio(nodes: AudioNodes | null): void {
    if (!nodes) return;
    const { context, script, mic } = nodes;
    if (mic) mic.disconnect();
    if (script) script.disconnect();
    // context?.close(); // Closing context might be too aggressive if reused
}

const tearDownStream = async (stream: MediaStream): Promise<void> => {
    const clients = getAllDirectClients(); // Get clients via webRTCApp
    stream.getTracks().forEach(function (track) {
        track.stop();
        track.dispatchEvent(new Event("ended"));
        for (var client of Object.values(clients) as WebRTCClient[]) { // Use clients variable
            client.pc?.getTransceivers().forEach((transceiver: RTCRtpTransceiver) => {
                if (transceiver.sender.track?.id === track.id) {
                    transceiver.stop();
                }
            });
            // Assuming sendNego is available on window.webRTCApp
            window.webRTCApp.sendNego(client, {
                type: "stream.end",
                stream: normalizeStreamId(stream.id),
            });
        }
    });
};

const setupTrack = (track: MediaStreamTrack, stream: MediaStream, priority: RTCPriorityType, contentHint?: string, simulcast?: boolean): void => {
    const clients = getAllDirectClients(); // Get clients via webRTCApp
    if (contentHint && 'contentHint' in track) {
        track.contentHint = contentHint;
    }
    for (var client of Object.values(clients) as WebRTCClient[]) { // Use clients variable
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

// setupStream remains the same as it calls setupTrack

// REMOVE StreamConfig interface

// Export functions for use in other modules
export {
    normalizeStreamId,
    processAudio,
    stopProcessingAudio,
    tearDownStream,
    setupTrack,
    setupStream,
    type AudioNodes, // Export the new type
    // REMOVE AppWithStreamConfig, AudioProcessingApp exports
};
