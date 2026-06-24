import { describe, it, expect, beforeEach, vi } from 'vitest';

// Avoid pulling in @mediapipe and real WebRTC track plumbing.
vi.mock('./background', () => ({ backgroundChange: vi.fn() }));
vi.mock('./stream', () => ({
  setupStream: vi.fn(),
  tearDownStream: vi.fn(async () => {}),
  unsendStream: vi.fn(),
  processAudio: vi.fn(),
  stopProcessingAudio: vi.fn()
}));

import { disableFileStream } from './localStreamManager';
import { tearDownStream } from './stream';
import { addLocalStream, getLocalStreamsByType } from '../stores/streamStore';
import { addLocalFileStream, getLocalFileStreamState } from '../stores/localFileStreamStore';

describe('disableFileStream', () => {
  beforeEach(() => {
    (globalThis.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.clearAllMocks();
  });

  it('tears down the captured stream and clears it from the file-stream store', async () => {
    const src = 'blob:test-1';
    const captured = { id: 'file-1', getTracks: () => [] } as unknown as MediaStream;
    // enableFileStream creates the marker entry with stream=null; the captured
    // stream lives only in the file-stream store, keyed by src.
    addLocalStream('file', null, src, true, false);
    addLocalFileStream(src, captured);

    await disableFileStream();

    // The captured stream must be torn down...
    expect(tearDownStream).toHaveBeenCalledWith(captured);
    // ...the streamStore marker entry removed...
    expect(Object.keys(getLocalStreamsByType('file'))).toHaveLength(0);
    // ...and the captured stream cleared from the file-stream store so a caller
    // doesn't have to remove it manually (the source of the cleanup-ordering bug).
    expect(getLocalFileStreamState().localFileStreams[src]).toBeUndefined();
  });
});
