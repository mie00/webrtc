import { writable, get } from 'svelte/store';

const AUTH_STORAGE_KEY = 'webrtc-auth-state';

// Placeholder - Please provide the actual definition from src/lib/auth.ts or confirm this structure.
export interface LoginTokenPayload {
  exp: number; // Expiration time (seconds since epoch)
  sub: string; // Subject (user identifier)
  iat: number;
  cstm_dat: string;
}

// Helper to convert Base64url string to ArrayBuffer
// JWT uses Base64url encoding
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Replace URL-safe characters and add padding if necessary
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert ArrayBuffer to Base64URL string
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Avoid String.fromCharCode.apply for large buffers due to stack limits
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  let base64 = window.btoa(binary);
  // Convert Base64 to Base64URL
  base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return base64;
}

interface JwtHeader {
  alg: string;
  typ: string;
}

export async function verifyLoginJWTFromBase64(
  newJwt: string,
  receivedPubKeyJwkString: string
): Promise<LoginTokenPayload> {
  // Import the stored public key JWK into a CryptoKey object for verification.
  // Ensure the curve matches what verifyLoginJWT expects (e.g., P-384 if JWT alg is ES384).
  // Our current key generation is P-384. This is a mismatch with verifyLoginJWT's ES384.
  const publicKeyCryptoKey = await crypto.subtle.importKey(
    'spki',
    base64UrlToArrayBuffer(receivedPubKeyJwkString),
    { name: 'ECDSA', namedCurve: 'P-384' }, // Use crv from JWK, default P-384
    true,
    ['verify']
  );
  console.log('AuthStore: Public key imported for verification.');

  // Verify the JWT using the imported public key.
  // IMPORTANT: See notes in verifyLoginJWT about algorithm (ES384 vs ES256) and key usage.
  return await verifyLoginJWT(newJwt, publicKeyCryptoKey);
}

/**
 * Verifies a JWT login token and returns its payload if valid.
 *
 * @param jwtString The JWT string.
 * @param publicKey The public key to verify the signature.
 * @returns A promise that resolves to the LoginTokenPayload if the JWT is valid.
 * @throws Error if the JWT is invalid for any reason.
 */
export async function verifyLoginJWT(
  jwtString: string,
  publicKey: CryptoKey
): Promise<LoginTokenPayload> {
  try {
    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT Verifier: Invalid JWT structure (not three parts).');
    }

    const encodedHeader = parts[0];
    const encodedPayload = parts[1];
    const encodedSignature = parts[2];

    // 1. Decode Header
    const headerString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedHeader));
    const header = JSON.parse(headerString) as JwtHeader;

    // 2. Check Algorithm - IMPORTANT: This expects ES384. Key generation uses P-384 (ES256). These MUST match.
    if (header.alg !== 'ES384' || header.typ !== 'JWT') {
      throw new Error(
        `JWT Verifier: Invalid JWT header. Expected alg ES384 and typ JWT, got alg ${header.alg} and typ ${header.typ}.`
      );
    }

    // 3. Decode Payload
    const payloadString = new TextDecoder().decode(base64UrlToArrayBuffer(encodedPayload));
    const payload = JSON.parse(payloadString) as LoginTokenPayload;

    // 4. Verify Expiry (exp)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      throw new Error(
        `JWT Verifier: Token expired. Expiry: ${new Date(payload.exp * 1000)}, Current: ${new Date(nowSeconds * 1000)}`
      );
    }

    // 5. Verify Signature
    const signatureData = base64UrlToArrayBuffer(encodedSignature);
    const dataToVerifyString = `${encodedHeader}.${encodedPayload}`;
    const dataToVerifyBuffer = new TextEncoder().encode(dataToVerifyString);

    const isValidSignature = await window.crypto.subtle.verify(
      {
        name: 'ECDSA',
        // IMPORTANT: Hash must match the 'alg' in the JWT header (SHA-384 for ES384).
        // Key generation uses P-384 (implies SHA-256). These MUST match.
        hash: { name: 'SHA-384' }
      },
      publicKey, // This public key MUST correspond to the private key that signed the JWT.
      signatureData,
      dataToVerifyBuffer
    );

    if (!isValidSignature) {
      throw new Error('JWT Verifier: Signature verification failed.');
    }

    console.log('JWT Verifier: Token successfully verified.', payload);
    return payload;
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('JWT Verifier: Error during JWT verification:', errorMessage);
    throw new Error(`JWT Verifier: Verification failed. ${errorMessage}`);
  }
}

// Helper function to decode JWT payload without full verification, primarily for 'exp' claim.
export function getJwtPayload(token: string): LoginTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT structure for payload decoding.');
      return null;
    }
    // Uses base64UrlToArrayBuffer which is already defined in this file.
    const payloadString = new TextDecoder().decode(base64UrlToArrayBuffer(parts[1]));
    return JSON.parse(payloadString) as LoginTokenPayload;
  } catch (error) {
    console.error('Error decoding JWT payload:', error);
    return null;
  }
}

export interface AuthState {
  publicKeyJwk: JsonWebKey | null; // Device's public key
  privateKeyJwk: JsonWebKey | null; // Device's private key
  userPubKey: string | null; // User's public key from auth server (base64 URL encoded SPKI)
  jwt: string | null;
}

const initialAuthState: AuthState = {
  publicKeyJwk: null,
  privateKeyJwk: null,
  userPubKey: null,
  jwt: null
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
        if (
          parsedState &&
          (parsedState.publicKeyJwk === null || typeof parsedState.publicKeyJwk === 'object') &&
          (parsedState.privateKeyJwk === null || typeof parsedState.privateKeyJwk === 'object') &&
          (parsedState.userPubKey === null || typeof parsedState.userPubKey === 'string') && // Changed userPubKeyJwk to userPubKey, expecting string
          (parsedState.jwt === null || typeof parsedState.jwt === 'string')
        ) {
          set(parsedState);
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY); // Clear invalid state
        }
      } catch (e) {
        console.error('Failed to parse auth state from localStorage', e);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  }

  // Persist to localStorage whenever the store changes
  subscribe((currentAuthState) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentAuthState));
    }
  });

  async function ensureKeyPair(): Promise<JsonWebKey | null> {
    let currentPkJwk = get(store).publicKeyJwk;
    if (!currentPkJwk) {
      try {
        const keyPair = await crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-384' },
          true, // extractable
          ['sign', 'verify']
        );
        const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
        const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

        update((state) => ({ ...state, publicKeyJwk, privateKeyJwk }));
        currentPkJwk = publicKeyJwk;
      } catch (error) {
        console.error('Error generating key pair:', error);
        return null;
      }
    }
    return currentPkJwk;
  }

  async function setJwtAndVerifyKey(
    newJwt: string,
    userPubKeyJwkStringFromCallback: string
  ): Promise<boolean> {
    const current = get(store);
    // publicKeyJwk is the device's key, not strictly needed for this step but good to have generated.
    if (!current.publicKeyJwk) {
      console.warn(
        'AuthStore: Device public key JWK not found in store, ensureKeyPair might not have run or completed.'
      );
      // We can proceed to store JWT and userPubKeyJwk even if device key isn't ready,
      // but it's unusual. ensureKeyPair should typically be called before login attempt.
    }

    // userPubKeyJwkStringFromCallback is the base64 URL encoded SPKI string.
    // We will store it directly.

    try {
      // Verify the JWT using the original base64 URL encoded SPKI string.
      // verifyLoginJWTFromBase64 handles the import of this key for verification.
      const payload = await verifyLoginJWTFromBase64(newJwt, userPubKeyJwkStringFromCallback);

      // If verification is successful, store the JWT and the user's public key (as SPKI string).
      update((state) => ({ ...state, jwt: newJwt, userPubKey: userPubKeyJwkStringFromCallback }));
      console.log(
        'AuthStore: JWT successfully verified. JWT and user public key (SPKI string) stored.'
      );
      return true;
    } catch (error) {
      console.error('AuthStore: JWT verification failed or error during processing.', error);
      return false;
    }
  }

  async function getPrivateKey(): Promise<CryptoKey | null> {
    const current = get(store);
    if (!current.privateKeyJwk) {
      return null;
    }
    try {
      return await crypto.subtle.importKey(
        'jwk',
        current.privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-384' },
        true, // extractable
        ['sign']
      );
    } catch (error) {
      console.error('Error importing private key:', error);
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
    logout,
    async getDevicePublicKeyAsSpki(): Promise<string | null> {
      const current = get(store);
      if (!current.publicKeyJwk) {
        console.warn('AuthStore: Device public key JWK not found to export as SPKI.');
        // Attempt to generate it if missing, though ensureKeyPair should ideally be called first.
        if (!(await ensureKeyPair())) {
          console.error('AuthStore: Failed to ensure key pair for SPKI export.');
          return null;
        }
        // Re-fetch after generation
        const updatedState = get(store);
        if (!updatedState.publicKeyJwk) {
          console.error(
            'AuthStore: Still no public key JWK after attempting generation for SPKI export.'
          );
          return null;
        }
        // Use the newly generated key
        const importedKeyForSpki = await crypto.subtle.importKey(
          'jwk',
          updatedState.publicKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-384' }, // Ensure this matches key generation
          true,
          [] // No specific usage needed for export
        );
        const spkiBuffer = await crypto.subtle.exportKey('spki', importedKeyForSpki);
        return arrayBufferToBase64Url(spkiBuffer);
      }
      try {
        const importedKey = await crypto.subtle.importKey(
          'jwk',
          current.publicKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-384' }, // Ensure this matches key generation
          true, // Needs to be true if the key was generated as extractable
          [] // No specific key usages needed for exportKey
        );
        const spkiBuffer = await crypto.subtle.exportKey('spki', importedKey);
        return arrayBufferToBase64Url(spkiBuffer);
      } catch (error) {
        console.error('Error exporting device public key as SPKI:', error);
        return null;
      }
    }
  };
}

export const authStore = createAuthStore();
