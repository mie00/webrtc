import { writable, get } from 'svelte/store';

export interface FileStuff {
  fileName: string;
  fileType: string;
  fileSize: number;
  transferId: string;
  senderCid: string;
  receiverCid: string;
  chunks: (ArrayBuffer | Blob)[];
  receivedSize: number;
  blobUrl?: string;
}

export interface WebRTCClient {
  pc: RTCPeerConnection | null;
  polite?: boolean;
  trusted: boolean;
  trusting: boolean;
  nego_dc?: RTCDataChannel;
  dc?: RTCDataChannel; // For chat
  dc_file?: RTCDataChannel; // For file transfer
  forward?: RTCDataChannel; // For forwarding
  dc_transcription?: RTCDataChannel; // For transcription data
  makingOffer?: boolean;
  sentChallengeData?: string;
  _transceiver_interval?: number;
  file_stuff?: FileStuff;
  fingerprint?: string | null; // Added from updateDirectClientFingerprint, allow null
  state?: RTCPeerConnectionState; // Added from updateDirectClientState
  iceState?: RTCIceConnectionState; // Added from updateDirectClientState
}

// This type alias can be used by components that specifically need just the connection state string
export type DirectClientState = RTCPeerConnectionState;

// Participant interface now focuses on relay information
export interface Participant {
  cid: string;
  relayCid: string;
}

export interface ConnectionState {
  directClients: Record<string, WebRTCClient>;
  participants: Record<string, Participant>; // Store participants by CID, using the updated Participant interface
}

const initialConnectionState: ConnectionState = {
  directClients: {},
  participants: {}
};

export const connectionStore = writable<ConnectionState>(initialConnectionState);

export function getDirectClient(cid: string): WebRTCClient | undefined {
  return get(connectionStore).directClients[cid];
}

export function getAllDirectClients(): Record<string, WebRTCClient> {
  return get(connectionStore).directClients;
}

export function getAllClientCids(): string[] {
  return Object.keys(get(connectionStore).directClients);
}

export function addDirectClient(cid: string, client: WebRTCClient): void {
  connectionStore.update((state) => {
    // Initialize properties if not already set on the incoming client,
    // consistent with how the old DirectClientState wrapper initialized them.
    client.polite = client.polite ?? false;
    // RTCPeerConnectionState includes 'new'.
    client.state = client.pc?.connectionState ?? client.state ?? 'new';
    client.iceState = client.pc?.iceConnectionState ?? client.iceState ?? 'new';
    client.fingerprint = client.fingerprint ?? null; // Initialize to null if undefined

    state.directClients[cid] = client;
    return state;
  });
}

export function removeDirectClient(cid: string): void {
  connectionStore.update((state) => {
    delete state.directClients[cid];
    return state;
  });
}

export function updateDirectClientState(
  cid: string,
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState
): void {
  connectionStore.update((state) => {
    if (state.directClients[cid]) {
      state.directClients[cid].state = connectionState;
      state.directClients[cid].iceState = iceConnectionState;
    }
    return state;
  });
}

export function getDirectClientState(cid: string): DirectClientState | undefined {
  const client = getDirectClient(cid);
  return client?.pc?.connectionState;
}

export function updateDirectClientFingerprint(cid: string, fingerprint: string): void {
  connectionStore.update((state) => {
    if (state.directClients[cid]) {
      state.directClients[cid].fingerprint = fingerprint;
    }
    return state;
  });
}

export function addParticipant(cid: string, relayCid: string): void {
  connectionStore.update((state) => {
    // Avoid adding self or existing direct clients as relayed participants
    // Also, ensure we are not trying to add a participant with its own cid as relayCid
    if (cid !== relayCid && !state.directClients[cid]) {
      // publicKey will be retrieved from cidKeyStore when needed for display
      state.participants[cid] = { cid, relayCid };
    }
    return state;
  });
}

export function removeParticipant(cid: string): void {
  connectionStore.update((state) => {
    delete state.participants[cid];
    return state;
  });
}

export function resetConnectionStore(): void {
  // Create a deep copy to avoid modifying the original initialConnectionState object
  connectionStore.set(JSON.parse(JSON.stringify(initialConnectionState)));
}

// --- Additional Getters from the old store ---

// Getter for the entire connection state (if needed outside Svelte components)
export function getConnectionState(): ConnectionState {
  return get(connectionStore);
}

// Getter for a specific participant's state
export function getParticipant(cid: string): Participant | undefined {
  const state = get(connectionStore);
  return state.participants[cid];
}

// TODO: Move other related functions here if any were missed.
