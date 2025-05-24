import { writable, get } from 'svelte/store';

const AUTH_STORAGE_KEY = 'webrtc-auth-state';

export interface AuthState {
  publicKeyJwk: JsonWebKey | null;
  privateKeyJwk: JsonWebKey | null; // Storing JWK for easier localStorage
  jwt: string | null;
}

const initialAuthState: AuthState = {
  publicKeyJwk: null,
  privateKeyJwk: null,
  jwt: null,
};

function createAuthStore() {
  const store = writable<AuthState>(initialAuthState);
  const { subscribe, set, update } = store;

  // Load from localStorage on creation
  if (typeof localStorage !== 'undefined') {
    const storedState = localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedState) {
      try {
        const parsedState = JSON.parse(storedState);
        // Basic validation of parsed state
        if (parsedState && 
            (parsedState.publicKeyJwk === null || typeof parsedState.publicKeyJwk === 'object') &&
            (parsedState.privateKeyJwk === null || typeof parsedState.privateKeyJwk === 'object') &&
            (parsedState.jwt === null || typeof parsedState.jwt === 'string')) {
          set(parsedState);
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY); // Clear invalid state
        }
      } catch (e) {
        console.error("Failed to parse auth state from localStorage", e);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }

  // Persist to localStorage whenever the store changes
  subscribe(currentAuthState => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentAuthState));
    }
  });

  async function ensureKeyPair(): Promise<JsonWebKey | null> {
    let currentPkJwk = get(store).publicKeyJwk;
    if (!currentPkJwk) {
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          true, // extractable
          ["sign", "verify"]
        );
        const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
        const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
        
        update(state => ({ ...state, publicKeyJwk, privateKeyJwk }));
        currentPkJwk = publicKeyJwk;
      } catch (error) {
        console.error("Error generating key pair:", error);
        return null;
      }
    }
    return currentPkJwk;
  }

  function setJwtAndVerifyKey(newJwt: string, receivedPubKeyJwkString: string): boolean {
    const current = get(store);
    if (!current.publicKeyJwk) {
      console.error("Cannot set JWT, public key not found in store.");
      return false;
    }
    if (JSON.stringify(current.publicKeyJwk) !== receivedPubKeyJwkString) {
      console.error("Received public key does not match stored public key. JWT not set.");
      // Optionally clear keys if this is a critical mismatch indicating tampering
      // update(s => ({ ...s, publicKeyJwk: null, privateKeyJwk: null, jwt: null }));
      return false;
    }
    update(state => ({ ...state, jwt: newJwt }));
    return true;
  }
  
  async function getPrivateKey(): Promise<CryptoKey | null> {
    const current = get(store);
    if (!current.privateKeyJwk) {
      return null;
    }
    try {
      return await crypto.subtle.importKey(
        "jwk",
        current.privateKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        true, // extractable
        ["sign"]
      );
    } catch (error) {
      console.error("Error importing private key:", error);
      return null;
    }
  }

  function logout() {
    update(() => ({ ...initialAuthState })); // Reset to initial state
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  return {
    subscribe,
    ensureKeyPair,
    setJwtAndVerifyKey,
    getPrivateKey, // To be used by WebRTCApp logic
    getAuthState: () => get(store), // For non-Svelte contexts to get current state
    logout
  };
}

export const authStore = createAuthStore();
