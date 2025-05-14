import { describe, beforeEach, jest, test, expect } from '@jest/globals';
import * as forwardModule from '../../src/lib/forwardBridge.js'; // Import the module
// Import functions to be mocked
import { getDirectClient, getAllDirectClients } from '../../src/stores/connectionStore.js';
import { registerCleanup } from '../../src/stores/appStateStore.js';
import type { ForwardState } from '../../src/lib/forwardBridge.js';

// Mock the imported functions
jest.mock('./src/stores/connectionStore.js');
jest.mock('./src/stores/appStateStore.js');


/**
 * @jest-environment jsdom
 */

describe('Forward Channel', () => {
  let mockGetDirectClient: jest.MockedFunction<typeof getDirectClient>;
  let mockGetAllDirectClients: jest.MockedFunction<typeof getAllDirectClients>;
  let mockRegisterCleanup: jest.MockedFunction<typeof registerCleanup>;

  const initialForwardState: ForwardState = {
    allowedHost: null,
    forwardPeer: null,
    inflight: {}
  };

  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id: string): HTMLElement | null => {
      if (id === 'start-forward') {
        return {
          addEventListener: jest.fn(),
          textContent: '',
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          }
        } as any; // Cast return
      } else if (id === 'media') {
        return {
          appendChild: jest.fn()
        } as any; // Cast return
      } else if (id === 'chat') {
        return {
          select: jest.fn()
        } as any; // Cast return
      } else if (typeof id === 'string' && id.startsWith('log-')) { // Keep type check
        return {
          insertBefore: jest.fn(),
          firstChild: null,
          remove: jest.fn()
        } as any; // Cast return
      }
      return null;
    }) as jest.Mock;

    // Mock createElement
    document.createElement = jest.fn().mockImplementation((tag: string): HTMLElement => {
      return {
        id: '',
        src: '',
        classList: { add: jest.fn() },
        appendChild: jest.fn(),
        innerHTML: '',
        setAttribute: jest.fn()
      } as any;
    }) as jest.Mock;

    // Assign typed mocks
    mockGetDirectClient = getDirectClient as jest.MockedFunction<typeof getDirectClient>;
    mockGetAllDirectClients = getAllDirectClients as jest.MockedFunction<typeof getAllDirectClients>;
    mockRegisterCleanup = registerCleanup as jest.MockedFunction<typeof registerCleanup>;

    // Reset forwardStore to initial state
    forwardModule.forwardStore.set({ ...initialForwardState, inflight: {} }); // Ensure inflight is a new object

    // Mock navigator
    global.navigator = {
      serviceWorker: {
        register: jest.fn().mockResolvedValue({} as never),
        ready: Promise.resolve({ then: jest.fn() } as any),
        controller: { postMessage: jest.fn() } as any,
        addEventListener: jest.fn()
      } as any
    } as any;

    // Mock MessageChannel
    global.MessageChannel = jest.fn().mockImplementation(() => ({
      port1: { onmessage: null } as any,
      port2: { postMessage: jest.fn() } as any
    })) as any;

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Map([['Content-Type', 'text/plain']]),
      body: {
        getReader: jest.fn().mockReturnValue({
          read: jest.fn().mockResolvedValue({ done: true, value: new Uint8Array([]) } as never)
        })
      } as any
    } as Response) as jest.Mock;

    // Mock alert
    global.alert = jest.fn() as jest.Mock;

    // Mock URL
    global.URL = class {
      searchParams = { set: jest.fn() } as any;
      constructor() {}
    } as any;

    // Mock window
    global.window = {
      location: { href: 'http://example.com', host: 'example.com' } as any,
      history: { pushState: jest.fn() } as any,
      setInterval: jest.fn().mockReturnValue(123) as any,
      clearInterval: jest.fn() as any, // Add clearInterval mock
    } as any;

    // Mock prompt
    global.prompt = jest.fn().mockReturnValue('http://127.0.0.1:5000') as jest.Mock;

    jest.clearAllMocks();
  });

  test('forwardInit should set up cleanups and reset forward store state', () => {
    forwardModule.forwardInit();

    expect(mockRegisterCleanup).toHaveBeenCalledWith('forward', expect.any(Function));
    
    // Simulate cleanup call for full coverage if needed, though not strictly necessary for this test
    // const cleanupFn = mockRegisterCleanup.mock.calls[0][1];
    // cleanupFn(); // This would call setAllowedHost(null) and setForwardPeer(null)

    const state = forwardModule.getForwardState();
    expect(state.allowedHost).toBeNull();
    expect(state.forwardPeer).toBeNull();
  });

  test('setupForwardChannel should create a data channel on the client', () => {
    const mockPc = {
      createDataChannel: jest.fn().mockReturnValue({
        onopen: null,
        onmessage: null,
        send: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      })
    };
    const mockClient = {
      pc: mockPc,
      // Add other properties if forwardBridge expects them on the client object
    } as any; // Cast to any to simplify mock client structure

    mockGetDirectClient.mockReturnValue(mockClient);

    forwardModule.setupForwardChannel('test-client-id');

    expect(mockGetDirectClient).toHaveBeenCalledWith('test-client-id');
    expect(mockPc.createDataChannel).toHaveBeenCalledWith(
      'forward',
      { negotiated: true, id: 3 }
    );
  });

  test('concatUint8Arrays should correctly concatenate arrays', () => {
    // Create test arrays
    const array1 = new Uint8Array([1, 2, 3]);
    const array2 = new Uint8Array([4, 5]);
    const array3 = new Uint8Array([6, 7, 8, 9]);
    
    // Call the function
    // Call the function - Assuming concatUint8Arrays exists and is correctly typed
    const result = forwardModule.concatUint8Arrays([array1, array2, array3]);

    // Verify the result
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });
});
