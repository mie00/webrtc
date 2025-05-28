import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable, type Writable, derived } from 'svelte/store';

interface MockAuthStoreState {
  jwt: string | null;
  error: any | null; // Keeping error flexible for now, can be string | Error etc.
  user: { id: string } | null;
  publicKeyJwk: any | null;
  privateKeyJwk: any | null;
  userPubKey: string | null;
}

interface MockProfileStoreState {
  isProfileComplete: boolean;
  profile: { userName: string } | null;
  userName: string | null; // This was part of MockProfileStoreState, now part of Config's profile
}

const mockAuthStore = writable<MockAuthStoreState>({
  jwt: null,
  error: null,
  user: null,
  publicKeyJwk: null,
  privateKeyJwk: null,
  userPubKey: null
});

// Define Config type for the mockConfigStoreInstance
type Config = import('./lib/stores/configStore').Config;
let mockConfigStoreInstance: Writable<Config>;

// Mock child components to isolate App.svelte logic
vi.mock('./components/AuthHandler.svelte', () => ({
  default: (target: Element, anchor: Node | null, props?: any) => {
    const el = document.createElement('div');
    el.textContent = 'AuthHandlerMock';
    // Ensure target is a valid DOM element or a comment node for insertion
    if (
      target &&
      target.nodeType === 1 /* Node.ELEMENT_NODE */ &&
      typeof target.insertBefore === 'function'
    ) {
      target.insertBefore(el, anchor instanceof Node ? anchor : null);
    } else if (
      target &&
      (target.nodeType === 8 /* Node.COMMENT_NODE */ ||
        target.nodeType === 3) /* Node.TEXT_NODE */ &&
      target.parentNode &&
      typeof target.parentNode.insertBefore === 'function'
    ) {
      target.parentNode.insertBefore(el, target.nextSibling);
    } else {
      console.error(
        '[MOCK] AuthHandler: Invalid target for DOM manipulation or parentNode missing',
        { target, anchor }
      );
    }
    return {
      update: vi.fn((newProps: any) => {
        // console.log('[MOCK] AuthHandler update', newProps);
        // If props were actually passed and used, handle updates here.
      }),
      destroy: vi.fn(() => {
        // console.log('[MOCK] AuthHandler destroy');
        if (el.parentNode) el.remove();
      })
    };
  }
}));
vi.mock('./components/MainAppRouter.svelte', () => ({
  default: (target: Element, anchor: Node | null, props?: any) => {
    const el = document.createElement('div');
    el.textContent = 'MainAppRouterMock';
    if (
      target &&
      target.nodeType === 1 /* Node.ELEMENT_NODE */ &&
      typeof target.insertBefore === 'function'
    ) {
      target.insertBefore(el, anchor instanceof Node ? anchor : null);
    } else if (
      target &&
      (target.nodeType === 8 /* Node.COMMENT_NODE */ ||
        target.nodeType === 3) /* Node.TEXT_NODE */ &&
      target.parentNode &&
      typeof target.parentNode.insertBefore === 'function'
    ) {
      target.parentNode.insertBefore(el, target.nextSibling);
    } else {
      console.error(
        '[MOCK] MainAppRouter: Invalid target for DOM manipulation or parentNode missing',
        { target, anchor }
      );
    }
    return {
      update: vi.fn(),
      destroy: vi.fn(() => {
        if (el.parentNode) el.remove();
      })
    };
  }
}));
vi.mock('./components/ProfileSetup.svelte', () => ({
  default: (target: Element, anchor: Node | null, props?: any) => {
    const el = document.createElement('div');
    el.textContent = 'ProfileSetupMock';
    if (
      target &&
      target.nodeType === 1 /* Node.ELEMENT_NODE */ &&
      typeof target.insertBefore === 'function'
    ) {
      target.insertBefore(el, anchor instanceof Node ? anchor : null);
    } else if (
      target &&
      (target.nodeType === 8 /* Node.COMMENT_NODE */ ||
        target.nodeType === 3) /* Node.TEXT_NODE */ &&
      target.parentNode &&
      typeof target.parentNode.insertBefore === 'function'
    ) {
      target.parentNode.insertBefore(el, target.nextSibling);
    } else {
      console.error(
        '[MOCK] ProfileSetup: Invalid target for DOM manipulation or parentNode missing',
        { target, anchor }
      );
    }
    return {
      update: vi.fn(),
      destroy: vi.fn(() => {
        if (el.parentNode) el.remove();
      })
    };
  }
}));

// Mock stores

vi.mock('./lib/stores/authStore', () => ({
  authStore: mockAuthStore
}));

// Mock configStore
vi.mock('./lib/stores/configStore', async () => {
  // Note: 'writable' and 'derived' are now imported at the top level of the test file.
  const initialMockConfig: Config = {
    general: {
      configLoader: 'client',
      coordinatorUrl: 'ws://test.com',
      configHost: '',
      identityProviderHost: ''
    },
    profile: { userName: '' }, // Default to empty userName
    rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
    media: { blurVideo: 'no', audioDevice: 'default', videoDevice: 'default' }
  };
  // Create the actual store instance that will be used by the App
  mockConfigStoreInstance = writable(initialMockConfig); // Uses top-level writable
  return {
    configStore: mockConfigStoreInstance,
    updateConfig: vi.fn((group, key, value) => {
      mockConfigStoreInstance.update((cfg: Config) => { // Added Config type for cfg
        const newGroup = { ...cfg[group], [key]: value };
        return { ...cfg, [group]: newGroup };
      });
    }),
    isServerMode: derived( // Uses top-level derived
      mockConfigStoreInstance,
      ($config: Config) => $config.general.configLoader === 'server' // Added Config type for $config
    ),
    defaultConfig: initialMockConfig
  };
});

// Mock WebRTCApp
vi.mock('./lib/webrtc/WebRTCApp', () => ({
  WebRTCApp: vi.fn().mockImplementation(() => ({
    // Mock any methods used by App.svelte if necessary
  }))
}));

describe('App.svelte', () => {
  let App: any;

  beforeEach(async () => {
    App = (await import('./App.svelte')).default;
    // Reset store states before each test
    mockAuthStore.set({
      jwt: null,
      error: null,
      user: null,
      publicKeyJwk: null,
      privateKeyJwk: null,
      userPubKey: null
    });
    // Reset configStore to a known default for each test
    if (mockConfigStoreInstance) {
      // Ensure it's initialized by the mock factory
      mockConfigStoreInstance.set({
        general: {
          configLoader: 'client',
          coordinatorUrl: 'ws://test.com',
          configHost: '',
          identityProviderHost: ''
        },
        profile: { userName: '' }, // userName is empty by default
        rtc: { stunServers: '', turnServerV2: '', turnUsername: '', turnPassword: '' },
        media: { blurVideo: 'no', audioDevice: 'default', videoDevice: 'default' }
      });
    }
    // Reset window.location.pathname for consistent testing
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders AuthHandler', () => {
    render(App);
    // Since we mock AuthHandler to render 'AuthHandlerMock', we can check for that text.
    // Or, more robustly, check if the mock was called, if @testing-library/svelte supports that easily.
    // For now, checking for the placeholder text from the mock.
    expect(screen.getByText('AuthHandlerMock')).toBeInTheDocument();
  });

  it('renders ProfileSetup when authenticated but profile is not complete', async () => {
    mockAuthStore.set({
      jwt: 'test-jwt',
      error: null,
      user: { id: 'test' },
      publicKeyJwk: {},
      privateKeyJwk: {},
      userPubKey: 'test-key'
    });
    // configStore.profile.userName is already empty from beforeEach, so ProfileSetup should render
    render(App);
    await tick();
    expect(screen.getByText('ProfileSetupMock')).toBeInTheDocument();
  });

  it('renders MainAppRouter when authenticated and profile is complete', async () => {
    mockAuthStore.set({
      jwt: 'test-jwt',
      error: null,
      user: { id: 'test' },
      publicKeyJwk: {},
      privateKeyJwk: {},
      userPubKey: 'test-key'
    });
    // Set userName in the mocked configStore
    mockConfigStoreInstance.update((cfg: Config) => ({ // Added Config type for cfg
      ...cfg,
      profile: { ...cfg.profile, userName: 'TestUserProfile' }
    }));
    render(App);
    await tick();
    expect(screen.getByText('MainAppRouterMock')).toBeInTheDocument();
  });

  it('does not render ProfileSetup or MainAppRouter when not authenticated', () => {
    mockAuthStore.set({
      jwt: null,
      error: null,
      user: null,
      publicKeyJwk: null,
      privateKeyJwk: null,
      userPubKey: null
    });
    render(App);
    expect(screen.queryByText('ProfileSetupMock')).not.toBeInTheDocument();
    expect(screen.queryByText('MainAppRouterMock')).not.toBeInTheDocument();
  });

  it('does not render ProfileSetup or MainAppRouter on /cb path even if authenticated', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/cb' },
      writable: true
    });
    mockAuthStore.set({
      jwt: 'test-jwt',
      error: null,
      user: { id: 'test' },
      publicKeyJwk: null,
      privateKeyJwk: null,
      userPubKey: 'test-key'
    });
    // Set userName in the mocked configStore, though it won't matter for this test path
    mockConfigStoreInstance.update((cfg: Config) => ({ // Added Config type for cfg
      ...cfg,
      profile: { ...cfg.profile, userName: 'TestUserProfile' }
    }));
    render(App);
    expect(screen.queryByText('ProfileSetupMock')).not.toBeInTheDocument();
    expect(screen.queryByText('MainAppRouterMock')).not.toBeInTheDocument();
  });
});
