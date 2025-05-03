import { describe, beforeEach, jest, test, expect, beforeAll } from '@jest/globals';
import * as forwardModule from '../../src/lib/forwardBridge.js'; // Import the module
import type { App } from '../../types/global'; // Import App type

/**
 * @jest-environment jsdom
 */

// Declare module variable at the top level
// let forwardModule: typeof import('../../src/lib/forwardBridge.js'); // No longer needed

describe('Forward Channel', () => {
  // beforeAll(async () => { // No longer needed if importing statically
  //   // Dynamically import the module once before all tests
  //   forwardModule = await import('../../src/lib/forwardBridge.js');
  // });

  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id): HTMLElement | null => { // Add return type
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
    }) as jest.Mock; // Cast the mock function itself

    // Mock createElement with type assertion
    document.createElement = jest.fn().mockImplementation((tag: string): HTMLElement => { // Add return type
      return {
        id: '',
        src: '',
        classList: {
          add: jest.fn()
        },
        appendChild: jest.fn(),
        innerHTML: '',
        setAttribute: jest.fn()
      } as any; // Cast return value
    }) as jest.Mock; // Cast the mock function itself

    // Mock global.app (type handled by jest-globals.d.ts)
    global.app = {
      clients: {
        'test-client-id': {
          pc: {
            createDataChannel: jest.fn().mockReturnValue({
              onopen: null,
              onmessage: null,
              send: jest.fn(),
              addEventListener: jest.fn(),
              removeEventListener: jest.fn()
            })
          },
          forward: {
            send: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
          }
        }
      },
      cleanups: {},
      inflight: {},
      viewStreams: {},
      config: {},
      nego_messages: {},
      nego_handlers: {},
    } as App; // Cast to App type

    // Mock navigator with type assertions (casting to any)
    global.navigator = {
      serviceWorker: {
        register: jest.fn().mockResolvedValue({} as never), // Fix resolved value type
        ready: Promise.resolve({ then: jest.fn() } as any), // Cast resolved value
        controller: {
          postMessage: jest.fn()
        } as any, // Cast controller
        addEventListener: jest.fn()
      } as any // Cast serviceWorker
    } as any; // Cast navigator

    // Mock MessageChannel with type assertion (casting to any)
    global.MessageChannel = jest.fn().mockImplementation(() => ({
      port1: { onmessage: null } as any, // Cast port1
      port2: { postMessage: jest.fn() } as any // Add port2 for completeness
    })) as any; // Cast mock

    // Mock fetch with type assertion (casting to any)
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Map([['Content-Type', 'text/plain']]),
      body: {
        getReader: jest.fn().mockReturnValue({
          read: jest.fn().mockResolvedValue({ done: true, value: new Uint8Array([]) } as never) // Fix resolved value type
        })
      } as any // Cast body
    } as any) as jest.Mock; // Cast resolved value and mock

    // Mock alert with type assertion
    global.alert = jest.fn();

    // Mock URL with type assertion (casting to any)
    global.URL = class {
      searchParams = { // Define property directly
        set: jest.fn()
      } as any; // Cast searchParams
      constructor() {}
    } as any; // Cast class

    // Mock window with type assertions (casting to any)
    global.window = {
      location: {
        href: 'http://example.com',
        host: 'example.com'
      } as any, // Cast location
      history: {
        pushState: jest.fn()
      } as any, // Cast history
      setInterval: jest.fn().mockReturnValue(123) as any // Cast setInterval
    } as any; // Cast window

    // Mock prompt (type handled by jest-globals.d.ts)
    global.prompt = jest.fn().mockReturnValue('http://127.0.0.1:5000');


    jest.clearAllMocks();
  });


  test('forwardInit should set up cleanups and initial state', () => {
    // Use the imported module variable and global.app
    forwardModule.forwardInit(global.app!); // Use non-null assertion

    // Verify the cleanups were set up
    expect(global.app!.cleanups['forward']).toBeDefined(); // Use non-null assertion
    expect((global.app as any).allowed_host).toBeNull(); // Cast app for allowed_host
  });

  test('setupForwardChannel should create a data channel', () => {
    // Use the imported module variable and global.app
    forwardModule.setupForwardChannel(global.app!, 'test-client-id'); // Use non-null assertion

    // Verify the data channel was created
    expect(global.app!.clients['test-client-id'].pc!.createDataChannel).toHaveBeenCalledWith( // Use non-null assertion
      'forward',
      { negotiated: true, id: 3 }
    );
  });

  test('concatUint8Arrays should correctly concatenate arrays', () => {
    // Use the imported module variable
    // Create test arrays
    const array1 = new Uint8Array([1, 2, 3]);
    const array2 = new Uint8Array([4, 5]);
    const array3 = new Uint8Array([6, 7, 8, 9]);
    
    // Call the function
    const result = forwardModule.concatUint8Arrays([array1, array2, array3]);
    
    // Verify the result
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });
});
