import { describe, beforeEach, jest, test, expect } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

describe('Forward Channel', () => {
  beforeEach(() => {
    // Setup DOM mocks
    document.getElementById = jest.fn().mockImplementation((id) => {
      if (id === 'start-forward') {
        return {
          addEventListener: jest.fn(),
          textContent: '',
          classList: {
            add: jest.fn(),
            remove: jest.fn()
          }
        };
      } else if (id === 'media') {
        return {
          appendChild: jest.fn()
        };
      } else if (id === 'chat') {
        return {
          select: jest.fn()
        };
      } else if (id.startsWith('log-')) {
        return {
          insertBefore: jest.fn(),
          firstChild: null,
          remove: jest.fn()
        };
      } else if (typeof id === 'string' && id.startsWith('log-')) { // Check type before calling startsWith
        return {
          insertBefore: jest.fn(),
          firstChild: null,
          remove: jest.fn()
        };
      }
      return null; // Return null for unhandled IDs
    });

    // Mock createElement with type assertion
    document.createElement = jest.fn().mockImplementation((tag: string) => {
      return {
        id: '',
        src: '',
        classList: {
          add: jest.fn()
        },
        appendChild: jest.fn(),
        innerHTML: '',
        setAttribute: jest.fn()
      };
    });

    // Mock global.app with type assertion
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
      // Add other required App properties if needed
      viewStreams: {},
      config: {},
      nego_messages: {},
      nego_handlers: {},
    };

    // Mock navigator with type assertions
    global.navigator = {
      serviceWorker: {
        register: jest.fn().mockResolvedValue({}), // Cast resolved value
        ready: Promise.resolve({ then: jest.fn() }), // Cast resolved value
        controller: {
          postMessage: jest.fn()
        }, // Cast controller
        addEventListener: jest.fn()
      }
    };

    // Mock MessageChannel with type assertion
    global.MessageChannel = jest.fn().mockImplementation(() => ({
      port1: { onmessage: null }
    }));

    // Mock fetch with type assertion
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Map([['Content-Type', 'text/plain']]),
      body: {
        getReader: jest.fn().mockReturnValue({
          read: jest.fn().mockResolvedValue({ done: true, value: new Uint8Array([]) }) // Cast resolved value
        })
      }
    }); // Cast resolved value

    // Mock alert with type assertion
    global.alert = jest.fn();

    // Mock URL with type assertion
    global.URL = class {
      searchParams = { // Define property directly
        set: jest.fn()
      };
      constructor() {} // Add constructor
    };

    // Mock window with type assertions
    global.window = {
      location: {
        href: 'http://example.com',
        host: 'example.com'
        // Add other Location properties if needed by tests, or cast
      },
      history: {
        pushState: jest.fn()
        // Add other History properties if needed by tests, or cast
      },
      setInterval: jest.fn().mockReturnValue(123)
    };

    // Mock prompt with type assertion
    global.prompt = jest.fn().mockReturnValue('http://127.0.0.1:5000');


    jest.clearAllMocks();
  });


  test('forwardInit should set up cleanups and initial state', () => { // No longer needs async
    // Use the imported module variable and global.app
    forwardModule.forwardInit(global.app);

    // Verify the cleanups were set up
    expect(global.app.cleanups['forward']).toBeDefined();
    expect(global.app.allowed_host).toBeNull();
  });

  test('setupForwardChannel should create a data channel', () => { // No longer needs async
    // Use the imported module variable and global.app
    forwardModule.setupForwardChannel(global.app, 'test-client-id');

    // Verify the data channel was created
    expect(global.app.clients['test-client-id'].pc.createDataChannel).toHaveBeenCalledWith(
      'forward',
      { negotiated: true, id: 3 }
    );
  });

  test('concatUint8Arrays should correctly concatenate arrays', () => { // No longer needs async
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
