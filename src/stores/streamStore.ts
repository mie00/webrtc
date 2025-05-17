import { writable, get } from 'svelte/store';

// Stream configuration interface
export interface StreamConfig {
  audio: string | null; // Contains device ID when enabled, null when disabled
  camera: string | null; // Contains device ID when enabled, null when disabled
  screen: boolean;
  file: string | null; // Contains video source URL when enabled, null when disabled
  videoStream: MediaStream | null; // Still needed for file playback
}

// Stream type definitions
export type StreamType = 'camera' | 'screen' | 'audio' | 'file';
export type LayoutType = 'grid' | 'focus' | 'presentation';

// Local stream interface
export interface LocalStreamData {
  id: string; // Unique identifier for the stream
  type: StreamType;
  stream: MediaStream | null;
  src: string | null;
  viewable: boolean;
  sendable: boolean;
}

// Remote stream interface
export interface RemoteStreamData {
  peerId: string;
  streams: Record<string, MediaStream>;
}

// Stream state interface
export interface StreamState {
  // Enhanced structure
  localStreams: Record<string, LocalStreamData>; // Key is now a unique ID, not just the type
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
  // Enhanced structure
  localStreams: {},
  remoteStreams: {},
  
  // View configuration
  activeView: {
    layout: 'grid'
  },
  
  streamConfig: {
    audio: null,
    camera: null,
    screen: false,
    file: null,
    videoStream: null,
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

// Enhanced stream management functions
export function addLocalStream(type: StreamType, stream: MediaStream | null, src: string | null, viewable: boolean = true, sendable: boolean = true): string {
  // Generate a unique ID for the stream
  const streamId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  streamStore.update(state => {
    const localStreams = { ...state.localStreams };
    localStreams[streamId] = { id: streamId, type, stream, src, viewable, sendable };
    return { ...state, localStreams };
  });
  
  return streamId;
}

export function updateLocalStreamProperties(id: string, properties: Partial<LocalStreamData>): void {
  streamStore.update(state => {
    if (!state.localStreams[id]) return state;
    
    const localStreams = { ...state.localStreams };
    localStreams[id] = { 
      ...localStreams[id],
      ...properties
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

// Helper to get all local streams of a specific type
export function getLocalStreamsByType(type: StreamType): Record<string, LocalStreamData> {
  const state = getStreamState();
  return Object.fromEntries(
    Object.entries(state.localStreams).filter(([_, data]) => data.type === type)
  );
}

// Helper to get the first local stream of a specific type
export function getFirstLocalStreamByType(type: StreamType): [string, LocalStreamData] | null {
  const streams = getLocalStreamsByType(type);
  const entries = Object.entries(streams);
  return entries.length > 0 ? entries[0] : null;
}

export function addRemoteStream(peerId: string, streamId: string, stream: MediaStream): void {
  streamStore.update(state => {
    const remoteStreams = { ...state.remoteStreams, [peerId]: { peerId, streams: {...(state.remoteStreams[peerId]?.streams || {}), [streamId]: stream} } };
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
