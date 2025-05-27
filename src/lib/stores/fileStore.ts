import { writable, get } from 'svelte/store';

// File transfer state interface
export interface FileTransfer {
  id: string;
  name: string;
  type: string;
  size: number;
  progress: number;
  status: 'sending' | 'receiving' | 'complete' | 'error';
  timestamp: number; // Added for sorting
  senderCid?: string; // Added: CID of the sender (for received files)
  senderName?: string; // Added: Display name of the sender (for received files)
  url?: string;
  error?: string;
  isLocal?: boolean; // Added for distinguishing sender/receiver in UI, true if originated by local client
}

export interface FileState {
  transfers: Record<string, FileTransfer>;
}

// Initial state
const initialState: FileState = {
  transfers: {}
};

// Create the store
export const fileStore = writable<FileState>(initialState);

// Helper functions
export function getFileState() {
  return get(fileStore);
}

export function addFileTransfer(transfer: FileTransfer): void {
  fileStore.update((state) => {
    const transfers = { ...state.transfers };
    transfers[transfer.id] = transfer;
    return { ...state, transfers };
  });
}

export function updateFileTransfer(id: string, updates: Partial<FileTransfer>): void {
  fileStore.update((state) => {
    if (!state.transfers[id]) return state;

    const transfers = { ...state.transfers };
    transfers[id] = {
      ...transfers[id],
      ...updates
    };
    return { ...state, transfers };
  });
}

export function removeFileTransfer(id: string): void {
  fileStore.update((state) => {
    const transfers = { ...state.transfers };
    delete transfers[id];
    return { ...state, transfers };
  });
}
