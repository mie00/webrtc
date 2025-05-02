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

// Stream type definitions
export type StreamType = 'camera' | 'screen' | 'audio' | 'custom';
export type LayoutType = 'grid' | 'focus' | 'presentation';

// Local stream interface
export interface LocalStreamData {
  type: StreamType;
  stream: MediaStream;
  active: boolean;
}

// Remote stream interface
export interface RemoteStreamData {
  peerId: string;
  streams: Record<string, MediaStream>;
}

// Stream state interface
export interface StreamState {
  // Legacy support
  streams: Record<string, MediaStream>;
  viewStreams: Record<string, MediaStream>;
  
  // Enhanced structure
  localStreams: Record<string, LocalStreamData>;
  remoteStreams: Record<string, RemoteStreamData>;
  
  // View configuration
  activeView: {
    layout: LayoutType;
    focusedStream?: string;
    gridSize?: number;
  };
  
  streamConfig: StreamConfig;
}

// Initial state
const initialState: StreamState = {
  // Legacy support
  streams: {},
  viewStreams: {},
  
  // Enhanced structure
  localStreams: {},
  remoteStreams: {},
  
  // View configuration
  activeView: {
    layout: 'grid'
  },
  
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

// Stream config updates
export function updateStreamConfig(config: Partial<StreamConfig>): void {
  streamStore.update(state => ({
    ...state,
    streamConfig: {
      ...state.streamConfig,
      ...config
    }
  }));
}

// Legacy support functions
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

// Enhanced stream management functions
export function addLocalStream(id: string, stream: MediaStream, type: StreamType): void {
  streamStore.update(state => {
    const localStreams = { ...state.localStreams };
    localStreams[id] = { type, stream, active: true };
    return { ...state, localStreams };
  });
}

export function toggleLocalStream(id: string, active: boolean): void {
  streamStore.update(state => {
    if (!state.localStreams[id]) return state;
    
    const localStreams = { ...state.localStreams };
    localStreams[id] = { 
      ...localStreams[id],
      active 
    };
    return { ...state, localStreams };
  });
}

export function removeLocalStream(id: string): void {
  streamStore.update(state => {
    const localStreams = { ...state.localStreams };
    delete localStreams[id];
    return { ...state, localStreams };
  });
}

export function addRemoteStream(peerId: string, streamId: string, stream: MediaStream): void {
  streamStore.update(state => {
    const remoteStreams = { ...state.remoteStreams };
    
    if (!remoteStreams[peerId]) {
      remoteStreams[peerId] = { peerId, streams: {} };
    }
    
    remoteStreams[peerId].streams[streamId] = stream;
    return { ...state, remoteStreams };
  });
}

export function removeRemoteStream(peerId: string, streamId: string): void {
  streamStore.update(state => {
    if (!state.remoteStreams[peerId]) return state;
    
    const remoteStreams = { ...state.remoteStreams };
    const peerStreams = { ...remoteStreams[peerId].streams };
    delete peerStreams[streamId];
    
    remoteStreams[peerId] = {
      ...remoteStreams[peerId],
      streams: peerStreams
    };
    
    // If no more streams for this peer, remove the peer entry
    if (Object.keys(peerStreams).length === 0) {
      delete remoteStreams[peerId];
    }
    
    return { ...state, remoteStreams };
  });
}

export function setViewLayout(layout: LayoutType, focusedStream?: string): void {
  streamStore.update(state => ({
    ...state,
    activeView: {
      ...state.activeView,
      layout,
      focusedStream
    }
  }));
}

export function setGridSize(size: number): void {
  streamStore.update(state => ({
    ...state,
    activeView: {
      ...state.activeView,
      gridSize: size
    }
  }));
}
