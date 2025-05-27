import { getStreamState, addRemoteStream, removeRemoteStream } from '../../stores/streamStore';
import { getDirectClient, getAllDirectClients } from '../../stores/connectionStore';
import type { StreamEndNegoMessage } from '../../../types/negoMessages';

/**
 * Set up track handler for a client
 */
export function setupTrackHandler(cid: string): void {
  const client = getDirectClient(cid);
  if (!client || !client.pc) return;

  client.pc.addEventListener('track', async (ev: RTCTrackEvent) => {
    console.log('got track event', ev);

    // @ts-ignore stream id is not on the type
    const streamId = normalizeStreamId(ev.streams[0].id);

    addRemoteStream(cid, streamId, ev.streams[0]);

    ev.track.onended = (ev_track_end: Event) => {
      console.log(ev_track_end);
      const target = ev_track_end.target as MediaStreamTrack;
      const state = getStreamState();
      let associatedStreamId = normalizeStreamId(target.id); // Fallback to track ID
      outer: for (const peerData of Object.values(state.remoteStreams)) {
        for (const [sId, stream] of Object.entries(peerData.streams)) {
          // @ts-ignore stream type is not correct
          if (stream.getTracks().some((t) => t.id === target.id)) {
            associatedStreamId = sId;
            break outer;
          }
        }
      }

      const allClients = getAllDirectClients();
      Object.values(allClients).forEach((c) => {
        const streamEndMessage: StreamEndNegoMessage = {
          type: 'stream.end',
          stream: associatedStreamId
        };
        window.webRTCApp.sendNegoMessage(c, streamEndMessage);
      });

      removeRemoteStream(cid, associatedStreamId);
    };

    const allClients = getAllDirectClients();
    for (let cid2 of Object.keys(allClients)) {
      if (cid == cid2) continue;
      const otherClient = allClients[cid2];
      otherClient.pc?.addTrack(ev.track, ev.streams[0]);
    }
  });

  const state = getStreamState();
  const targetClient = getDirectClient(cid);
  if (!targetClient || !targetClient.pc) return;

  Object.values(state.localStreams).forEach((localStreamData) => {
    if (localStreamData.sendable && localStreamData.stream) {
      localStreamData.stream.getTracks().forEach((track) => {
        try {
          targetClient.pc?.addTrack(track, localStreamData.stream as MediaStream);
        } catch (e) {
          console.error('Error adding track to new client:', e, track, localStreamData.stream);
        }
      });
    }
  });
}

// This function is used by setupTrackHandler and was originally in ./media/stream.ts
// It needs to be accessible here or setupTrackHandler needs to import it from its new location.
// For now, I'll include it here. If it's used elsewhere, it should be in a shared util.
export function normalizeStreamId(id: string): string {
  if (!id) return 'default'; // Or handle error appropriately
  return id.split('-')[0]; // Example normalization
}
