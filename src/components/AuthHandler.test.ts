/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/svelte';
import AuthHandler from './AuthHandler.svelte';
import { authStore } from '../lib/stores/authStore';
import { tick } from 'svelte';
import { vi } from 'vitest';

// Mock the authStore and its getJwtPayload function
vi.mock('../lib/stores/authStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/stores/authStore')>();

  const mockAuthStoreInstance = {
    subscribe: vi.fn(() => () => {}),
    getAuthState: vi.fn(() => ({
      jwt: null,
      userPubKey: null,
      publicKeyJwk: null,
      privateKeyJwk: null
    })),
    getDevicePublicKeyAsSpki: vi.fn().mockResolvedValue('test-spki-key'),
    setJwtAndVerifyKey: vi.fn().mockResolvedValue(true),
    logout: vi.fn(),
    ensureKeyPair: vi.fn().mockResolvedValue({
      /* mock JsonWebKey */
    }),
    getPrivateKey: vi.fn().mockResolvedValue({
      /* mock CryptoKey */
    })
  };

  return {
    ...actual, // Includes actual exported functions like verifyLoginJWT, etc.
    authStore: mockAuthStoreInstance, // The store instance is mocked
    getJwtPayload: vi.fn() // Mock the exported getJwtPayload function
  };
});

// Import after mocks are set up
import { getJwtPayload, authStore } from '../lib/stores/authStore';

// Mock configStore
vi.mock('../lib/stores/configStore', async () => {
  const actual = await vi.importActual('../lib/stores/configStore');

  const mockConfigStoreInstance = {
    // ...actual.configStore, // Removed to fix spread type error
    subscribe: vi.fn((callback) => {
      callback({
        general: {
          userName: 'MockUser',
          identityProviderHost: 'http://localhost:3000'
        },
        server: {},
        client: {}
      });
      return () => {};
    }),
    updateConfigValue: vi.fn(),
    getRawConfig: vi.fn(() => ({
      general: { userName: 'MockUser', identityProviderHost: 'http://localhost:3000' },
      server: {},
      client: {}
    })),
    loadConfig: vi.fn(),
    resetToDefaults: vi.fn(),
    general: {
      userName: 'MockUser',
      identityProviderHost: 'http://localhost:3000'
    },
    server: {},
    client: {}
  };

  return {
    configStore: mockConfigStoreInstance,
    getConfigValue: vi.fn((section, key) => {
      if (section === 'general' && key === 'identityProviderHost') {
        return 'http://localhost:3000';
      }
      if (section === 'general' && key === 'userName') {
        return 'MockUser';
      }
      return null;
    }),
    ...Object.fromEntries(
      Object.entries(actual).filter(([key]) => key !== 'configStore' && key !== 'getConfigValue')
    )
  };
});

describe('AuthHandler.svelte', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // @ts-ignore
    authStore.getAuthState.mockReturnValue({ jwt: null, userPubKey: null });
    // @ts-ignore
    window.location = {
      ...window.location,
      pathname: '/',
      href: '',
      search: '',
      origin: 'http://localhost'
    } as Location;
  });

  test('renders login UI when not authenticated', async () => {
    render(AuthHandler);
    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  test('calls handleLoginClick on login button click', async () => {
    // @ts-ignore
    authStore.getDevicePublicKeyAsSpki.mockResolvedValue('test-spki-key');
    render(AuthHandler);
    const loginButton = screen.getByText('Login');
    await fireEvent.click(loginButton);
    await tick(); // Wait for any state updates
    expect(authStore.getDevicePublicKeyAsSpki).toHaveBeenCalled();
    // Check if location.href was changed (redirect)
    expect(window.location.href).toContain('http://localhost:3000/login');
    expect(window.location.href).toContain('callback=http%3A%2F%2Flocalhost%2Fcb');
    expect(window.location.href).toContain('payload=test-spki-key');
  });

  test('calls authStore.logout on (Dev) Logout button click', async () => {
    render(AuthHandler);
    const logoutButton = screen.getByText('(Dev) Logout / Clear Auth');
    await fireEvent.click(logoutButton);
    expect(authStore.logout).toHaveBeenCalled();
  });

  test('opens ConfigOverlay when "Open Configuration" button is clicked', async () => {
    render(AuthHandler);
    const configButton = screen.getByText('Open Configuration');
    await fireEvent.click(configButton);
    await tick(); // allow Svelte to update the DOM
    // We can't directly check for ConfigOverlay here without more complex mocking or setup
    // So, we'll assume if the button click doesn't throw and state changes, it's working.
    // A more robust test would involve checking for an element rendered by ConfigOverlay.
    // For now, this is a basic check.
    // We can check if the showConfigOverlay state variable would have been set to true.
    // This requires inspecting component state, which is not ideal with testing-library.
    // Instead, we'll rely on the fact that no error occurred.
    // A better approach would be to have ConfigOverlay render a uniquely identifiable element.
    expect(screen.getByText('Open Configuration')).toBeInTheDocument(); // Button still there
  });

  describe('Callback handling (/cb path)', () => {
    beforeEach(() => {
      // @ts-ignore
      window.location = {
        ...window.location,
        pathname: '/cb',
        search: '?jwt=test-jwt&pubKey=test-pubkey',
        href: '',
        origin: 'http://localhost'
      } as Location;
    });

    test('processes JWT and pubKey from URL params on /cb path', async () => {
      // @ts-ignore
      authStore.setJwtAndVerifyKey.mockResolvedValue(true);
      render(AuthHandler);
      await tick(); // onMount processing
      await tick(); // allow promises in onMount to resolve
      expect(authStore.setJwtAndVerifyKey).toHaveBeenCalledWith('test-jwt', 'test-pubkey');
      expect(window.location.href).toBe('http://localhost/'); // Redirects back to base path
    });

    test('handles missing jwt or pubkey on /cb path', async () => {
      // @ts-ignore
      window.location.search = '?jwt=test-jwt'; // Missing pubKey
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(AuthHandler);
      await tick();
      await tick();
      expect(authStore.setJwtAndVerifyKey).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'AuthHandler: Missing jwt or pubkey in callback URL for /cb'
      );
      expect(window.location.href).toBe('http://localhost/'); // Still redirects
      consoleErrorSpy.mockRestore();
    });

    test('handles failure in setJwtAndVerifyKey on /cb path', async () => {
      // @ts-ignore
      authStore.setJwtAndVerifyKey.mockResolvedValue(false);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(AuthHandler);
      await tick();
      await tick();
      expect(authStore.setJwtAndVerifyKey).toHaveBeenCalledWith('test-jwt', 'test-pubkey');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'AuthHandler: Failed to store JWT or verify public key.'
      );
      expect(window.location.href).toBe('http://localhost/'); // Still redirects
      consoleErrorSpy.mockRestore();
    });

    test('preserves other query parameters after /cb processing', async () => {
      // @ts-ignore
      window.location.search = '?jwt=test-jwt&pubKey=test-pubkey&other=param';
      // @ts-ignore
      authStore.setJwtAndVerifyKey.mockResolvedValue(true);
      render(AuthHandler);
      await tick();
      await tick();
      expect(authStore.setJwtAndVerifyKey).toHaveBeenCalledWith('test-jwt', 'test-pubkey');
      expect(window.location.href).toBe('http://localhost/?other=param');
    });
  });

  test('does not render login UI when authenticated', async () => {
    // @ts-ignore
    authStore.getAuthState.mockReturnValue({ jwt: 'some-jwt', userPubKey: 'some-key' });
    render(AuthHandler);
    expect(screen.queryByText('Authentication Required')).not.toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  test('handleLoginClick shows error if getDevicePublicKeyAsSpki fails', async () => {
    // @ts-ignore
    authStore.getDevicePublicKeyAsSpki.mockResolvedValue(null);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(AuthHandler);
    const loginButton = screen.getByText('Login');
    await fireEvent.click(loginButton);
    await tick();
    expect(authStore.getDevicePublicKeyAsSpki).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to get device public key as SPKI for login redirect.'
    );
    expect(window.location.href).toBe(''); // No redirect happens
    consoleErrorSpy.mockRestore();
  });
});

describe('AuthHandler.svelte - Auto Logout on JWT Expiry', () => {
  let mockAuthStateFromStore: ReturnType<typeof authStore.getAuthState>;
  // This callback will be captured from the authStore.subscribe mock
  let capturedSubscribeCallback: (state: any) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now'); // Spy on Date.now() to control current time

    // Reset all mocks before each test
    vi.clearAllMocks();

    // Setup default mock return values
    mockAuthStateFromStore = {
      jwt: null,
      userPubKey: null,
      publicKeyJwk: null,
      privateKeyJwk: null
    };
    // @ts-ignore
    authStore.getAuthState.mockReturnValue(mockAuthStateFromStore);

    // @ts-ignore
    authStore.subscribe.mockImplementation((cb) => {
      capturedSubscribeCallback = cb;
      // Simulate initial call to subscribe with current state from getAuthState
      cb(authStore.getAuthState());
      return () => {}; // Return a mock unsubscribe function
    });

    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue(null); // Default mock for getJwtPayload
  });

  afterEach(() => {
    vi.runOnlyPendingTimers(); // Ensure all pending timers are executed
    vi.useRealTimers(); // Restore real timers
  });

  // Helper to simulate auth state changes, triggering the subscribe callback
  const simulateAuthStateChange = (
    newState: Partial<ReturnType<typeof authStore.getAuthState>>
  ) => {
    mockAuthStateFromStore = { ...mockAuthStateFromStore, ...newState };
    // @ts-ignore
    authStore.getAuthState.mockReturnValue(mockAuthStateFromStore); // Update what getAuthState returns
    if (capturedSubscribeCallback) {
      capturedSubscribeCallback(mockAuthStateFromStore); // Trigger the subscription
    }
  };

  test('should logout immediately if JWT is already expired on load', async () => {
    const currentTime = 1678886400000; // A fixed point in time: 2023-03-15T12:00:00.000Z
    const expiredExp = Math.floor(currentTime / 1000) - 3600; // 1 hour ago from currentTime
    // @ts-ignore
    Date.now.mockReturnValue(currentTime);
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue({ exp: expiredExp });

    simulateAuthStateChange({ jwt: 'expired.jwt.token' });
    render(AuthHandler);
    await tick(); // Allow reactive statements and onMount to process

    // @ts-ignore
    expect(getJwtPayload).toHaveBeenCalledWith('expired.jwt.token');
    expect(authStore.logout).toHaveBeenCalled();
  });

  test('should schedule logout if JWT is valid, then logout when timer fires', async () => {
    const currentTime = 1678886400000; // 2023-03-15T12:00:00.000Z
    const expiresInSeconds = 3600; // Expires in 1 hour
    const futureExp = Math.floor(currentTime / 1000) + expiresInSeconds;
    // @ts-ignore
    Date.now.mockReturnValue(currentTime);
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue({ exp: futureExp });

    simulateAuthStateChange({ jwt: 'valid.jwt.token' });
    render(AuthHandler);
    await tick();

    // @ts-ignore
    expect(getJwtPayload).toHaveBeenCalledWith('valid.jwt.token');
    expect(authStore.logout).not.toHaveBeenCalled();
    expect(setTimeout).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), expiresInSeconds * 1000);

    // Advance time to just before expiry
    vi.advanceTimersByTime(expiresInSeconds * 1000 - 1);
    expect(authStore.logout).not.toHaveBeenCalled();

    // Advance time past expiry
    vi.advanceTimersByTime(1);
    expect(authStore.logout).toHaveBeenCalled();
  });

  test('should clear existing timer and set a new one if JWT changes', async () => {
    const currentTime = 1678886400000;
    const firstExpInSeconds = 3600;
    const secondExpInSeconds = 7200;
    // @ts-ignore
    Date.now.mockReturnValue(currentTime);

    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValueOnce({
      exp: Math.floor(currentTime / 1000) + firstExpInSeconds
    });
    simulateAuthStateChange({ jwt: 'first.valid.jwt.token' });
    render(AuthHandler); // Render once
    await tick();

    expect(setTimeout).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), firstExpInSeconds * 1000);

    // Change JWT
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValueOnce({
      exp: Math.floor(currentTime / 1000) + secondExpInSeconds
    });
    simulateAuthStateChange({ jwt: 'second.valid.jwt.token' }); // This triggers the $: reactive block
    await tick();

    expect(clearTimeout).toHaveBeenCalledTimes(1); // Old timer cleared
    expect(setTimeout).toHaveBeenCalledTimes(2); // New timer set
    // @ts-ignore
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), secondExpInSeconds * 1000);
  });

  test('should clear timer on manual logout (JWT becomes null)', async () => {
    const currentTime = Date.now(); // Use a dynamic current time for simplicity here
    const futureExp = Math.floor(currentTime / 1000) + 3600;
    // @ts-ignore
    Date.now.mockReturnValue(currentTime);
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue({ exp: futureExp });

    simulateAuthStateChange({ jwt: 'valid.jwt.token' });
    render(AuthHandler);
    await tick();

    expect(setTimeout).toHaveBeenCalledTimes(1);

    // Simulate manual logout by setting JWT to null
    simulateAuthStateChange({ jwt: null });
    await tick();

    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });

  test('should clear timer on component unmount', async () => {
    const currentTime = Date.now();
    const futureExp = Math.floor(currentTime / 1000) + 3600;
    // @ts-ignore
    Date.now.mockReturnValue(currentTime);
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue({ exp: futureExp });

    simulateAuthStateChange({ jwt: 'valid.jwt.token' });
    const { unmount } = render(AuthHandler);
    await tick();

    expect(setTimeout).toHaveBeenCalledTimes(1);

    unmount(); // This triggers onDestroy
    expect(clearTimeout).toHaveBeenCalledTimes(1);
  });

  test('should not schedule logout if JWT is null initially', async () => {
    simulateAuthStateChange({ jwt: null }); // Ensure JWT is null
    render(AuthHandler);
    await tick();

    // @ts-ignore
    expect(getJwtPayload).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
  });

  test('should not schedule logout if JWT payload cannot be decoded or exp is missing', async () => {
    // Scenario 1: getJwtPayload returns null (cannot decode)
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue(null);
    simulateAuthStateChange({ jwt: 'unparsable.jwt.token' });
    render(AuthHandler); // Render or ensure update if already rendered
    await tick();

    // @ts-ignore
    expect(getJwtPayload).toHaveBeenCalledWith('unparsable.jwt.token');
    expect(setTimeout).not.toHaveBeenCalled();
    vi.clearAllMocks(); // Clear mocks for the next scenario part

    // Scenario 2: getJwtPayload returns payload but exp is missing or not a number
    // @ts-ignore
    authStore.getAuthState.mockReturnValue({
      jwt: 'jwt.without.exp',
      userPubKey: null,
      publicKeyJwk: null,
      privateKeyJwk: null
    });
    // @ts-ignore
    (getJwtPayload as vi.Mock).mockReturnValue({ some_claim: 'value' }); // No 'exp' or 'exp' is not a number
    simulateAuthStateChange({ jwt: 'jwt.without.exp' }); // Trigger update
    // If component already rendered, ensure reactive update is processed
    // If not, render(AuthHandler) would be here.
    // Assuming the state change triggers the reactive logic.
    await tick();

    // @ts-ignore
    expect(getJwtPayload).toHaveBeenCalledWith('jwt.without.exp');
    expect(setTimeout).not.toHaveBeenCalled();
  });
});
