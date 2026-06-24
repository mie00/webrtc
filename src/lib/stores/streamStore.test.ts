import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addLocalStream, updateLocalStreamProperties } from './streamStore';
import { addDirectClient, resetConnectionStore } from './connectionStore';

// Minimal fakes — jsdom has no MediaStream/RTCPeerConnection.
function makeFakeTrack(id: string) {
  return { id, kind: 'video', contentHint: '', stop: vi.fn(), dispatchEvent: vi.fn() };
}
function makeFakeStream(id: string, tracks: ReturnType<typeof makeFakeTrack>[]) {
  return { id, getTracks: () => tracks, onaddtrack: null } as unknown as MediaStream;
}

describe('updateLocalStreamProperties — sendable toggle', () => {
  let sendNegoMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendNegoMessage = vi.fn();
    // A truthy negotiationManager makes updateLocalStreamProperties manage peer tracks
    // (the path that is skipped in most other tests, hiding this bug).
    (window as unknown as { webRTCApp: unknown }).webRTCApp = {
      negotiationManager: {},
      sendNegoMessage
    };
  });

  afterEach(() => {
    resetConnectionStore();
    delete (window as unknown as { webRTCApp?: unknown }).webRTCApp;
    vi.restoreAllMocks();
  });

  it('removes the track from peers but does NOT stop the local source when a stream becomes unsendable', () => {
    const track = makeFakeTrack('t-cam');
    const stream = makeFakeStream('cam-1', [track]);
    const transceiver = { sender: { track }, stop: vi.fn() };
    const pc = { getTransceivers: () => [transceiver], addTransceiver: vi.fn() };
    addDirectClient('peer-1', { pc } as never);

    const id = addLocalStream('camera', stream, null, true, true);
    updateLocalStreamProperties(id, { sendable: false });

    // The local capture must stay alive: the blur pipeline (and re-enabling) reads
    // from these exact tracks afterwards. Stopping them here breaks background blur.
    expect(track.stop).not.toHaveBeenCalled();

    // ...but the track must still be torn down on the peer connection and peers notified.
    expect(transceiver.stop).toHaveBeenCalledTimes(1);
    expect(sendNegoMessage).toHaveBeenCalledWith(
      expect.objectContaining({ pc }),
      expect.objectContaining({ type: 'stream.end' })
    );
  });
});
