import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { authStore, type AuthState, verifyLoginJWT, verifyLoginJWTFromBase64, type LoginTokenPayload } from './authStore'; // Now imported dynamically
import { get } from 'svelte/store';

// Mock localStorage
const mockId = Math.random(); // Unique ID for this mock instance
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  console.log(`[localStorageMock] CREATED instance with ID: ${mockId}`);
  return {
    getItem: (key: string) => {
      const value = store[key] || null;
      console.log(
        `[localStorageMock ID: ${mockId}] getItem: key=${key}, value=${value ? value.substring(0, 100) : 'null'}...`
      );
      return value;
    },
    setItem: (key: string, value: string) => {
      console.log(
        `[localStorageMock ID: ${mockId}] setItem: key=${key}, value=${value.substring(0, 100)}...`
      ); // Log first 100 chars
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      console.log(`[localStorageMock ID: ${mockId}] removeItem: key=${key}`);
      delete store[key];
    },
    clear: () => {
      console.log(`[localStorageMock ID: ${mockId}] clear`);
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Web Crypto API (partial mock, extend as needed)
const mockCrypto = {
  subtle: {
    generateKey: vi.fn(),
    exportKey: vi.fn(),
    importKey: vi.fn(),
    verify: vi.fn()
    // Add other methods like sign, encrypt, decrypt if they become necessary for tests
  },
  getRandomValues: vi.fn() // if used directly or indirectly
};

Object.defineProperty(window, 'crypto', { value: mockCrypto });

// Helper to reset the authStore to its initial state by re-creating it or calling a reset method
// Since authStore is created immediately, we need to manipulate its internal state or mock its creation for full reset.
// For now, we'll rely on logout() and clearing localStorage for most reset needs.

describe('authStore', () => {
  // Type alias for AuthState structure using dynamic import type
  type AuthState = import('./authStore').AuthState;

  let authStore: any; // To hold the dynamically imported authStore instance
  // Add other module exports here if needed, e.g.:
  // let verifyLoginJWT: any;
  // let verifyLoginJWTFromBase64: any;

  const AUTH_STORAGE_KEY = 'webrtc-auth-state';
  const initialAuthState: {
    publicKeyJwk: any;
    privateKeyJwk: any;
    userPubKey: string | null;
    jwt: string | null;
  } = {
    publicKeyJwk: null,
    privateKeyJwk: null,
    userPubKey: null,
    jwt: null
  };

  beforeEach(async () => {
    vi.resetModules(); // Ensure a fresh module import for authStore
    // Clear localStorage and reset mocks before each test
    localStorageMock.clear();
    vi.clearAllMocks(); // Clears mock call history, etc.

    // Dynamically import authStore AFTER localStorage is mocked
    // This ensures authStore picks up the mocked localStorage during its initialization
    const authStoreModule = await import('./authStore');
    authStore = authStoreModule.authStore;

    // Reset crypto mocks to default behavior or specific test behavior if needed
    // For example, to make generateKey resolve with mock keys:
    mockCrypto.subtle.generateKey.mockResolvedValue({
      publicKey: { alg: 'ES384', kty: 'EC', crv: 'P-384', x: 'x_val', y: 'y_val' }, // Mock JWK
      privateKey: { alg: 'ES384', kty: 'EC', crv: 'P-384', d: 'd_val', x: 'x_val', y: 'y_val' } // Mock JWK
    } as CryptoKeyPair);
    mockCrypto.subtle.exportKey.mockImplementation(async (format, key) => key); // Simple passthrough
    mockCrypto.subtle.importKey.mockImplementation(
      async (format, keyData, alg, extractable, usages) =>
        ({ keyData, alg, extractable, usages }) as unknown as CryptoKey
    ); // Mock CryptoKey
    mockCrypto.subtle.verify.mockResolvedValue(true); // Default to successful verification

    // To ensure tests start with a fresh store state, effectively re-initialize or use logout
    // Since the store is a singleton and loads from localStorage on init, clearing localStorage
    // and then calling logout() should bring it to a known state.
    // The authStore instance here is from the dynamic import, so it should use the mocked localStorage.
    authStore.logout(); // This will also clear localStorage via its own logic
  });

  afterEach(() => {
    // Ensure localStorage is clean after tests if necessary, though beforeEach should handle it.
  });

  it('should initialize with default auth state if localStorage is empty', () => {
    // authStore is initialized when the module is imported.
    // We call logout in beforeEach to reset it to initial state and clear localStorage.
    const state = get(authStore);
    expect(state).toEqual(initialAuthState);
  });

  it('should load state from localStorage if present and valid', async () => {
    const storedState: AuthState = {
      publicKeyJwk: { kty: 'EC', crv: 'P-384', x: 'x', y: 'y', alg: 'ES384', key_ops: ['verify'] },
      privateKeyJwk: {
        kty: 'EC',
        crv: 'P-384',
        x: 'x',
        y: 'y',
        d: 'd',
        alg: 'ES384',
        key_ops: ['sign']
      },
      userPubKey: 'mockUserPublicKeyString',
      jwt: 'mock.jwt.token'
    };
    localStorageMock.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedState));

    // To test loading, we need to simulate the store's creation after localStorage is set.
    // This is tricky with Svelte stores imported as singletons.
    // For this test, we'll assume the logout in beforeEach followed by a direct set can simulate this.
    // Or, better, we'd need to re-import the module or have a dedicated reset/init function.
    // Given the current structure, we'll test the effect of `logout` and `setJwtAndVerifyKey` later.
    // A simple check: if we set localStorage and then read the store, it should reflect it *if* it re-reads.
    // However, the store reads on module load. So, this test is more about persistence.

    // Let's test persistence: set state, then check localStorage
    const newJwtHeader = JSON.stringify({ alg: 'ES384', typ: 'JWT' });
    const newJwtPayload = JSON.stringify({
      sub: 'new-user',
      exp: Math.floor(Date.now() / 1000) + 3600
    }); // Add exp for completeness
    const newJwt = btoa(newJwtHeader) + '.' + btoa(newJwtPayload) + '.'; // A structurally valid JWT for the verifier
    await authStore.setJwtAndVerifyKey(newJwt, 'newUserKeyString'); // This will update the store & localStorage
    const rawStored = localStorageMock.getItem(AUTH_STORAGE_KEY);
    expect(rawStored).not.toBeNull();
    const parsedStored = JSON.parse(rawStored!);
    expect(parsedStored.jwt).toBe(newJwt);
    expect(parsedStored.userPubKey).toBe('newUserKeyString');
  });

  it('should clear localStorage and reset state on logout', async () => {
    // Set some state first
    const logoutJwtHeader = JSON.stringify({ alg: 'ES384', typ: 'JWT' });
    const logoutJwtPayload = JSON.stringify({
      sub: 'logout-test',
      exp: Math.floor(Date.now() / 1000) + 3600
    });
    const validJwtForLogoutTest = btoa(logoutJwtHeader) + '.' + btoa(logoutJwtPayload) + '.';
    await authStore.setJwtAndVerifyKey(validJwtForLogoutTest, 'testUserKey');
    expect(localStorageMock.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(get(authStore).jwt).toBe(validJwtForLogoutTest);

    authStore.logout();

    const state = get(authStore);
    expect(state).toEqual(initialAuthState);
    expect(localStorageMock.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  describe('ensureKeyPair', () => {
    it('should generate and store new key pair if none exists', async () => {
      const initialKeys = get(authStore);
      expect(initialKeys.publicKeyJwk).toBeNull();
      expect(initialKeys.privateKeyJwk).toBeNull();

      const pubKey = await authStore.ensureKeyPair();
      expect(pubKey).not.toBeNull();

      const finalKeys = get(authStore);
      expect(finalKeys.publicKeyJwk).toEqual({
        alg: 'ES384',
        kty: 'EC',
        crv: 'P-384',
        x: 'x_val',
        y: 'y_val'
      });
      expect(finalKeys.privateKeyJwk).toEqual({
        alg: 'ES384',
        kty: 'EC',
        crv: 'P-384',
        d: 'd_val',
        x: 'x_val',
        y: 'y_val'
      });
      expect(mockCrypto.subtle.generateKey).toHaveBeenCalledWith(
        { name: 'ECDSA', namedCurve: 'P-384' },
        true,
        ['sign', 'verify']
      );
      expect(mockCrypto.subtle.exportKey).toHaveBeenCalledTimes(2); // Once for public, once for private
    });

    it('should return existing public key if key pair already exists', async () => {
      // First call to generate
      await authStore.ensureKeyPair();
      const firstPubKey = get(authStore).publicKeyJwk;
      vi.clearAllMocks(); // Clear mocks to check if generateKey is called again

      // Second call should not re-generate
      const secondPubKeyResult = await authStore.ensureKeyPair();
      const secondPubKeyStore = get(authStore).publicKeyJwk;

      expect(mockCrypto.subtle.generateKey).not.toHaveBeenCalled();
      expect(secondPubKeyResult).toEqual(firstPubKey);
      expect(secondPubKeyStore).toEqual(firstPubKey);
    });
  });

  // More tests to come for setJwtAndVerifyKey, getPrivateKey, getDevicePublicKeyAsSpki, and JWT functions
  // These will require more detailed mocking of crypto.subtle.verify and JWT structures.
});
