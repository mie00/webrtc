import { writable, get } from 'svelte/store';

// Stream state interface
export interface localFileStreamState {
  localFileStreams: Record<string, MediaStream>;
}

// Initial state
const initialState: localFileStreamState = {
  localFileStreams: {}
};

// Create the store
export const localFileStreamStore = writable<localFileStreamState>(initialState);

// Helper functions
export function getLocalFileStreamState() {
  return get(localFileStreamStore);
}

export function addLocalFileStream(src: string, stream: MediaStream) {
  localFileStreamStore.update((state) => ({
    ...state,
    localFileStreams: {
      ...state.localFileStreams,
      [src]: stream
    }
  }));
}

export function removeLocalFileStream(src: string) {
  localFileStreamStore.update((state) => ({
    ...state,
    localFileStreams: Object.fromEntries(
      Object.entries(state.localFileStreams).filter(([key]) => key !== src)
    )
  }));
}

export interface StreamMetadata {
  width?: number;
  height?: number;
}

// Stream state interface
export interface streamMetadataState {
  metadata: Record<string, StreamMetadata>;
}

// Initial state
const initialMetadataState: streamMetadataState = {
  metadata: {}
};

// Create the store
export const streamMetadataStore = writable<streamMetadataState>(initialMetadataState);

// Helper functions
export function getStreamMetadata(src: string) {
  return get(streamMetadataStore).metadata[src] || {};
}

export function setStreamMetadata(src: string, metadata: StreamMetadata) {
  streamMetadataStore.update((state) => ({
    ...state,
    metadata: {
      ...state.metadata,
      [src]: metadata
    }
  }));
}
