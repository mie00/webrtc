import { writable, get } from 'svelte/store';

// Define connection state types directly here or import if defined elsewhere
export type RTCPeerConnectionState = globalThis.RTCPeerConnectionState; // Use built-in type
export type RTCIceConnectionState = globalThis.RTCIceConnectionState; // Use built-in type


export interface DirectClientState {
  cid: string;
  polite: boolean;
  connectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  fingerprint?: string; // Optional emoji fingerprint
}

export interface ParticipantState {
  cid: string;
  relayCid: string;
}

export interface ConnectionState {
  directClients: Record<string, DirectClientState>;
  participants: Record<string, ParticipantState>; // All participants (direct and indirect via relay)
}

const initialState: ConnectionState = {
  directClients: {},
  participants: {},
};

const connectionStore = writable<ConnectionState>(initialState);

// --- Store Actions ---

export function addDirectClient(cid: string, polite: boolean): void {
  connectionStore.update(state => {
    if (!state.directClients[cid]) {
      state.directClients[cid] = {
        cid,
        polite,
        connectionState: null, // Initial state
        iceConnectionState: null, // Initial state
      };
      // Also add self as a participant, relayed by 'self' (or maybe not needed if UI handles direct clients separately)
      // Let's keep participants strictly for *other* peers for now.
    }
    return state;
  });
}

export function updateDirectClientState(
  cid: string,
  connectionState: RTCPeerConnectionState | null,
  iceConnectionState: RTCIceConnectionState | null
): void {
  connectionStore.update(state => {
    if (state.directClients[cid]) {
      state.directClients[cid].connectionState = connectionState;
      state.directClients[cid].iceConnectionState = iceConnectionState;
    } else {
      console.warn(`Attempted to update state for non-existent direct client: ${cid}`);
    }
    return state;
  });
}

export function updateDirectClientFingerprint(cid: string, fingerprint: string): void {
  connectionStore.update(state => {
    if (state.directClients[cid]) {
      state.directClients[cid].fingerprint = fingerprint;
    } else {
      console.warn(`Attempted to update fingerprint for non-existent direct client: ${cid}`);
    }
    return state;
  });
}

export function removeDirectClient(cid: string): void {
  connectionStore.update(state => {
    delete state.directClients[cid];
    // If self was added as a participant, remove here too.
    // delete state.participants[cid];
    return state;
  });
}

export function addParticipant(cid: string, relayCid: string): void {
  connectionStore.update(state => {
    // Avoid adding self or existing direct clients as relayed participants
    if (cid !== relayCid && !state.directClients[cid]) {
       state.participants[cid] = { cid, relayCid };
    }
    return state;
  });
}

export function removeParticipant(cid: string): void {
  connectionStore.update(state => {
    delete state.participants[cid];
    return state;
  });
}

export function resetConnectionStore(): void {
  // Create a deep copy to avoid modifying the original initialState object
  connectionStore.set(JSON.parse(JSON.stringify(initialState)));
}

// Optional: Export the store itself if needed elsewhere, but prefer actions
export { connectionStore };

// Optional: Getter for non-Svelte contexts if necessary
export function getConnectionState(): ConnectionState {
    return get(connectionStore);
}
