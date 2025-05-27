import { get } from 'svelte/store';
import {
  fileStore,
  addFileTransfer,
  updateFileTransfer,
  removeFileTransfer,
  type FileTransfer, // Moved here
  type FileState // Moved here
} from './stores/fileStore';
import { splitArrayBuffer } from './utils/fileUtils';
import { getMaxMessageSizeFromSdp } from './utils/fileUtils';

// Mocking Svelte store's get for testing purposes if needed, or use actual get
// Vitest automatically mocks timers when vi.useFakeTimers() is called.

describe('fileBridge utility functions', () => {
  describe('splitArrayBuffer', () => {
    it('should split an ArrayBuffer into chunks of the specified size', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(3);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
      expect(new Uint8Array(chunks[1])).toEqual(new Uint8Array([4, 5, 6]));
      expect(new Uint8Array(chunks[2])).toEqual(new Uint8Array([7, 8]));
    });

    it('should handle chunk size larger than buffer', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const chunks = splitArrayBuffer(buffer, 5);
      expect(chunks.length).toBe(1);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle empty buffer', () => {
      const buffer = new Uint8Array([]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(0);
    });

    it('should handle buffer size perfectly divisible by chunk size', () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer;
      const chunks = splitArrayBuffer(buffer, 3);
      expect(chunks.length).toBe(2);
      expect(new Uint8Array(chunks[0])).toEqual(new Uint8Array([1, 2, 3]));
      expect(new Uint8Array(chunks[1])).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('getMaxMessageSizeFromSdp', () => {
    it('should extract max message size from SDP string', () => {
      const sdp =
        'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\na=max-message-size:65536\r\n';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBe(65536);
    });

    it('should return null if a=max-message-size is not found', () => {
      const sdp = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\n';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBeNull();
    });

    it('should return null for empty SDP string', () => {
      const size = getMaxMessageSizeFromSdp('');
      expect(size).toBeNull();
    });

    it('should handle SDP with other attributes', () => {
      const sdp =
        'a=rtcp-mux\r\na=ice-ufrag:someufrag\r\na=max-message-size:16384\r\na=ice-pwd:somepwd';
      const size = getMaxMessageSizeFromSdp(sdp);
      expect(size).toBe(16384);
    });
  });
});

describe('fileStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    fileStore.set({ transfers: {} });
  });

  const sampleTransfer: FileTransfer = {
    id: 'test-id-1',
    name: 'test-file.txt',
    type: 'text/plain',
    size: 1024,
    progress: 0,
    status: 'sending',
    timestamp: Date.now(),
    isLocal: true
  };

  const sampleTransfer2: FileTransfer = {
    id: 'test-id-2',
    name: 'another-file.zip',
    type: 'application/zip',
    size: 2048,
    progress: 50,
    status: 'receiving',
    timestamp: Date.now() + 1000,
    senderCid: 'sender-cid',
    senderName: 'Sender Name'
  };

  it('should have an initial empty state', () => {
    const state = get(fileStore);
    expect(state.transfers).toEqual({});
  });

  describe('addFileTransfer', () => {
    it('should add a new file transfer to the store', () => {
      addFileTransfer(sampleTransfer);
      const state = get(fileStore);
      expect(state.transfers[sampleTransfer.id]).toEqual(sampleTransfer);
      expect(Object.keys(state.transfers).length).toBe(1);
    });

    it('should add multiple file transfers', () => {
      addFileTransfer(sampleTransfer);
      addFileTransfer(sampleTransfer2);
      const state = get(fileStore);
      expect(state.transfers[sampleTransfer.id]).toEqual(sampleTransfer);
      expect(state.transfers[sampleTransfer2.id]).toEqual(sampleTransfer2);
      expect(Object.keys(state.transfers).length).toBe(2);
    });
  });

  describe('updateFileTransfer', () => {
    it('should update an existing file transfer', () => {
      addFileTransfer(sampleTransfer);
      const updates: Partial<FileTransfer> = { progress: 50, status: 'sending' };
      updateFileTransfer(sampleTransfer.id, updates);
      const state = get(fileStore);
      expect(state.transfers[sampleTransfer.id]?.progress).toBe(50);
      expect(state.transfers[sampleTransfer.id]?.status).toBe('sending');
    });

    it('should not change state if transfer ID does not exist', () => {
      addFileTransfer(sampleTransfer);
      const initialState = get(fileStore);
      updateFileTransfer('non-existent-id', { progress: 100 });
      const state = get(fileStore);
      expect(state).toEqual(initialState);
    });

    it('should update specific fields without affecting others', () => {
      addFileTransfer(sampleTransfer2);
      const updates: Partial<FileTransfer> = {
        status: 'complete',
        progress: 100,
        url: 'blob:http://localhost/xyz'
      };
      updateFileTransfer(sampleTransfer2.id, updates);
      const state = get(fileStore);
      const updatedTransfer = state.transfers[sampleTransfer2.id];

      expect(updatedTransfer?.status).toBe('complete');
      expect(updatedTransfer?.progress).toBe(100);
      expect(updatedTransfer?.url).toBe('blob:http://localhost/xyz');
      // Ensure other fields remain unchanged
      expect(updatedTransfer?.name).toBe(sampleTransfer2.name);
      expect(updatedTransfer?.type).toBe(sampleTransfer2.type);
      expect(updatedTransfer?.size).toBe(sampleTransfer2.size);
      expect(updatedTransfer?.senderCid).toBe(sampleTransfer2.senderCid);
    });
  });

  describe('removeFileTransfer', () => {
    it('should remove an existing file transfer from the store', () => {
      addFileTransfer(sampleTransfer);
      addFileTransfer(sampleTransfer2);
      removeFileTransfer(sampleTransfer.id);
      const state = get(fileStore);
      expect(state.transfers[sampleTransfer.id]).toBeUndefined();
      expect(state.transfers[sampleTransfer2.id]).toEqual(sampleTransfer2); // Ensure other transfers remain
      expect(Object.keys(state.transfers).length).toBe(1);
    });

    it('should not change state if transfer ID does not exist for removal', () => {
      addFileTransfer(sampleTransfer);
      const initialState = get(fileStore);
      removeFileTransfer('non-existent-id');
      const state = get(fileStore);
      expect(state).toEqual(initialState);
    });
  });
});

// Note: Testing setupFileChannel, sendFile, and readFile will require significant mocking
// of WebRTC APIs (RTCPeerConnection, RTCDataChannel), Svelte stores (getDirectClient, etc.),
// and potentially browser APIs like FileReader and URL.createObjectURL.
// This initial set of tests focuses on the synchronous utility functions and store manipulations.
