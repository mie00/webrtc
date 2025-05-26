import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSvelteMount = vi.fn();
const mockSvelteOnDestroy = vi.fn(); // Assuming it might be used, can be removed if not

vi.mock('svelte', async (importOriginal) => {
  const actualSvelte = (await importOriginal()) as any;
  return {
    ...actualSvelte,
    mount: mockSvelteMount,
    onDestroy: mockSvelteOnDestroy
  };
});

// Mock the Svelte app
vi.mock('./App.svelte', () => ({
  default: vi.fn() // Mock Svelte component constructor
}));

// Mock WebRTCApp
const mockWebRTCAppCleanup = vi.fn(() => {
  console.log('[mockWebRTCAppCleanup] Original spy CALLED');
}); // Define the spy here
vi.mock('./lib/webrtc/WebRTCApp.js', () => {
  console.log(
    '[Mock Factory] Defining MockedWebRTCApp. mockWebRTCAppCleanup is named:',
    mockWebRTCAppCleanup.getMockName()
  );
  class MockedWebRTCApp {
    config: any;
    cleanup: any; // Ensure cleanup is part of the class structure for type safety if needed

    constructor(config?: any) {
      this.config = config;
      console.log(
        '[MockedWebRTCApp constructor] Assigning this.cleanup. mockWebRTCAppCleanup is named:',
        mockWebRTCAppCleanup.getMockName()
      );
      this.cleanup = mockWebRTCAppCleanup; // Assign the specific spy
      // console.log('MockedWebRTCApp constructor original log line with config:', config); // Keep original if needed
      console.log(
        '[MockedWebRTCApp constructor] this.cleanup is now named:',
        this.cleanup.getMockName()
      );
      console.log(
        '[MockedWebRTCApp constructor] Is this.cleanup === mockWebRTCAppCleanup?',
        this.cleanup === mockWebRTCAppCleanup
      );
    }
    // Add other methods if main.ts calls them, e.g., initialize = vi.fn();
  }
  console.log('[Mock Factory] MockedWebRTCApp defined. Returning { WebRTCApp: MockedWebRTCApp }');
  return { WebRTCApp: MockedWebRTCApp };
});

describe('main.ts', () => {
  let mockAppDiv: HTMLElement;
  let addEventListenerSpy: any; // Declare spy here

  beforeEach(async () => {
    // Reset mocks before each test
    vi.resetModules();
    vi.clearAllMocks();

    // Mock document.getElementById
    mockAppDiv = document.createElement('div');
    mockAppDiv.setAttribute('id', 'app');
    document.body.appendChild(mockAppDiv);
    vi.spyOn(document, 'getElementById').mockReturnValue(mockAppDiv);

    // Set up spy on window.addEventListener BEFORE main.ts is imported
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    // Import main.ts after mocks are set up. This will execute the script.
    await import('./main.js');
  });

  afterEach(() => {
    // Clean up the DOM
    if (document.body.contains(mockAppDiv)) {
      document.body.removeChild(mockAppDiv);
    }
    // @ts-ignore
    delete window.WebRTCApp;
    // @ts-ignore
    if (addEventListenerSpy) addEventListenerSpy.mockRestore(); // Restore spy
    delete window.webRTCApp;
  });

  it('should attach WebRTCApp and its instance to the window object', async () => {
    // Check the class constructor on window
    expect(window.WebRTCApp).toBeDefined();
    expect(typeof window.WebRTCApp).toBe('function'); // It's used with "new"

    // Check the instance on window
    expect(window.webRTCApp).toBeDefined();
    expect(typeof window.webRTCApp).toBe('object');
    expect(window.webRTCApp).not.toBeNull();

    // Check a key property of the instance (e.g., the cleanup method)
    expect(window.webRTCApp.cleanup).toBeDefined();
    expect(typeof window.webRTCApp.cleanup).toBe('function');
    // We know from the other test that webRTCApp.cleanup is a spy and works
    expect(vi.isMockFunction(window.webRTCApp.cleanup)).toBe(true);
  });

  it('should initialize and mount the Svelte App', async () => {
    expect(document.getElementById).toHaveBeenCalledWith('app');
    const App = (await import('./App.svelte')).default;
    expect(mockSvelteMount).toHaveBeenCalledWith(App, { target: mockAppDiv });
  });

  it('should add beforeunload event listener for cleanup', async () => {
    const webRTCAppInstance = window.webRTCApp;

    // Check that main.ts (via beforeEach) added the listener correctly
    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    if (addEventListenerSpy.mock.calls.length > 0) {
      const beforeUnloadHandler = addEventListenerSpy.mock.calls[0][1];
      console.log('[Test] beforeUnloadHandler from spy is:', beforeUnloadHandler.toString());
    } else {
      console.log('[Test] addEventListenerSpy was not called, cannot get handler.');
    }

    // Log instance details for debugging
    console.log('[Test] webRTCAppInstance during test:', webRTCAppInstance);
    if (webRTCAppInstance && typeof webRTCAppInstance.cleanup === 'function') {
      console.log(
        '[Test] webRTCAppInstance.cleanup is the spy:',
        webRTCAppInstance.cleanup === mockWebRTCAppCleanup
      );
      console.log('[Test] webRTCAppInstance.constructor.name:', webRTCAppInstance.constructor.name);
    } else {
      console.log('[Test] webRTCAppInstance or cleanup is not as expected.');
    }

    // Simulate the beforeunload event
    window.dispatchEvent(new Event('beforeunload'));

    // Check that the cleanup mock was called as a result of the event
    expect(webRTCAppInstance.cleanup).toHaveBeenCalled();
  });

  it('should throw an error if target element is not found', async () => {
    // Reset modules to re-import main.ts in a different context
    vi.resetModules();
    // Ensure mocks from App.svelte and WebRTCApp.js are reapplied if resetModules clears them in a way that affects subsequent imports
    vi.mock('./App.svelte', () => ({ default: vi.fn() }));
    vi.mock('./lib/webrtc/WebRTCApp.js', () => ({
      WebRTCApp: vi.fn().mockImplementation(() => ({ cleanup: vi.fn() }))
    }));

    vi.spyOn(document, 'getElementById').mockReturnValue(null);

    try {
      await import('./main.js');
      // Should not reach here
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toBe("Target element 'app' not found in the DOM");
    }
  });
});
