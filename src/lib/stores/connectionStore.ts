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
  fingerprint?: string; // Added from updateDirectClientFingerprint
  state?: RTCPeerConnectionState; // Added from updateDirectClientState
  iceState?: RTCIceConnectionState; // Added from updateDirectClientState
}

export type DirectClientState = RTCPeerConnectionState; // As used in WebRTCApp

export interface Participant {
  cid: string;
  publicKey: string;
  // Add other participant details if needed
  relayCid?: string;
}

export interface ConnectionState {
  directClients: Record<string, WebRTCClient>;
  participants: Record<string, Participant>; // Store participants by CID
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

export function addParticipant(cid: string, publicKey: string): void {
  connectionStore.update((state) => {
    state.participants[cid] = { cid, publicKey };
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
  connectionStore.set(initialConnectionState);
}

// TODO: Move other related functions here if any were missed.
