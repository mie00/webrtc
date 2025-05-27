import { writable, get } from 'svelte/store';

// Forward state interface
export interface LogMessage {
  id: string;
  text: string;
  status: string; // e.g., '🌀', '✅', '❌', '⭕'
}

export interface ForwardState {
  allowedHosts: string[];
  forwardPeer: string | null;
  forwardHost: string | null;
  inflight: Record<string, (data: any) => void>;
  logMessages: LogMessage[];
}

// Initial state
export const initialState: ForwardState = {
  allowedHosts: [],
  forwardPeer: null,
  forwardHost: null,
  inflight: {},
  logMessages: []
};

// Create the store
export const forwardStore = writable<ForwardState>(initialState);

// Helper functions
export function getForwardState() {
  return get(forwardStore);
}

export function setAllowedHosts(host: string[]): void {
  forwardStore.update((state) => ({
    ...state,
    allowedHosts: host
  }));
}

export function setForwardPeer(peer: string | null): void {
  forwardStore.update((state) => ({
    ...state,
    forwardPeer: peer
  }));
}

export function setForwardHost(host: string | null): void {
  forwardStore.update((state) => ({
    ...state,
    forwardHost: host
  }));
}

export function addInflight(id: string, callback: (data: any) => void): void {
  forwardStore.update((state) => {
    const inflight = { ...state.inflight };
    inflight[id] = callback;
    return { ...state, inflight };
  });
}

export function removeInflight(id: string): void {
  forwardStore.update((state) => {
    const inflight = { ...state.inflight };
    delete inflight[id];
    return { ...state, inflight };
  });
}

export function addLogMessage(id: string, text: string): void {
  forwardStore.update((state) => ({
    ...state,
    logMessages: [...state.logMessages, { id, text, status: '🌀' }]
  }));
}

export function updateLogMessageStatus(id: string, status: string): void {
  forwardStore.update((state) => ({
    ...state,
    logMessages: state.logMessages.map((msg) => (msg.id === id ? { ...msg, status } : msg))
  }));
}

export function clearLogMessages(): void {
  forwardStore.update((state) => ({
    ...state,
    logMessages: []
  }));
}
