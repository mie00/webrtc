import { writable, get } from 'svelte/store';

// Stream configuration interface
export interface StreamConfig {
  audio: boolean;
  video: boolean;
  screen: boolean;
  local: boolean;
  videoStream?: MediaStream;
  videoNode?: HTMLVideoElement;
}

// Stream state interface
export interface StreamState {
  streams: Record<string, MediaStream>;
  viewStreams: Record<string, MediaStream>;
  streamConfig: StreamConfig;
}

// Initial state
const initialState: StreamState = {
  streams: {},
  viewStreams: {},
  streamConfig: {
    audio: false,
    video: false,
    screen: false,
    local: false
  }
};

// Create the store
export const streamStore = writable<StreamState>(initialState);

// Helper functions
export function getStreamState() {
  return get(streamStore);
}

export function updateStreamConfig(config: Partial<StreamConfig>): void {
  streamStore.update(state => ({
    ...state,
    streamConfig: {
      ...state.streamConfig,
      ...config
    }
  }));
}

export function addStream(key: string, stream: MediaStream): void {
  streamStore.update(state => {
    const streams = { ...state.streams };
    streams[key] = stream;
    return { ...state, streams };
  });
}

export function addViewStream(key: string, stream: MediaStream): void {
  streamStore.update(state => {
    const viewStreams = { ...state.viewStreams };
    viewStreams[key] = stream;
    return { ...state, viewStreams };
  });
}

export function removeStream(key: string): void {
  streamStore.update(state => {
    const streams = { ...state.streams };
    delete streams[key];
    return { ...state, streams };
  });
}

export function removeViewStream(key: string): void {
  streamStore.update(state => {
    const viewStreams = { ...state.viewStreams };
    delete viewStreams[key];
    return { ...state, viewStreams };
  });
}
