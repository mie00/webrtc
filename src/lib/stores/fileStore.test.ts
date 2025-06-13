import { get } from 'svelte/store';
import {
  fileStore,
  addFileTransfer,
  updateFileTransfer,
  removeFileTransfer,
  type FileTransfer
} from './fileStore';

// Vitest automatically mocks timers when vi.useFakeTimers() is called.

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
