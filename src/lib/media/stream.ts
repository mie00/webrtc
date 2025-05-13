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

// Define types for audio processing
interface AudioNodes {
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
    dataArray: Uint8Array;
    animationFrame?: number;
}

// Audio processor worklet code as a string
const audioProcessorWorklet = `
class AudioLevelProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0][0];
    if (!input) return true;
    
    let sum = 0.0;
    let clipcount = 0;
    
    for (let i = 0; i < input.length; ++i) {
      sum += input[i] * input[i];
      if (Math.abs(input[i]) > 0.99) {
        clipcount += 1;
      }
    }
    
    const instant = Math.sqrt(Math.sqrt(sum / input.length)) * 100;
    this.port.postMessage({ instant });
    
    return true;
  }
}

registerProcessor('audio-level-processor', AudioLevelProcessor);
`;

// Setup audio processing with modern AudioWorklet API
async function processAudio(stream: MediaStream, cb: (instant: number) => void): Promise<AudioNodes | null> {
    const streamConfig = getStreamState().streamConfig;
    if (!streamConfig.audio) {
        return null; // Don't process if audio is disabled in config
    }

    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    
    // Create and use the worklet for audio level processing
    try {
        // Create a blob URL for the processor code
        const blob = new Blob([audioProcessorWorklet], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        
        // Load the worklet
        await context.audioWorklet.addModule(workletUrl);
        
        // Create the worklet node
        const workletNode = new AudioWorkletNode(context, 'audio-level-processor');
        
        // Connect the worklet
        source.connect(workletNode);
        workletNode.connect(context.destination);
        
        // Listen for messages from the processor
        workletNode.port.onmessage = (event) => {
            if (event.data.instant !== undefined) {
                cb(event.data.instant);
            }
        };
        
        // Clean up the blob URL
        URL.revokeObjectURL(workletUrl);
    } catch (err) {
        console.error('AudioWorklet not supported, falling back to analyser node only:', err);
    }
    
    // Create data array for visualization
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    return { context, analyser, source, dataArray };
}

// Function to get frequency data for visualization
function getAudioVisualizationData(nodes: AudioNodes): Uint8Array | null {
    if (!nodes || !nodes.analyser || !nodes.dataArray) return null;
    
    nodes.analyser.getByteFrequencyData(nodes.dataArray);
    return nodes.dataArray;
}

// Function to start visualization loop
function startVisualization(
    nodes: AudioNodes, 
    canvasContext: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    color: string = '#3B82F6'
): void {
    if (!nodes || !nodes.analyser || !nodes.dataArray) return;
    
    // Clear canvas
    canvasContext.clearRect(0, 0, width, height);
    
    // Get audio data
    nodes.analyser.getByteFrequencyData(nodes.dataArray);
    
    // Draw visualization
    const barWidth = (width / nodes.dataArray.length) * 2.5;
    let barHeight;
    let x = 0;
    
    canvasContext.fillStyle = color;
    
    for (let i = 0; i < nodes.dataArray.length; i++) {
        barHeight = nodes.dataArray[i] / 2;
        
        canvasContext.fillRect(x, height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
    }
    
    // Continue animation
    nodes.animationFrame = requestAnimationFrame(() => 
        startVisualization(nodes, canvasContext, width, height, color)
    );
}

function stopProcessingAudio(nodes: AudioNodes | null): void {
    if (!nodes) return;
    
    // Cancel any ongoing animation
    if (nodes.animationFrame) {
        cancelAnimationFrame(nodes.animationFrame);
    }
    
    // Disconnect audio nodes
    if (nodes.source) nodes.source.disconnect();
    
    // Close context if needed
    // nodes.context?.close(); // Commented as noted in original code
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
    getAudioVisualizationData,
    startVisualization,
    tearDownStream,
    setupTrack,
    setupStream,
    type AudioNodes, // Export the new type
    // REMOVE AppWithStreamConfig, AudioProcessingApp exports
};
