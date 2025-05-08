import { writable, get } from 'svelte/store';


// Stream state interface
export interface localFileStreamState {
  localFileStreams: Record<string, MediaStream>;
}

// Initial state
const initialState: localFileStreamState = {
  localFileStreams: {},
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
      [src]: stream,
    },
  }));
}

export function removeLocalFileStream(src: string) {
  localFileStreamStore.update((state) => ({
    ...state,
    localFileStreams: Object.fromEntries(
      Object.entries(state.localFileStreams).filter(([key]) => key !== src)
    ),
  }));
}
