// Import types from global.d.ts

import { getAllDirectClients } from '../stores/connectionStore';
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
  fftSize: number;
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

// Setup audio processing with analyzer
function processAudio(
  stream: MediaStream,
  cb: (dataArray: Uint8Array, analyser: AnalyserNode) => void,
  fftSize: number = 256
): AudioNodes | null {
  const context = new window.AudioContext();
  const analyser = context.createAnalyser();

  // Set FFT size - must be a power of 2
  analyser.fftSize = fftSize;

  const source = context.createMediaStreamSource(stream);
  source.connect(analyser);

  // Create data array for visualization
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // Set up animation frame to continuously get audio data
  let animationFrame: number;

  const updateAnalysis = () => {
    // Get current frequency data
    analyser.getByteFrequencyData(dataArray);

    // Call the callback with the data and analyzer
    cb(dataArray, analyser);

    // Continue the loop
    animationFrame = requestAnimationFrame(updateAnalysis);
  };

  // Start the analysis loop
  animationFrame = requestAnimationFrame(updateAnalysis);

  return {
    context,
    analyser,
    source,
    dataArray,
    animationFrame,
    fftSize
  };
}

// Function to draw visualization on canvas
function drawVisualization(
  dataArray: Uint8Array,
  canvasContext: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string = '#3B82F6'
): void {
  // Clear canvas
  canvasContext.clearRect(0, 0, width, height);

  // Draw visualization
  const barWidth = (width / dataArray.length) * 2.5;
  let barHeight;
  let x = 0;

  canvasContext.fillStyle = color;

  for (let i = 0; i < dataArray.length; i++) {
    barHeight = dataArray[i] / 2;

    canvasContext.fillRect(x, height - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }
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
    track.dispatchEvent(new Event('ended'));
    for (var client of Object.values(clients) as WebRTCClient[]) {
      // Use clients variable
      client.pc?.getTransceivers().forEach((transceiver: RTCRtpTransceiver) => {
        if (transceiver.sender.track?.id === track.id) {
          transceiver.stop();
        }
      });
      // Assuming sendNego is available on window.webRTCApp
      window.webRTCApp.sendNegoMessage(client, {
        type: 'stream.end',
        stream: normalizeStreamId(stream.id)
      });
    }
  });
};

const setupTrack = (
  track: MediaStreamTrack,
  stream: MediaStream,
  priority: RTCPriorityType,
  contentHint?: string,
  simulcast?: boolean
): void => {
  const clients = getAllDirectClients(); // Get clients via webRTCApp
  if (contentHint && 'contentHint' in track) {
    track.contentHint = contentHint;
  }
  for (var client of Object.values(clients) as WebRTCClient[]) {
    // Use clients variable
    client.pc?.addTransceiver(track, {
      streams: [stream],
      sendEncodings: [
        { priority: priority, rid: 'o' },
        ...(simulcast
          ? [
              { priority: priority, rid: 'h', maxBitrate: 1200 * 1024 },
              { priority: priority, rid: 'm', maxBitrate: 600 * 1024, scaleResolutionDownBy: 2 },
              { priority: priority, rid: 'l', maxBitrate: 300 * 1024, scaleResolutionDownBy: 4 }
            ]
          : [])
      ],
      direction: 'sendrecv'
    });
  }
};

const setupStream = (
  stream: MediaStream,
  priority: RTCPriorityType,
  contentHint?: string,
  simulcast?: boolean
): void => {
  stream.getTracks().forEach((track) => {
    setupTrack(track, stream, priority, contentHint, simulcast);
  });
  stream.onaddtrack = (ev: MediaStreamTrackEvent) => {
    setupTrack(ev.track, stream, 'medium', undefined, false);
  };
};

// setupStream remains the same as it calls setupTrack

// Export functions for use in other modules
export {
  normalizeStreamId,
  processAudio,
  stopProcessingAudio,
  drawVisualization,
  tearDownStream,
  setupStream,
  type AudioNodes // Export the new type
};
