import { writable, get, type Writable } from 'svelte/store';

export interface CidKeys {
  publicKey: string | null; // Peer's DEVICE public key
  userPublicKey: string | null; // Peer's USER public key
}

export interface CidKeyState {
  keysByCid: Record<string, CidKeys>;
}

const initialState: CidKeyState = {
  keysByCid: {},
};

const cidKeyStore: Writable<CidKeyState> = writable(initialState);

// --- Store Actions ---

export function setCidKeys(cid: string, devicePublicKey: string, userPublicKey: string): void {
  cidKeyStore.update(state => {
    state.keysByCid[cid] = {
      publicKey: devicePublicKey,
      userPublicKey: userPublicKey,
    };
    return state;
  });
}

export function removeCidKeys(cid: string): void {
  cidKeyStore.update(state => {
    delete state.keysByCid[cid];
    return state;
  });
}

export function resetCidKeyStore(): void {
  cidKeyStore.set(JSON.parse(JSON.stringify(initialState))); // Deep copy for reset
}

// --- Getters ---

export function getKeysByCid(cid: string): CidKeys | undefined {
  return get(cidKeyStore).keysByCid[cid];
}

export function getAllCidKeys(): Record<string, CidKeys> {
  return get(cidKeyStore).keysByCid;
}

// Optional: Export the store itself if direct subscription is needed elsewhere
export { cidKeyStore };
