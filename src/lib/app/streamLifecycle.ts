import { getStreamState, removeLocalStream, removeRemoteStream } from '../stores/streamStore';
import { getAllDirectClients } from '../stores/connectionStore';
import { registerNegoHandler, registerCleanup } from '../stores/appStateStore';
import type { StreamEndNegoMessage } from '../../types/negoMessages';
import { normalizeStreamId } from '../webrtc/stream/trackHandler'; // Assuming normalizeStreamId is here
import { stopProcessingAudio } from '../media/stream'; // This path will need to be correct

// Module-level storage for audio processing contexts/nodes
// This was in streamBridge.ts, if it's only used by streamInit related logic, it can stay here.
// Otherwise, it needs a more central place if other modules modify it.
let audioProcessingContexts: Record<string, any | null> = {}; // Use 'any' for now for AudioNodes type

/**
 * Initialize the stream module
 */
export function streamInit(): void {
  registerNegoHandler('stream.end', (data: StreamEndNegoMessage, cid: string) => {
    const streamId = normalizeStreamId(data.stream);
    removeRemoteStream(cid, streamId);

    const clients = getAllDirectClients();
    for (let cid2 of Object.keys(clients)) {
      if (cid == cid2) continue;
      const client = clients[cid2];
      const streamEndMessage: StreamEndNegoMessage = { type: 'stream.end', stream: streamId };
      window.webRTCApp.sendNegoMessage(client, streamEndMessage);
    }
  });

  registerCleanup('stream', (cid?: string) => {
    if (!cid) {
      const state = getStreamState();
      const clients = getAllDirectClients();
      Object.entries(state.localStreams).forEach(([streamId, localStreamData]) => {
        const stream = localStreamData.stream;
        if (stream) {
          const normalizedStreamId = normalizeStreamId(stream.id);
          try {
            Object.values(clients).forEach((client) => {
              const streamEndMessage: StreamEndNegoMessage = {
                type: 'stream.end',
                stream: normalizedStreamId
              };
              window.webRTCApp.sendNegoMessage(client, streamEndMessage);
            });
          } catch (e) {
            console.error('Error sending stream.end during global cleanup:', e);
          }
          stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
        removeLocalStream(streamId);

        if (audioProcessingContexts[streamId]) {
          stopProcessingAudio(audioProcessingContexts[streamId]);
          delete audioProcessingContexts[streamId];
        }
      });
    }
  });
}

// Function to manage audioProcessingContexts if needed by other parts of stream logic
// This is a placeholder, might need to be more sophisticated or integrated with stores
export function getAudioProcessingContext(streamId: string): any | null {
  return audioProcessingContexts[streamId];
}

export function setAudioProcessingContext(streamId: string, context: any | null): void {
  audioProcessingContexts[streamId] = context;
}

export function removeAudioProcessingContext(streamId: string): void {
  delete audioProcessingContexts[streamId];
}
