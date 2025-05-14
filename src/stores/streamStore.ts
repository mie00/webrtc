import { writable, get } from 'svelte/store';

// Stream configuration interface
export interface StreamConfig {
  audio: boolean;
  camera: boolean;
  screen: boolean;
  file: boolean;
  videoStream: MediaStream | null;
  videoSrc: string | null;
}

// Stream type definitions
export type StreamType = 'camera' | 'screen' | 'audio' | 'file' | 'custom';
export type LayoutType = 'grid' | 'focus' | 'presentation';

// Local stream interface
export interface LocalStreamData {
  type: StreamType;
  stream: MediaStream | null;
  src: string | null;
  active: boolean;
}

// Remote stream interface
export interface RemoteStreamData {
  peerId: string;
  streams: Record<string, MediaStream>;
}

// Stream state interface
export interface StreamState {
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
    camera: false,
    screen: false,
    file: false,
    videoStream: null,
    videoSrc: null,
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

export function addViewStream(key: string, stream: MediaStream): void {
  streamStore.update(state => {
    const viewStreams = { ...state.viewStreams };
    viewStreams[key] = stream;
    return { ...state, viewStreams };
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
export function addLocalStream(type: StreamType, stream: MediaStream | null, src: string | null): void {
  streamStore.update(state => {
    const localStreams = { ...state.localStreams };
    localStreams[type] = { type, stream, active: true, src: src  };
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
