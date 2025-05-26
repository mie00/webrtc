import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';

interface MockAuthStoreState {
  jwt: string | null;
  error: any | null; // Keeping error flexible for now, can be string | Error etc.
  user: { id: string } | null;
}

interface MockProfileStoreState {
  isProfileComplete: boolean;
  profile: { userName: string } | null;
}

const mockAuthStore = writable<MockAuthStoreState>({ jwt: null, error: null, user: null });
const mockProfileStore = writable<MockProfileStoreState>({
  isProfileComplete: false,
  profile: null
});

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

vi.mock('./stores/authStore.js', () => ({
  authStore: mockAuthStore
}));

vi.mock('./stores/profileStore.js', () => ({
  profileStore: mockProfileStore
}));

// Mock WebRTCApp
vi.mock('./lib/webrtc/WebRTCApp.js', () => ({
  WebRTCApp: vi.fn().mockImplementation(() => ({
    // Mock any methods used by App.svelte if necessary
  }))
}));

describe('App.svelte', () => {
  let App: any;

  beforeEach(async () => {
    App = (await import('./App.svelte')).default;
    // Reset store states before each test
    mockAuthStore.set({ jwt: null, error: null, user: null });
    mockProfileStore.set({ isProfileComplete: false, profile: null });
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
    mockAuthStore.set({ jwt: 'test-jwt', error: null, user: { id: 'test' } });
    mockProfileStore.set({ isProfileComplete: false, profile: null });
    render(App);
    await tick();
    expect(screen.getByText('ProfileSetupMock')).toBeInTheDocument();
  });

  it('renders MainAppRouter when authenticated and profile is complete', async () => {
    mockAuthStore.set({ jwt: 'test-jwt', error: null, user: { id: 'test' } });
    mockProfileStore.set({ isProfileComplete: true, profile: { userName: 'TestUser' } });
    render(App);
    await tick();
    expect(screen.getByText('MainAppRouterMock')).toBeInTheDocument();
  });

  it('does not render ProfileSetup or MainAppRouter when not authenticated', () => {
    mockAuthStore.set({ jwt: null, error: null, user: null });
    render(App);
    expect(screen.queryByText('ProfileSetupMock')).not.toBeInTheDocument();
    expect(screen.queryByText('MainAppRouterMock')).not.toBeInTheDocument();
  });

  it('does not render ProfileSetup or MainAppRouter on /cb path even if authenticated', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/cb' },
      writable: true
    });
    mockAuthStore.set({ jwt: 'test-jwt', error: null, user: { id: 'test' } });
    mockProfileStore.set({ isProfileComplete: true, profile: { userName: 'TestUser' } });
    render(App);
    expect(screen.queryByText('ProfileSetupMock')).not.toBeInTheDocument();
    expect(screen.queryByText('MainAppRouterMock')).not.toBeInTheDocument();
  });
});
