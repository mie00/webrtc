import { writable, get, derived } from 'svelte/store';
import { setupStream, unsendStream } from '../media/stream';

// Stream type definitions
export type StreamType = 'camera' | 'screen' | 'audio' | 'file' | 'blurred';
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
}

// Initial state
const initialState: StreamState = {
  // Enhanced structure
  localStreams: {},
  remoteStreams: {},

  // View configuration
  activeView: {
    layout: 'grid'
  }
};

// Create the store
export const streamStore = writable<StreamState>(initialState);

// Helper functions
export function getStreamState() {
  return get(streamStore);
}

// Reactive derived stores to check if streams are enabled
export const isAudioEnabled = derived(streamStore, ($state) =>
  Object.values($state.localStreams).some((stream) => stream.type === 'audio')
);

export const isCameraEnabled = derived(streamStore, ($state) =>
  Object.values($state.localStreams).some((stream) => stream.type === 'camera')
);

export const isScreenSharingEnabled = derived(streamStore, ($state) =>
  Object.values($state.localStreams).some((stream) => stream.type === 'screen')
);

export const isFileStreamEnabled = derived(streamStore, ($state) =>
  Object.values($state.localStreams).some((stream) => stream.type === 'file')
);

export const isBlurredStreamEnabled = derived(streamStore, ($state) =>
  Object.values($state.localStreams).some((stream) => stream.type === 'blurred')
);

// Helper functions for non-reactive checks (for use in non-reactive contexts)
export function getIsAudioEnabled(): boolean {
  const state = getStreamState();
  return Object.values(state.localStreams).some((stream) => stream.type === 'audio');
}

export function getIsCameraEnabled(): boolean {
  const state = getStreamState();
  return Object.values(state.localStreams).some((stream) => stream.type === 'camera');
}

export function getIsScreenSharingEnabled(): boolean {
  const state = getStreamState();
  return Object.values(state.localStreams).some((stream) => stream.type === 'screen');
}

export function getIsFileStreamEnabled(): boolean {
  const state = getStreamState();
  return Object.values(state.localStreams).some((stream) => stream.type === 'file');
}

export function getIsBlurredStreamEnabled(): boolean {
  const state = getStreamState();
  return Object.values(state.localStreams).some((stream) => stream.type === 'blurred');
}

// Enhanced stream management functions
export function addLocalStream(
  type: StreamType,
  stream: MediaStream | null,
  src: string | null,
  viewable: boolean = true,
  sendable: boolean = true
): string {
  // Generate a unique ID for the stream
  const streamId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  streamStore.update((state) => {
    const localStreams = { ...state.localStreams };
    localStreams[streamId] = { id: streamId, type, stream, src, viewable, sendable };
    return { ...state, localStreams };
  });

  return streamId;
}

export function updateLocalStreamProperties(
  id: string,
  properties: Partial<LocalStreamData>
): void {
  streamStore.update((state) => {
    if (!state.localStreams[id]) {
      console.warn(`[streamStore] updateLocalStreamProperties: Stream with id ${id} not found.`);
      return state;
    }

    const oldStreamData = state.localStreams[id];
    const newStreamData = {
      ...oldStreamData,
      ...properties
    };

    // Check if 'sendable' property has changed and there's a stream to manage
    if (
      'sendable' in properties &&
      oldStreamData.sendable !== newStreamData.sendable &&
      newStreamData.stream
    ) {
      const webRTCApp = window.webRTCApp;

      if (!webRTCApp || !webRTCApp.negotiationManager) {
        console.warn(
          '[streamStore] WebRTCApp instance or negotiationManager not found on window. Skipping track management for peers.'
        );
      } else {
        try {
          if (newStreamData.sendable) {
            if (newStreamData.type === 'audio') {
              setupStream(newStreamData.stream, 'high');
            } else if (newStreamData.type === 'screen') {
              setupStream(newStreamData.stream, 'medium', 'detail', false);
            } else {
              setupStream(newStreamData.stream, 'low', 'motion', true);
            }
          } else {
            // Stop sending to peers, but keep the local capture alive — the same
            // stream may still be consumed locally (e.g. raw camera -> blur) or
            // re-sent later. Stopping the source here breaks those consumers.
            unsendStream(newStreamData.stream);
          }
        } catch (error) {
          console.error(`[streamStore] Error managing tracks for stream ${id}:`, error);
        }
      }
    }

    const localStreams = { ...state.localStreams };
    localStreams[id] = newStreamData;
    return { ...state, localStreams };
  });
}

export function removeLocalStream(id: string): void {
  streamStore.update((state) => {
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
  streamStore.update((state) => {
    const remoteStreams = {
      ...state.remoteStreams,
      [peerId]: {
        peerId,
        streams: { ...(state.remoteStreams[peerId]?.streams || {}), [streamId]: stream }
      }
    };
    return { ...state, remoteStreams };
  });
}

export function removeRemoteStream(peerId: string, streamId: string): void {
  streamStore.update((state) => {
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
  streamStore.update((state) => ({
    ...state,
    activeView: {
      ...state.activeView,
      layout,
      focusedStream
    }
  }));
}

export function setGridSize(size: number): void {
  streamStore.update((state) => ({
    ...state,
    activeView: {
      ...state.activeView,
      gridSize: size
    }
  }));
}
