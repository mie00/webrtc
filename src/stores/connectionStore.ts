import { writable, get } from 'svelte/store';
/// <reference path="../../../types/global.d.ts" />

// Define connection state types directly here or import if defined elsewhere
export type RTCPeerConnectionState = globalThis.RTCPeerConnectionState; // Use built-in type
export type RTCIceConnectionState = globalThis.RTCIceConnectionState; // Use built-in type


export interface DirectClientState {
  cid: string;
  polite: boolean;
  client: WebRTCClient; // Store the actual client object
  connectionState: RTCPeerConnectionState | null; // Use client's state
  iceConnectionState: RTCIceConnectionState | null; // Use client's state
  fingerprint: string | null; // Added for fingerprint display
  publicKey: string | null; // Stores the peer's DEVICE public key
  userPublicKey: string | null; // Stores the peer's USER public key
}

export interface ParticipantState {
  cid: string;
  relayCid: string;
  userPublicKey: string | null; // Stores the participant's USER public key
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

// Add or update a direct client
export function addDirectClient(cid: string, client: WebRTCClient): void {
  connectionStore.update(state => {
    const directClients = { ...state.directClients };
    directClients[cid] = {
      cid,
      client, // Store the client object
      polite: client.polite ?? false, // Get polite from client object
      connectionState: client.pc?.connectionState ?? 'new',
      iceConnectionState: client.pc?.iceConnectionState ?? 'new',
      fingerprint: null, // Initialize fingerprint
      publicKey: null, // Initialize device publicKey
      userPublicKey: null, // Initialize userPublicKey
    };
    return { ...state, directClients };
  });
}

export function updateDirectClientPublicKey(cid: string, publicKey: string): void { // For DEVICE public key
  connectionStore.update(state => {
    if (state.directClients[cid]) {
      state.directClients[cid].publicKey = publicKey;
    } else {
      console.warn(`Attempted to update publicKey for non-existent direct client: ${cid}`);
    }
    return state;
  });
}

export function updateDirectClientUserPublicKey(cid: string, userPublicKey: string): void { // For USER public key
  connectionStore.update(state => {
    if (state.directClients[cid]) {
      state.directClients[cid].userPublicKey = userPublicKey;
    } else {
      console.warn(`Attempted to update userPublicKey for non-existent direct client: ${cid}`);
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

export function addParticipant(cid: string, relayCid: string, userPublicKey: string | null): void {
  connectionStore.update(state => {
    // Avoid adding self or existing direct clients as relayed participants
    if (cid !== relayCid && !state.directClients[cid]) {
       state.participants[cid] = { cid, relayCid, userPublicKey };
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

// --- Getters ---

export function getDirectClientState(cid: string): DirectClientState | undefined {
  const state = get(connectionStore);
  return state.directClients[cid];
}

export function getDirectClient(cid: string): WebRTCClient | undefined {
  const state = get(connectionStore);
  return state.directClients[cid]?.client;
}

export function getAllDirectClients(): Record<string, WebRTCClient> {
  const state = get(connectionStore);
  const clients: Record<string, WebRTCClient> = {};
  for (const cid in state.directClients) {
    clients[cid] = state.directClients[cid].client;
  }
  return clients;
}

export function getAllClientCids(): string[] {
  const state = get(connectionStore);
  return Object.keys(state.directClients);
}
